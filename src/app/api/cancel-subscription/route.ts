import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const POLAR_API_URL = process.env.POLAR_API_URL || 'https://sandbox-api.polar.sh/v1'

export async function POST(request: Request) {
    try {
        const supabase = await createClient()

        // Get current user
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get user's subscription
        const { data: subscription } = await supabase
            .from('subscriptions')
            .select('polar_sub_id')
            .eq('user_id', authUser.id)
            .single()

        if (!subscription?.polar_sub_id) {
            return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
        }

        // Cancel subscription at period end via Polar API
        const response = await fetch(`${POLAR_API_URL}/subscriptions/${subscription.polar_sub_id}`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                cancel_at_period_end: true,
            }),
        })

        if (!response.ok) {
            const errorData = await response.json()
            console.error('Polar API error:', errorData)
            return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 })
        }

        // Update our database
        await supabase
            .from('subscriptions')
            .update({
                status: 'canceling',
                cancel_at_period_end: true,
            })
            .eq('user_id', authUser.id)

        return NextResponse.json({ success: true, message: 'Subscription will cancel at end of billing period' })
    } catch (error) {
        console.error('Cancel subscription error:', error)
        return NextResponse.json({ error: 'Failed to cancel subscription' }, { status: 500 })
    }
}
