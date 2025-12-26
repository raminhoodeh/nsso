import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { EarningsStats } from '@/lib/earnings'

export async function GET() {
    try {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch { }
                    },
                },
            }
        )

        // Get authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Call database function to get earnings stats
        const { data, error } = await supabase
            .rpc('get_user_earnings_stats', { user_uuid: user.id })
            .single()

        if (error) {
            console.error('Error fetching earnings stats:', error)
            return NextResponse.json(
                { error: 'Failed to fetch earnings stats' },
                { status: 500 }
            )
        }

        // Transform to match EarningsStats interface
        const stats: EarningsStats = {
            referralCode: data.referral_code || '',
            activeReferrals: parseInt(data.active_referrals) || 0,
            expectedEarnings: parseFloat(data.expected_earnings) || 0,
            paypalMeSlug: data.paypal_me_slug || null
        }

        return NextResponse.json(stats)
    } catch (error) {
        console.error('Unexpected error in earnings stats:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
