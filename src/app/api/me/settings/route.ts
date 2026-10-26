import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'
import { validatePayPalSlug } from '@/lib/earnings'

export async function POST(request: Request) {
    const headers = { 'Cache-Control': 'private, no-store' }
    try {
        assertSameOrigin(request)
        const client = await createClient()
        const { data: { user }, error: authError } = await client.auth.getUser()
        if (authError || !user) return Response.json({ error: 'Please sign in.' }, { status: 401, headers })
        const patch = await readBoundedJson(request, 2048)
        if (!Object.keys(patch).length || Object.keys(patch).some(key => !['deity_fast_mode', 'paypal_me_slug'].includes(key))
            || ('deity_fast_mode' in patch && typeof patch.deity_fast_mode !== 'boolean')
            || ('paypal_me_slug' in patch && !(patch.paypal_me_slug === null || (typeof patch.paypal_me_slug === 'string' && validatePayPalSlug(patch.paypal_me_slug))))) {
            return Response.json({ error: 'These account settings are invalid.' }, { status: 400, headers })
        }
        const { data, error } = await client.rpc('update_account_settings', { p_patch: patch })
        if (error) return Response.json({ error: 'Settings could not be saved. Please retry.' }, { status: 503, headers })
        return Response.json({ success: true, settings: data }, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? requestBodyErrorResponse(error)
            ?? Response.json({ error: 'Settings could not be saved. Please retry.' }, { status: 503, headers })
    }
}
