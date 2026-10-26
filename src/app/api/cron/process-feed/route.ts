import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, createPrivilegedClient, permissionErrorResponse } from '@/lib/server/permissions'

export async function POST(req: Request) {
    const headers = { 'Cache-Control': 'private, no-store' }
    try {
        assertSameOrigin(req)
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return Response.json({ error: 'Please sign in.' }, { status: 401, headers })
        // This manual operation can aggregate only the verified caller's feed.
        // The privileged function is never given a subject from request data.
        const { error } = await createPrivilegedClient().rpc('process_daily_feed_aggregation', { target_user_id: user.id })
        if (error) return Response.json({ error: 'Feed updates could not be prepared. Please retry.' }, { status: 503, headers })
        return Response.json({ success: true, message: 'Feed updates prepared.' }, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? Response.json({ error: 'Feed updates could not be prepared. Please retry.' }, { status: 503, headers })
    }
}
