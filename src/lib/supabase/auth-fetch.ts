const DEFAULT_REFRESH_COOLDOWN_MS = 60_000
const MAX_REFRESH_COOLDOWN_MS = 300_000

/** A provider throttle is not session revocation. No token or response body is cached. */
export function createAuthFetch(supabaseUrl: string, transport: typeof fetch = (...args) => fetch(...args), now = Date.now): typeof fetch {
    const authOrigin = new URL(supabaseUrl).origin
    let blockedUntil = 0
    const unavailable = () => Response.json({ message: 'Authentication is temporarily unavailable. Please retry shortly.' }, {
        status: 503, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': String(Math.max(1, Math.ceil((blockedUntil - now()) / 1000))) },
    })
    return async (input, init) => {
        const request = input instanceof Request ? input : null
        const url = new URL(request?.url ?? String(input))
        const method = (init?.method ?? request?.method ?? 'GET').toUpperCase()
        const refresh = url.origin === authOrigin && !url.username && !url.password && url.pathname === '/auth/v1/token'
            && method === 'POST' && url.searchParams.getAll('grant_type').length === 1 && url.searchParams.get('grant_type') === 'refresh_token'
        if (refresh && now() < blockedUntil) return unavailable()
        const response = await transport(input, init)
        if (!refresh || response.status !== 429) return response
        const retryAfter = response.headers.get('retry-after')
        const delay = retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000
            : retryAfter ? Date.parse(retryAfter) - now() : 0
        blockedUntil = now() + Math.min(MAX_REFRESH_COOLDOWN_MS, Math.max(DEFAULT_REFRESH_COOLDOWN_MS, Number.isFinite(delay) ? delay : 0))
        void response.body?.cancel().catch(() => {})
        // The pinned SDK otherwise deletes the session on 429. Its internal
        // backoff may continue, but the circuit permits no additional HTTP call
        // during this cooldown. Invalid-refresh400/401 responses are unchanged.
        return unavailable()
    }
}
