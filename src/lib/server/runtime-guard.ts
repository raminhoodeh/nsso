import 'server-only'
import { randomUUID, createHmac } from 'node:crypto'
import { clientIpHash } from '@/lib/deity/chat-budget-server'
import { assertSameOrigin, createPrivilegedClient } from '@/lib/server/permissions'

const mutations = new Set(['POST','PUT','PATCH','DELETE'])
export function runtimeScope(path: string, method: string): string | null {
    if (!path.startsWith('/api/')) return null
    if (path === '/api/profile/media' && method === 'POST') return 'upload'
    if (path === '/api/places/photo') return 'photo'
    if (path.startsWith('/api/razinflix/hero/') || path.startsWith('/api/razinflix/trailer/')) return 'film_media'
    if (path.startsWith('/api/razinflix/') && mutations.has(method)) return 'film_write'
    if (['/api/deity/chat','/api/deity/places'].includes(path) && method === 'POST') return 'chat'
    if (path === '/api/health') return 'health'
    if (path === '/api/check-username') return 'lookup'
    if (['/api/polar-checkout','/api/cancel-subscription','/api/webhooks/polar','/api/deity/validate-link'].includes(path)) return null
    return mutations.has(method) ? 'mutation' : null
}
export function safeDiagnostic(code: string, requestId: string, status: number) {
    // Codes are supplied by application code only. Never accept a raw error/payload here.
    console.warn('nsso request signal', { code, requestId, status })
}
export async function guardRuntimeRequest(request: Request): Promise<Response | null> {
    const path = new URL(request.url).pathname
    const scope = runtimeScope(path, request.method)
    if (!scope) return null
    const requestId = randomUUID()
    const headers = { 'Cache-Control':'private, no-store','X-Request-ID':requestId }
    try {
        if (mutations.has(request.method)) assertSameOrigin(request)
        const maximum = ['/api/razinflix/update','/api/profile/media'].includes(path) ? 12*1024*1024 : path.startsWith('/api/deity/') ? 65_536 : 262_144
        if (Number(request.headers.get('content-length')) > maximum) return Response.json({error:'This request is too large.',requestId},{status:413,headers})
        const hash = createHmac('sha256', clientIpHash(request)).update(`nsso-runtime/${scope}`).digest('hex')
        const {data,error} = await createPrivilegedClient().rpc('consume_nsso_request_limit',{p_scope:scope,p_subject_hash:hash})
        if (error || typeof data?.allowed !== 'boolean') throw new Error('Limiter unavailable')
        if (!data.allowed) {
            safeDiagnostic('rate_denied',requestId,429)
            return Response.json({error:'Please pause briefly and try again. Your work is kept.',requestId},{status:429,headers:{...headers,'Retry-After':'60'}})
        }
        return null
    } catch (error) {
        const status = error && typeof error === 'object' && 'status' in error && error.status === 403 ? 403 : 503
        safeDiagnostic(status===403?'request_rejected':'rate_unavailable',requestId,status)
        return Response.json({error:status===403?'Use this action from nsso.':'This action is temporarily unavailable. Please retry shortly.',requestId},{status,headers})
    }
}

/** Verified subjects only: prevents one account bypassing upload quotas by changing IP. */
export async function guardActorUpload(actorId: string): Promise<Response | null> {
    const requestId = randomUUID()
    const headers = { 'Cache-Control': 'private, no-store', 'X-Request-ID': requestId }
    try {
        const secret = process.env.NSSO_CHAT_IP_HASH_SECRET
        if (!secret || secret.length < 32 || !/^[0-9a-f-]{36}$/i.test(actorId)) throw new Error('Upload accounting unavailable')
        const subject = createHmac('sha256',secret).update(`nsso-upload-actor/${actorId}`).digest('hex')
        const {data,error} = await createPrivilegedClient().rpc('consume_nsso_request_limit',{p_scope:'upload_actor',p_subject_hash:subject})
        if (error || typeof data?.allowed !== 'boolean') throw new Error('Upload accounting unavailable')
        if (!data.allowed) return Response.json({error:'Please pause before uploading more images. Your crop has been kept.',requestId},{status:429,headers:{...headers,'Retry-After':'60'}})
        return null
    } catch {
        safeDiagnostic('rate_unavailable',requestId,503)
        return Response.json({error:'Image uploads are temporarily unavailable. Your crop has been kept.',requestId},{status:503,headers})
    }
}
