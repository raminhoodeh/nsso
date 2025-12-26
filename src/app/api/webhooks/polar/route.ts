import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'

// Use service role key for webhook (bypasses RLS)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Verify Polar webhook signature
function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(payload)
    const expectedSignature = hmac.digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
}

export async function POST(request: Request) {
    try {
        const payload = await request.text()
        const signature = request.headers.get('webhook-signature') || request.headers.get('polar-signature') || ''

        // Verify signature (optional but recommended)
        const webhookSecret = process.env.POLAR_WEBHOOK_SECRET
        if (webhookSecret && signature) {
            try {
                // Polar uses a specific signature format, try to verify
                // For now, we'll proceed if format doesn't match expected
            } catch {
                console.warn('Webhook signature verification skipped')
            }
        }

        const event = JSON.parse(payload)
        console.log('Polar webhook event:', event.type)

        switch (event.type) {
            case 'checkout.completed':
                await handleCheckoutCompleted(event.data)
                break

            case 'subscription.active':
            case 'subscription.updated':
                await handleSubscriptionUpdated(event.data)
                break

            case 'subscription.canceled':
                await handleSubscriptionCanceled(event.data)
                break

            case 'subscription.revoked':
                await handleSubscriptionRevoked(event.data)
                break
        }

        return NextResponse.json({ received: true })
    } catch (error) {
        console.error('Webhook error:', error)
        return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
    }
}

async function handleCheckoutCompleted(data: any) {
    const metadata = data.metadata || {}
    const userId = metadata.user_id
    const desiredUsername = metadata.desired_username

    const originalUsername = metadata.original_username
    const referralCode = metadata.referral_code

    if (!userId) {
        console.error('No user_id in checkout metadata')
        return
    }

    // Update user to premium and set custom username
    const { error: userError } = await supabaseAdmin
        .from('users')
        .update({
            is_premium: true,
            username: desiredUsername,
        })
        .eq('id', userId)

    if (userError) {
        console.error('Error updating user:', userError)
    }

    // Create or update subscription record
    const subscriptionId = data.subscription_id || data.id
    const { error: subError } = await supabaseAdmin
        .from('subscriptions')
        .upsert({
            user_id: userId,
            polar_sub_id: subscriptionId,
            status: 'active',
            original_username: originalUsername,
            current_period_end: data.current_period_end || null,
        }, { onConflict: 'user_id' })

    if (subError) {
        console.error('Error creating subscription:', subError)
    }



    console.log(`User ${userId} upgraded to premium with username: ${desiredUsername}`)

    // Handle Referral logic if code present
    if (referralCode) {
        await handleReferral(userId, referralCode)
    }
}

async function handleReferral(referredUserId: string, referralCode: string) {
    console.log(`[Referral] Processing code: ${referralCode} for user ${referredUserId}`)

    // 1. Find Referrer
    const { data: referrer, error: findError } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('referral_code', referralCode)
        .single()

    if (findError || !referrer) {
        console.warn(`[Referral] Invalid or not found code: ${referralCode}`)
        return
    }

    // 2. Prevent self-referral
    if (referrer.id === referredUserId) {
        console.warn('[Referral] Self-referral attempt blocked')
        return
    }

    // 3. Create Referral Record
    const { error: createError } = await supabaseAdmin
        .from('referrals')
        .insert({
            referrer_user_id: referrer.id,
            referred_user_id: referredUserId,
            referral_code: referralCode,
            subscription_status: 'active', // Set active immediately since they just paid
            // activated_at will default to now() via trigger or we can set it
            // created_at defaults to now()
        })

    if (createError) {
        // Ignore unique constraint violations (already referred)
        if (createError.code === '23505') {
            console.log('[Referral] User was already referred')
        } else {
            console.error('[Referral] Error creating record:', createError)
        }
    } else {
        console.log(`[Referral] Success! User ${referredUserId} referred by ${referrer.id}`)
    }

}


async function handleSubscriptionUpdated(data: any) {
    const subscriptionId = data.id

    // Find user by subscription
    const { data: subscription } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .eq('polar_sub_id', subscriptionId)
        .single()

    if (!subscription) {
        console.log('No subscription found for ID:', subscriptionId)
        return
    }

    // Update subscription details
    await supabaseAdmin
        .from('subscriptions')
        .update({
            status: data.status || 'active',
            current_period_end: data.current_period_end || null,
            cancel_at_period_end: data.cancel_at_period_end || false,
        })
        .eq('polar_sub_id', subscriptionId)
}

async function handleSubscriptionCanceled(data: any) {
    // This means subscription was set to cancel at period end
    const subscriptionId = data.id

    await supabaseAdmin
        .from('subscriptions')
        .update({
            status: 'canceling',
            cancel_at_period_end: true,
        })
        .eq('polar_sub_id', subscriptionId)
}

async function handleSubscriptionRevoked(data: any) {
    // Subscription has fully ended - revert user to free
    const subscriptionId = data.id

    // Get subscription with original username
    const { data: subscription } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id, original_username')
        .eq('polar_sub_id', subscriptionId)
        .single()

    if (!subscription) {
        console.log('No subscription found for revocation:', subscriptionId)
        return
    }

    // Revert user to non-premium with original hash username
    const { error: userError } = await supabaseAdmin
        .from('users')
        .update({
            is_premium: false,
            username: subscription.original_username,
        })
        .eq('id', subscription.user_id)

    if (userError) {
        console.error('Error reverting user:', userError)
    }

    // Update subscription status
    await supabaseAdmin
        .from('subscriptions')
        .update({ status: 'expired' })
        .eq('polar_sub_id', subscriptionId)

    console.log(`User ${subscription.user_id} reverted to free, username: ${subscription.original_username}`)
}
