import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'
import { isProfileOperation, isUuid, normalizeProfileChange } from '@/lib/profile-mutations'

const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function POST(request: Request) {
    try {
        assertSameOrigin(request)
        const session = await createClient()
        const { data: { user }, error } = await session.auth.getUser()
        if (error || !user) return respond({ code: 'AUTHENTICATION_REQUIRED' }, 401)
        if (request.headers.get('x-nsso-account') !== user.id) return respond({ code: 'ACCOUNT_CHANGED' }, 409)
        const body = await readBoundedJson(request, 262144)
        if (!isProfileOperation(body)) return respond({ code: 'INVALID_OPERATION' }, 422)
        const result = await session.rpc('apply_profile_operation', { p_operation: { ...body, changes: body.changes.map(normalizeProfileChange) } })
        if (result.error || !result.data) return respond({ code: 'OUTCOME_UNKNOWN', operationId: body.operationId }, 503)
        return respond(result.data, result.data.code === 'RATE_LIMITED' ? 429 : result.data.status === 'conflict' ? 409 : result.data.status === 'rejected' ? 422 : 200)
    } catch (error) { return permissionErrorResponse(error) || requestBodyErrorResponse(error) || respond({ code: 'OUTCOME_UNKNOWN' }, 503) }
}

export async function GET(request: Request) {
    try {
        const session = await createClient()
        const { data: { user }, error } = await session.auth.getUser()
        if (error || !user) return respond({ code: 'AUTHENTICATION_REQUIRED' }, 401)
        if (request.headers.get('x-nsso-account') !== user.id) return respond({ code: 'ACCOUNT_CHANGED' }, 409)
        const id = new URL(request.url).searchParams.get('operationId')
        if (!isUuid(id)) return respond({ code: 'INVALID_OPERATION' }, 400)
        const result = await session.rpc('get_profile_operation', { p_operation_id: id })
        if (result.error || !result.data) return respond({ code: 'OUTCOME_UNKNOWN' }, 503)
        return respond(result.data)
    } catch { return respond({ code: 'OUTCOME_UNKNOWN' }, 503) }
}
