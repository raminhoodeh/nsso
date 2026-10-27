import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'
import { isUuid } from '@/lib/profile-mutations'

const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
async function handlePOST(request: Request) {
    try {
        assertSameOrigin(request)
        const session = await createClient()
        const { data: { user }, error } = await session.auth.getUser()
        if (error || !user) return respond({ code: 'AUTHENTICATION_REQUIRED' }, 401)
        if (request.headers.get('x-nsso-account') !== user.id) return respond({ code: 'ACCOUNT_CHANGED' }, 409)
        const body = await readBoundedJson(request, 2048)
        if (Object.keys(body).length !== 4 || Object.keys(body).some(key => !['version', 'operationId', 'originalOperationId', 'expectedRevision'].includes(key)) || body.version !== 1 || !isUuid(body.operationId) || !isUuid(body.originalOperationId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) return respond({ code: 'INVALID_OPERATION' }, 422)
        const result = await session.rpc('undo_profile_operation', { p_operation_id: body.operationId, p_original_operation_id: body.originalOperationId, p_expected_revision: body.expectedRevision })
        if (result.error || !result.data) return respond({ code: 'OUTCOME_UNKNOWN', operationId: body.operationId }, 503)
        return respond(result.data, result.data.code === 'RATE_LIMITED' ? 429 : result.data.status === 'conflict' ? 409 : result.data.status === 'rejected' ? 422 : 200)
    } catch (error) { return permissionErrorResponse(error) || requestBodyErrorResponse(error) || respond({ code: 'OUTCOME_UNKNOWN' }, 503) }
}

export const POST = withRuntimeGuard(handlePOST)
