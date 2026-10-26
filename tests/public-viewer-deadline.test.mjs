import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { performance } from 'node:perf_hooks'

const source = new URL('../src/', import.meta.url)
const moduleUrl = text => `data:text/javascript,${encodeURIComponent(text)}`
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: moduleUrl('export {};'), shortCircuit: true }
    if (specifier === 'next/headers') return { url: moduleUrl('export const cookies=async()=>globalThis.__viewerCookies;'), shortCircuit: true }
    if (specifier.startsWith('@/')) return next(new URL(specifier.slice(2) + '.ts', source).href, context)
    if (specifier === '../urls') return next(new URL('lib/urls.ts', source).href, context)
    return next(specifier, context)
} })
const { loadPublicProfileViewer } = await import('../src/lib/public-profile.ts')
hooks.deregister()

test('actual SDK refresh503 backoff cannot hold public content beyond the optional viewer deadline or clear cookies', { timeout: 10_000 }, async () => {
    const previousFetch = globalThis.fetch, previousError = console.error, previousNow = Date.now
    const previousEnvironment = { ...process.env }
    const subject = '11111111-1111-4111-8111-111111111111'
    const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: subject, exp: 1 })).toString('base64url'), 'synthetic-signature'].join('.')
    const session = { access_token: token, refresh_token: 'synthetic-local-fixture-refresh', token_type: 'bearer', expires_at: 1, expires_in: 3600, user: { id: subject } }
    const writes = []
    globalThis.__viewerCookies = { getAll: () => [{ name: 'sb-deadline-fixture-auth-token', value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url') }], set: (...args) => writes.push(args) }
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://deadline-fixture.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anonymous-key'
    let networkRequests = 0, abortedRequests = 0
    const signals = []
    // The SDK logs transport aborts internally. Keep this synthetic diagnostic
    // out of the test reporter; application code does not replace SDK logging.
    console.error = () => {}
    globalThis.fetch = async (input, init) => {
        assert.equal(new URL(input).pathname, '/auth/v1/token')
        signals.push(init.signal)
        if (init.signal.aborted) { abortedRequests++; throw new DOMException('Synthetic transport cancelled', 'AbortError') }
        networkRequests++
        return Response.json({ error: 'Synthetic Auth outage' }, { status: 503 })
    }
    try {
        const start = performance.now()
        const result = await loadPublicProfileViewer(subject)
        const elapsed = performance.now() - start
        assert.deepEqual(result, { viewer: null, connectionExists: false })
        assert.ok(elapsed >= 1_800 && elapsed < 4_500, 'Public viewer resolution did not honor its two-second overall deadline')
        assert.ok(networkRequests >= 2, 'Fixture must exercise actual SDK refresh backoff, not one thrown Auth call')
        assert.ok(signals.every(signal => signal.aborted), 'All underlying requests must share the overall cancellation')
        const countAtDeadline = networkRequests
        // Timing above uses real wall time. Accelerate only the canceled SDK
        // retry tail's Date-based retry cutoff so it cannot keep CI alive30s.
        Date.now = () => previousNow() + 60_000
        const cleanupStart = performance.now()
        while (!abortedRequests && performance.now() - cleanupStart < 3_000) await new Promise(resolve => setTimeout(resolve, 20))
        assert.ok(abortedRequests > 0)
        await new Promise(resolve => setTimeout(resolve, 20))
        assert.equal(networkRequests, countAtDeadline, 'A canceled SDK retry made another network request')
        assert.equal(writes.length, 0, 'An Auth outage must not delete or replace the visitor session cookies')
    } finally {
        globalThis.fetch = previousFetch; console.error = previousError; Date.now = previousNow; process.env = previousEnvironment
        delete globalThis.__viewerCookies
    }
})
