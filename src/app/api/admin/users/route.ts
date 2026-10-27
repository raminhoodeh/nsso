import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { requirePermission, createPrivilegedClient, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'
import { isVerifiedAdminIdentity } from '@/lib/admin-access'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function handleGET(request: Request) {
    try {
        const { user } = await requirePermission('nsso:admin')
        const offset = Number(new URL(request.url).searchParams.get('offset') ?? 0)
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) return Response.json({ error: 'Invalid page.' }, { status: 400, headers })
        const { data, error } = await createPrivilegedClient().rpc('admin_list_accounts', { p_actor_id: user.id, p_offset: offset, p_limit: 100 })
        if (error || !Array.isArray(data)) return Response.json({ error: 'Accounts could not be loaded.' }, { status: 503, headers })
        return Response.json({ users: data, currentUserId: user.id, nextOffset: data.length === 100 ? offset + 100 : null }, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? Response.json({ error: 'Accounts could not be loaded.' }, { status: 503, headers })
    }
}

async function handlePOST(request: Request) {
    try {
        const { user } = await requirePermission('nsso:admin', request)
        const body = await readBoundedJson(request, 2048)
        if (typeof body.userId !== 'string' || !uuid.test(body.userId)
            || !['nsso:admin', 'razinflix:manage'].includes(String(body.permission)) || typeof body.granted !== 'boolean') {
            return Response.json({ error: 'Choose a valid account and permission.' }, { status: 400, headers })
        }
        const privileged = createPrivilegedClient()
        if (body.permission === 'nsso:admin' && body.granted) {
            // Targets come from the trusted Auth record, never the supplied email or public account row.
            const target = await privileged.auth.admin.getUserById(body.userId)
            if (target.error) return Response.json({ error: 'The account could not be verified. Please retry.' }, { status: 503, headers })
            if (target.data.user?.id !== body.userId || !isVerifiedAdminIdentity(target.data.user)) {
                return Response.json({ error: 'Administrator access is limited to the approved verified email addresses.' }, { status: 403, headers })
            }
        }
        const { error } = await privileged.rpc('admin_set_permission', {
            p_actor_id: user.id, p_user_id: body.userId, p_permission: body.permission, p_granted: body.granted,
        })
        if (error) {
            if (error.code === '42501') return Response.json({ error: 'This permission change is not allowed.' }, { status: 403, headers })
            if (['22023', 'P0001', '23514'].includes(error.code)) return Response.json({ error: 'The permission could not be changed. Keep at least one administrator.' }, { status: 409, headers })
            return Response.json({ error: 'The permission could not be saved. Please retry.' }, { status: 503, headers })
        }
        return Response.json({ success: true }, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? requestBodyErrorResponse(error)
            ?? Response.json({ error: 'The permission could not be saved. Please retry.' }, { status: 503, headers })
    }
}

export const GET = withRuntimeGuard(handleGET)
export const POST = withRuntimeGuard(handlePOST)
