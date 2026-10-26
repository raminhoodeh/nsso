import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertSameOrigin(request)
        const { id } = await params
        if (!uuid.test(id)) return Response.json({ error: 'Choose a valid connection.' }, { status: 400, headers })
        const client = await createClient()
        const { data: { user }, error: authError } = await client.auth.getUser()
        if (authError || !user) return Response.json({ error: 'Please sign in.' }, { status: 401, headers })
        const body = await readBoundedJson(request, 16_384)
        if (!Object.keys(body).length || Object.keys(body).some(key => !['notes','location'].includes(key))
            || (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 3333))
            || (body.location !== undefined && (typeof body.location !== 'string' || body.location.length > 300))) return Response.json({ error: 'Use notes up to 3,333 characters and a location up to 300 characters.' }, { status: 400, headers })
        const patch = { ...(body.notes !== undefined ? { notes: body.notes } : {}), ...(body.location !== undefined ? { location_name: body.location } : {}), updated_at: new Date().toISOString() }
        const { data, error } = await client.from('my_nsso').update(patch).eq('id',id).eq('user_id',user.id).select('id').maybeSingle()
        if (error) throw error
        if (!data) return Response.json({ error: 'This connection is unavailable.' }, { status: 404, headers })
        return Response.json({ success: true }, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? requestBodyErrorResponse(error) ?? Response.json({ error: 'Your changes could not be saved. Please retry.' }, { status: 503, headers })
    }
}
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertSameOrigin(request)
        const { id } = await params
        if (!uuid.test(id)) return Response.json({ error: 'Choose a valid connection.' }, { status: 400, headers })
        const client = await createClient()
        const { data: { user }, error: authError } = await client.auth.getUser()
        if (authError || !user) return Response.json({ error: 'Please sign in.' }, { status: 401, headers })
        const { error } = await client.from('my_nsso').delete().eq('id',id).eq('user_id',user.id)
        if (error) throw error
        return Response.json({ success: true }, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? Response.json({ error: 'This connection could not be removed. Please retry.' }, { status: 503, headers })
    }
}
