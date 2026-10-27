import { isTransientAuthError } from '@/lib/auth-errors'
import 'server-only'
import { randomUUID } from 'node:crypto'
import { reportRuntimeSignal } from '@/lib/server/runtime-signals'
import { createPrivilegedFetch, type PrivilegedFetchContext } from '@/lib/server/privileged-fetch'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient as createSessionClient } from '@/lib/supabase/server'

export type AppPermission = 'nsso:admin' | 'razinflix:manage'

export class PermissionError extends Error {
    readonly status: 401 | 403 | 503
    readonly code: string
    constructor(status: 401 | 403 | 503, code: string) {
        super(code === 'mfa_required' ? 'Verify your authenticator at /dashboard/security before continuing.' : status === 401 ? 'Please sign in to continue.'
            : status === 403 ? 'This account does not have permission for that action.'
                : 'Access checks are temporarily unavailable. Please try again shortly.')
        this.status = status
        this.code = code
    }
}

/** This client never carries a browser session. Call only after operation-specific authorization. */
export function createPrivilegedClient(context: PrivilegedFetchContext = {}) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new PermissionError(503, 'permission_check_unavailable')
    return createSupabaseClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { fetch: createPrivilegedFetch(context) },
    })
}

/** The subject must come from a verified Auth user, never from request data or public.users. */
export async function hasPermission(userId: string, permission: AppPermission): Promise<boolean> {
    try {
        const client = createPrivilegedClient()
        const { data, error } = await client.rpc('has_app_permission', {
            p_user_id: userId, p_permission: permission,
        })
        if (error || typeof data !== 'boolean') throw new PermissionError(503, 'permission_check_unavailable')
        return data
    } catch {
        throw new PermissionError(503, 'permission_check_unavailable')
    }
}

export function assertSameOrigin(request: Request) {
    const origin = request.headers.get('origin')
    if (request.headers.get('sec-fetch-site') === 'cross-site'
        || (origin && origin !== new URL(request.url).origin)) {
        throw new PermissionError(403, 'mutation_origin_denied')
    }
}

export async function requirePermission(permission: AppPermission, request?: Request) {
    if (request) assertSameOrigin(request)
    let supabase
    try { supabase = await createSessionClient() }
    catch { throw new PermissionError(503, 'permission_check_unavailable') }
    let actor
    try { actor = await supabase.auth.getUser() }
    catch { throw new PermissionError(503, 'permission_check_unavailable') }
    if (isTransientAuthError(actor.error)) throw new PermissionError(503, 'permission_check_unavailable')
    if (actor.error || !actor.data.user) throw new PermissionError(401, 'authentication_required')
    if (!await hasPermission(actor.data.user.id, permission)) throw new PermissionError(403, 'permission_denied')
    let assurance
    try { assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel() }
    catch { throw new PermissionError(503, 'permission_check_unavailable') }
    if (assurance.error) throw new PermissionError(503, 'permission_check_unavailable')
    // Current factors come from getUser's verified Auth response, not editable session metadata.
    if (assurance.data.currentLevel !== 'aal2' || !actor.data.user.factors?.some(factor => factor.status === 'verified')) throw new PermissionError(403, 'mfa_required')
    return { user: actor.data.user, supabase }
}

export function permissionErrorResponse(error: unknown): Response | null {
    if (!(error instanceof PermissionError)) return null
    const requestId = error.status === 401 ? randomUUID() : reportRuntimeSignal(error.code === 'mfa_required' ? 'mfa_required' : error.status === 403 ? 'privilege_denied' : 'upstream_failed')
    return Response.json({ requestId, error: error.message, code: error.code, ...(error.code === 'mfa_required' ? { next: '/dashboard/security' } : {}) }, {
        status: error.status, headers: { 'Cache-Control': 'private, no-store', 'X-Request-ID': requestId },
    })
}
