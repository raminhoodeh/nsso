import { randomBytes } from 'node:crypto'
import staticManifest from './static-csp-hashes.json' with { type: 'json' }

type HashManifest = { version: number; buildId: string | null; routes: Record<string, string[]> }
export type SecurityContext = { requestHeaders: Headers; nonce: string | null; policy: string; reportOnly: boolean }

const paypal = ['https://www.paypal.com', 'https://www.paypalobjects.com', 'https://c.paypal.com']
const mapsScripts = ['https://maps.googleapis.com', 'https://maps.gstatic.com', 'https://www.google.com', 'https://maps.google.com']
const mapsConnect = [...mapsScripts, 'https://places.googleapis.com', 'https://tile.googleapis.com', 'https://streetviewpixels-pa.googleapis.com', 'https://khms0.googleapis.com', 'https://khms1.googleapis.com', 'https://khms2.googleapis.com', 'https://khms3.googleapis.com']

function supabaseOrigins(env: NodeJS.ProcessEnv) {
    try {
        const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL || '')
        if (url.protocol !== 'https:' || url.username || url.password || !/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) return []
        return [url.origin, `wss://${url.host}`]
    } catch { return [] }
}

/** Static HTML uses verified build hashes; dynamic SSR gets a fresh request nonce. */
export function prepareSecurityRequest(request: Request, env: NodeJS.ProcessEnv = process.env, manifest: HashManifest = staticManifest): SecurityContext {
    const url = new URL(request.url)
    const path = url.pathname.replace(/\/$/, '') || '/'
    const staticHashes = manifest.routes[path]
    const fallbackHashes = [...(manifest.routes['/_not-found'] || []), ...(manifest.routes['/_global-error'] || [])]
    const isApi = path === '/api' || path.startsWith('/api/')
    const nonce = staticHashes || isApi ? null : randomBytes(18).toString('base64')
    const hashes = [...new Set([...(staticHashes || []), ...fallbackHashes])].filter(hash => /^sha256-[A-Za-z0-9+/]{43}=$/.test(hash))
    const places = path === '/places/dubai'
    const development = env.NODE_ENV === 'development'
    const directives: Record<string, string[]> = {
        'default-src': ["'self'"],
        'script-src': ["'self'", ...(nonce ? [`'nonce-${nonce}'`] : []), ...hashes.map(hash => `'${hash}'`), ...paypal, 'https://connect.facebook.net', ...(places ? mapsScripts : []), ...(places || development ? ["'unsafe-eval'"] : [])],
        'script-src-attr': ["'none'"],
        // Framer Motion, React style props and map/PayPal controls set style attributes.
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'img-src': ["'self'", 'data:', 'blob:', 'https:'],
        'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
        'connect-src': ["'self'", ...supabaseOrigins(env), ...paypal, 'https://api-m.paypal.com', 'https://www.facebook.com', 'https://connect.facebook.net', ...(places ? mapsConnect : []), ...(development ? ['ws://localhost:*', 'ws://127.0.0.1:*'] : [])],
        'frame-src': ['https://www.paypal.com', 'https://c.paypal.com', 'https://www.youtube.com', 'https://www.youtube-nocookie.com', ...(places ? ['https://www.google.com', 'https://maps.google.com'] : [])],
        'worker-src': ["'self'", 'blob:'],
        'media-src': ["'self'", 'blob:', 'https:'],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'", 'https://www.paypal.com', 'https://paypal.com'],
        'frame-ancestors': ["'none'"],
    }
    if (url.protocol === 'https:') directives['upgrade-insecure-requests'] = []
    const policy = Object.entries(directives).map(([name, sources]) => [name, ...sources].join(' ')).join('; ')
    const requestHeaders = new Headers(request.headers)
    // Never accept a caller's nonce or policy as authority for the SSR response.
    requestHeaders.delete('x-nonce')
    requestHeaders.delete('content-security-policy-report-only')
    if (nonce) requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', policy)
    // Dreamsea is a separate app outside this remediation's provider inventory.
    const excludedApp = path === '/dreamsea' || path.startsWith('/dreamsea/')
    return { requestHeaders, nonce, policy, reportOnly: excludedApp || env.NSSO_CSP_MODE !== 'enforce' }
}

/** Apply to the final response, including redirects/errors, with the original context. */
export function securityHeaders(request: Request, response: Response, context: SecurityContext): Response {
    response.headers.delete(context.reportOnly ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only')
    response.headers.set(context.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', context.policy)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
    response.headers.set('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(self "https://www.paypal.com")')
    if (new URL(request.url).protocol === 'https:') response.headers.set('Strict-Transport-Security', 'max-age=63072000')
    return response
}
