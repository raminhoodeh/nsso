import 'server-only'
import { after } from 'next/server.js'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

export type RuntimeSignal = 'rate_denied' | 'rate_unavailable' | 'privilege_denied' | 'mfa_required' | 'payment_rejected' | 'budget_unavailable' | 'upstream_failed' | 'request_rejected'
const allowed = new Set<RuntimeSignal>(['rate_denied','rate_unavailable','privilege_denied','mfa_required','payment_rejected','budget_unavailable','upstream_failed','request_rejected'])
/** No free-form payloads. The response lifetime covers the bounded aggregate write. */
export function reportRuntimeSignal(candidate: RuntimeSignal): string {
    const code = allowed.has(candidate) ? candidate : 'request_rejected'
    const requestId = randomUUID()
    console.warn('nsso operational signal', { code, requestId })
    try {
        after(async () => {
            try {
                const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
                if (!url || !key) return
                const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(3000)})}})
                const { error } = await client.rpc('record_nsso_runtime_signal',{p_code:code})
                if (error) throw new Error('Signal accounting unavailable')
            } catch { console.warn('nsso signal persistence unavailable', { code:'signal_unavailable',requestId }) }
        })
    } catch { /* Isolated test/CLI has no Next response context; the scrubbed event remains visible. */ }
    return requestId
}
