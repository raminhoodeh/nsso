import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { isTransientAuthError } from '@/lib/auth-errors'
import { createClient } from '@/lib/supabase/server'
import { permissionErrorResponse, type AppPermission } from '@/lib/server/permissions'

const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

async function handleGET(request?: Request) {
    try {
        const client = await createClient()
        const { data: { user: actor }, error: authError } = await client.auth.getUser()
        if (isTransientAuthError(authError)) return Response.json({ error: 'Account verification is temporarily unavailable.' }, { status: 503, headers: privateHeaders })
        if (authError || !actor) {
            // Public navigation asks whether a session exists. An anonymous visit
            // is a valid answer; protected account reads retain their 401 contract.
            if (!actor && request?.headers.get('X-NSSO-Optional-Account') === '1') {
                return Response.json({ user: null, permissions: [] }, { headers: privateHeaders })
            }
            return Response.json({ error: 'Please sign in.' }, { status: 401, headers: privateHeaders })
        }
        let { data: account, error } = await client.rpc('get_current_account')
        if (!error && !account) ({ data: account, error } = await client.rpc('ensure_current_account'))
        if (error || !account || account.id !== actor.id) {
            return Response.json({ error: 'Account details are temporarily unavailable.' }, { status: 503, headers: privateHeaders })
        }
        // The authenticated RPC derives capabilities from protected membership. Ordinary
        // account reads need no service key; privileged mutations check membership again.
        const candidates: AppPermission[] = ['nsso:admin', 'razinflix:manage']
        const permissions = Array.isArray(account.permissions)
            ? candidates.filter(permission => account.permissions.includes(permission)) : []
        return Response.json({ user: { ...account, email: actor.email ?? '', user_type: permissions.includes('nsso:admin') ? 'admin' : 'standard', is_premium: true }, permissions }, { headers: privateHeaders })
    } catch (error) {
        return permissionErrorResponse(error) ?? Response.json({ error: 'Account details are temporarily unavailable.' }, { status: 503, headers: privateHeaders })
    }
}

export const GET = withRuntimeGuard(handleGET)
