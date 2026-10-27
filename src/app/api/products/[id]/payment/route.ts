import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, createPrivilegedClient, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'
import { parsePayPalInput, PAYPAL_INPUT_LIMIT } from '@/lib/payments/paypal-config'
import { isUuid } from '@/lib/profile-mutations'
import { reportRuntimeSignal } from '@/lib/server/runtime-signals'

const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

async function handlePOST(request: Request, context: { params: Promise<{ id: string }> }) {
    try {
        assertSameOrigin(request)
        const session = await createClient()
        const { data: { user }, error: authError } = await session.auth.getUser()
        if (authError || !user) return respond({ error: 'Please sign in to update this payment button.' }, 401)
        if(request.headers.get('x-nsso-account')!==user.id)return respond({error:'The signed-in account changed. Reload before saving.',code:'ACCOUNT_CHANGED'},409)
        const { id } = await context.params
        if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return respond({ error: 'Invalid product.' }, 400)
        // Check ownership before reading/parsing a potentially large body or using elevated access.
        const { data: owned, error: ownerError } = await session.from('products').select('id').eq('id', id).eq('user_id', user.id).maybeSingle()
        if (ownerError) return respond({ error: 'Payment settings could not be checked. Please retry.' }, 503)
        if (!owned) return respond({ error: 'Product not found.' }, 404)
        const body = await readBoundedJson(request, PAYPAL_INPUT_LIMIT * 2)
        if (Object.keys(body).length !== 3 || Object.keys(body).some(key => !['html','operationId','expectedRevision'].includes(key)) || !isUuid(body.operationId) || !Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) return respond({ error: 'The save request is invalid.', code: 'INVALID_OPERATION' }, 400)
        const parsed = parsePayPalInput(body.html)
        if (!parsed.ok) { reportRuntimeSignal('payment_rejected'); return respond({ error: parsed.message }, 422) }
        const trusted = createPrivilegedClient()
        const { data: saved, error } = await trusted.rpc('save_product_payment_operation', { p_user_id: user.id, p_product_id: id, p_operation_id: body.operationId, p_expected_revision: body.expectedRevision, p_html: body.html, p_config: parsed.config })
        if (error || !saved) return respond({ error: 'The save result is not confirmed. Your draft has been kept.', code: 'OUTCOME_UNKNOWN', operationId: body.operationId }, 503)
        return respond({ ...saved, success: saved.status === 'applied', config: parsed.config, message: parsed.message, ...(saved.code === 'RATE_LIMITED' ? {error:'Too many changes were sent. Please wait before retrying; your draft has been kept.'} : {}) }, saved.code === 'RATE_LIMITED' ? 429 : saved.status === 'conflict' ? 409 : saved.status === 'rejected' ? 422 : 200)
    } catch (error) {
        return permissionErrorResponse(error) || requestBodyErrorResponse(error) || respond({ error: 'Payment settings are temporarily unavailable.' }, 503)
    }
}

export const POST = withRuntimeGuard(handlePOST)
