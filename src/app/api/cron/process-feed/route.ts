import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    const supabase = await createClient()

    // For manual testing by the user, we check for a logged-in user and process *their* feed.
    // In production, this would be a CRON job iterating over all users.

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase.rpc('process_daily_feed_aggregation', {
        target_user_id: user.id
    })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Feed aggregated successfully' })
}
