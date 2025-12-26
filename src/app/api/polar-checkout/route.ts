import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const POLAR_API_URL = process.env.POLAR_API_URL || 'https://sandbox-api.polar.sh/v1'

export async function POST(request: Request) {
    try {
        const { desiredUsername } = await request.json()

        if (!desiredUsername) {
            return NextResponse.json({ error: 'Desired username required' }, { status: 400 })
        }

        const supabase = await createClient()

        // Get current user
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get user's current data
        const { data: userData } = await supabase
            .from('users')
            .select('username')
            .eq('id', authUser.id)
            .single()

        // Create Polar checkout session via direct API call
        const token = process.env.POLAR_ACCESS_TOKEN
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

        // Get referral code from cookies
        const cookieStore = request.headers.get('cookie') || ''
        const referralCodeMatch = cookieStore.match(/referral_code=([^;]+)/)
        const referralCode = referralCodeMatch ? referralCodeMatch[1] : null

        console.log('[PolarCheckout] Starting checkout for:', desiredUsername)
        if (referralCode) {
            console.log('[PolarCheckout] Attaching Referral Code:', referralCode)
        }

        console.log('[PolarCheckout] Config:', {
            hasToken: !!token,
            siteUrl,
            apiUrl: POLAR_API_URL || 'undefined'
        })

        if (!token) {
            console.error('[PolarCheckout] Missing POLAR_ACCESS_TOKEN')
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
        }

        const payload = {
            product_id: process.env.POLAR_PRODUCT_ID || '5154b734-1a3b-41fe-92fe-f9a63e4453e8',
            success_url: `${siteUrl}/dashboard?upgraded=true`,
            customer_email: authUser.email,
            metadata: {
                user_id: authUser.id,
                desired_username: desiredUsername.toLowerCase(),
                original_username: userData?.username || '',
                referral_code: referralCode || '', // Send to Polar
            },
        }

        const response = await fetch(`${POLAR_API_URL}/checkouts/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('[PolarCheckout] API Error Status:', response.status)
            console.error('[PolarCheckout] API Error Body:', errorText)
            return NextResponse.json({ error: 'Failed to create checkout', details: errorText }, { status: 500 })
        }

        const checkout = await response.json()
        return NextResponse.json({ checkoutUrl: checkout.url })
    } catch (error) {
        console.error('[PolarCheckout] Unexpected error:', error)
        return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
    }
}
