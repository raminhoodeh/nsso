import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, createPrivilegedClient, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'
import { parsePayPalInput, PAYPAL_INPUT_LIMIT } from '@/lib/payments/paypal-config'

const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        assertSameOrigin(request)
        const session = await createClient()
        const { data: { user }, error: authError } = await session.auth.getUser()
        if (authError || !user) return respond({ error: 'Please sign in to update this payment button.' }, 401)
        const { id } = await context.params
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return respond({ error: 'Invalid product.' }, 400)
        // Check ownership before reading/parsing a potentially large body or using elevated access.
        const { data: owned, error: ownerError } = await session.from('products').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
        if (ownerError) return respond({ error: 'Payment settings could not be checked. Please retry.' }, 503)
        if (!owned) return respond({ error: 'Product not found.' }, 404)
        const body = await readBoundedJson(request, PAYPAL_INPUT_LIMIT * 2)
        if (Object.keys(body).some(key => key !== 'html')) return respond({ error: 'Send only the PayPal button code.' }, 400)
        const parsed = parsePayPalInput(body.html)
        if (!parsed.ok) return respond({ error: parsed.message }, 422)
        const trusted = createPrivilegedClient()
        const { data: saved, error } = await trusted.from('products')
            .update({ paypal_html: body.html, payment_config: parsed.config })
            .eq('id', id).eq('user_id', user.id)
            .select('id,payment_config').single()
        if (error || !saved) return respond({ error: 'Payment settings were not saved. Your draft has been kept.' }, 503)
        return respond({ success: true, config: saved.payment_config, message: parsed.message })
    } catch (error) {
        return permissionErrorResponse(error) || requestBodyErrorResponse(error) || respond({ error: 'Payment settings are temporarily unavailable.' }, 503)
    }
}
