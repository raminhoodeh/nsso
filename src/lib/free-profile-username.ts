import { isTransientAuthError } from '@/lib/auth-errors'
import { createClient } from '@/lib/supabase/server'
import { validateProfileUsername } from '@/lib/profile-username'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'

export async function updateFreeProfileUsername(request: Request, field: 'username' | 'desiredUsername') {
    const headers = { 'Cache-Control': 'private, no-store' }
    try {
        assertSameOrigin(request)
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (isTransientAuthError(authError)) return Response.json({ error: 'Account verification is temporarily unavailable. Please retry.' }, { status: 503, headers })
        if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
        const body = await readBoundedJson(request, 2048)
        const validated = validateProfileUsername(body[field])
        if ('error' in validated) return Response.json({ error: validated.error }, { status: 400, headers })
        // The database derives the owner from Auth and claims atomically. No billing occurs.
        const { data, error } = await supabase.rpc('claim_profile_username', { p_username: validated.username })
        if (error) {
            if (error.code === '23505') return Response.json({ error: 'Username is already taken' }, { status: 409, headers })
            if (error.code === '22023') return Response.json({ error: 'This username is invalid or reserved' }, { status: 400, headers })
            return Response.json({ error: 'The username could not be saved. Please retry.' }, { status: 503, headers })
        }
        if (!data?.success || data.username !== validated.username) return Response.json({ error: 'The username could not be confirmed.' }, { status: 503, headers })
        return Response.json({ success: true, username: data.username }, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? requestBodyErrorResponse(error)
            ?? Response.json({ error: 'The username could not be saved. Please retry.' }, { status: 503, headers })
    }
}
