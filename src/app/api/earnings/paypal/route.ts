import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { createClient } from '@/lib/supabase/server'
import { validatePayPalSlug } from '@/lib/earnings'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'

async function handlePOST(request: Request) {
    const headers = { 'Cache-Control': 'private, no-store' }
    try {
        assertSameOrigin(request)
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
        const { paypalMeSlug } = await readBoundedJson(request, 2048)
        if (typeof paypalMeSlug !== 'string' || !validatePayPalSlug(paypalMeSlug)) {
            return Response.json({ error: 'Use a PayPal.me name of up to 50 letters, numbers, hyphens or underscores.' }, { status: 400, headers })
        }
        const { error } = await supabase.rpc('update_account_settings', { p_patch: { paypal_me_slug: paypalMeSlug || null } })
        if (error) return Response.json({ error: 'PayPal settings could not be saved. Please retry.' }, { status: 503, headers })
        return Response.json({ success: true, paypalMeSlug: paypalMeSlug || null }, { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? requestBodyErrorResponse(error)
            ?? Response.json({ error: 'PayPal settings could not be saved. Please retry.' }, { status: 503, headers })
    }
}

export const POST = withRuntimeGuard(handlePOST)
