import { isTransientAuthError } from '@/lib/auth-errors'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function POST(request: Request) {
    const headers = { 'Cache-Control': 'private, no-store' }
    try {
        assertSameOrigin(request)
        const client = await createClient()
        const { data: { user }, error: authError } = await client.auth.getUser()
        if (isTransientAuthError(authError)) return Response.json({ error: 'Account verification is temporarily unavailable. Please retry.' }, { status: 503, headers })
        if (authError || !user) return Response.json({ error: 'Please sign in to connect.' }, { status: 401, headers })
        const body = await readBoundedJson(request, 2048)
        if (typeof body.scannedUserId !== 'string' || !uuid.test(body.scannedUserId) || body.scannedUserId === user.id
            || (body.location !== undefined && (typeof body.location !== 'string' || body.location.length > 300))) {
            return Response.json({ error: 'Choose a valid person and location.' }, { status: 400, headers })
        }
        const { data, error } = await client.rpc('connect_my_nsso', {
            p_connected_user_id: body.scannedUserId, p_location_name: body.location || '',
        })
        if (error) {
            if (error.code === 'P0002') return Response.json({ error: 'This profile is unavailable.' }, { status: 404, headers })
            if (['22023', '23503'].includes(error.code)) return Response.json({ error: 'The connection details are invalid.' }, { status: 400, headers })
            return Response.json({ error: 'The connection could not be saved. Please retry.' }, { status: 503, headers })
        }
        if (!data?.success) return Response.json({ error: 'The connection could not be confirmed.' }, { status: 503, headers })
        return Response.json(data, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? requestBodyErrorResponse(error)
            ?? Response.json({ error: 'The connection could not be saved. Please retry.' }, { status: 503, headers })
    }
}
