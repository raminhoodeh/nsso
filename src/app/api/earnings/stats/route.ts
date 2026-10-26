import { createClient } from '@/lib/supabase/server'
import type { EarningsStats } from '@/lib/earnings'

interface EarningsStatsRow {
    referral_code: string | null
    active_referrals: string | number | null
    expected_earnings: string | number | null
    paypal_me_slug: string | null
}

export async function GET() {
    try {
        const supabase = await createClient()

        // Get authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return Response.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Call database function to get earnings stats
        const { data, error } = await supabase
            .rpc('get_user_earnings_stats', { user_uuid: user.id })
            .single()

        if (error || !data) {
            console.error('Error fetching earnings stats:', error)
            return Response.json(
                { error: 'Failed to fetch earnings stats' },
                { status: 500 }
            )
        }

        // Transform to match EarningsStats interface
        const row = data as EarningsStatsRow
        const stats: EarningsStats = {
            referralCode: row.referral_code || '',
            activeReferrals: Number.parseInt(String(row.active_referrals ?? 0), 10) || 0,
            // The old RPC projects revenue from referral counts, not settled payments.
            // Keep historical referral data, but free accounts generate no subscription income.
            expectedEarnings: 0,
            paypalMeSlug: row.paypal_me_slug || null
        }

        return Response.json(stats)
    } catch (error) {
        console.error('Unexpected error in earnings stats:', error)
        return Response.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
