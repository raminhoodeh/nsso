import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as turn } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { createServerClient, createBrowserClient } from '@supabase/ssr'
import { createAuthFetch } from '../src/lib/supabase/auth-fetch.ts'
import { boundedClientRead } from '../src/lib/client-read.ts'

const origin = 'https://auth-fixture.supabase.co'
const tokenUrl = origin + '/auth/v1/token?grant_type=refresh_token'
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-26T00:00:00Z' }
function session(expiry) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: expiry }) + '.synthetic-signature'
    return { access_token: token, refresh_token: 'synthetic-refresh-token', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user }
}
async function advanceUntilSettled(t, promise, maximum = 40_000) {
    let done = false
    const outcome = promise.then(value => ({ value }), error => ({ error })).finally(() => { done = true })
    for (let elapsed = 0; !done && elapsed < maximum; elapsed += 200) { await turn(); t.mock.timers.tick(200) }
    await turn()
    assert.equal(done, true, 'SDK task must settle within its bounded retry tick')
    const result = await outcome
    if (result.error) throw result.error
    return result.value
}

test('only the configured exact refresh POST is intercepted; writes, other origins and hard failures are unchanged', async () => {
    let clock = 1000, calls = 0
    const guarded = createAuthFetch(origin, async () => { calls++; return Response.json({ message: 'private-upstream' }, { status: 429, headers: { 'Retry-After': '120' } }) }, () => clock)
    const first = await guarded(tokenUrl, { method: 'POST' })
    assert.equal(first.status, 503); assert.equal(first.headers.get('retry-after'), '120')
    assert.doesNotMatch(await first.text(), /private-upstream/)
    assert.equal((await guarded(tokenUrl, { method: 'POST' })).status, 503); assert.equal(calls, 1)
    for (const [url, method] of [[tokenUrl, 'GET'], [origin + '/auth/v1/token?grant_type=password', 'POST'], [origin + '/auth/v1/user', 'GET'], ['https://other-fixture.supabase.co/auth/v1/token?grant_type=refresh_token', 'POST'], [tokenUrl + '&grant_type=password', 'POST'], [origin + '/rest/v1/products', 'PATCH']]) {
        assert.equal((await guarded(url, { method })).status, 429)
    }
    assert.equal(calls, 7)
    clock += 119_999
    await guarded(tokenUrl, { method: 'POST' }); assert.equal(calls, 7)
    clock++
    await guarded(tokenUrl, { method: 'POST' }); assert.equal(calls, 8)
})

test('Retry-After accepts bounded seconds/dates and cannot lock the client indefinitely', async () => {
    const baseline = Date.UTC(2026, 9, 26)
    for (const [header, expected] of [[null, 60], ['1', 60], ['120', 120], ['99999999999999999999999999999999', 300], [new Date(baseline + 120_000).toUTCString(), 120], ['Fri, 31 Dec 9999 23:59:59 GMT', 300], ['malformed-value', 60]]) {
        let clock = baseline, calls = 0
        const fetch = createAuthFetch(origin, async () => { calls++; return Response.json({}, { status: 429, headers: header ? { 'Retry-After': header } : {} }) }, () => clock)
        assert.equal((await fetch(tokenUrl, { method: 'POST' })).headers.get('retry-after'), String(expected), String(header))
        clock += expected * 1000 - 1
        await fetch(tokenUrl, { method: 'POST' }); assert.equal(calls, 1)
        clock++
        await fetch(tokenUrl, { method: 'POST' }); assert.equal(calls, 2)
    }
})

for (const mode of ['sdk', 'browser-ssr', 'server-ssr']) test(`actual pinned ${mode}: expired refresh429 retains credential state, fails verification, caps HTTP attempts and recovers after cooldown`, async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_798_000_000_000 })
    const key = 'synthetic-auth-token', values = new Map([[key, JSON.stringify(session(Math.floor(Date.now() / 1000) - 60))]])
    const events = [], calls = [], cookieWrites = []
    let successful = false
    const transport = async (input, init) => {
        const url = new URL(input); calls.push({ path: url.pathname, method: init.method })
        if (url.pathname.endsWith('/token')) return successful ? Response.json(session(Math.floor(Date.now() / 1000) + 3600)) : Response.json({ message: 'Synthetic throttle' }, { status: 429 })
        assert.equal(url.pathname, '/auth/v1/user'); return Response.json(user)
    }
    const fetch = createAuthFetch(origin, transport)
    const cookies = { getAll: () => [...values].map(([name, value]) => ({ name, value })), setAll: entries => { cookieWrites.push(...entries); for (const { name, value, options } of entries) { if (options.maxAge === 0) values.delete(name); else values.set(name, value) } } }
    const client = mode === 'sdk' ? createClient(origin, 'synthetic-anonymous-key', { global: { fetch }, auth: { storageKey: key, storage: { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value), removeItem: name => values.delete(name) }, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } })
        : (mode === 'browser-ssr' ? createBrowserClient : createServerClient)(origin, 'synthetic-anonymous-key', { global: { fetch }, cookieOptions: { name: key }, cookieEncoding: 'raw', cookies, isSingleton: false })
    client.auth.onAuthStateChange(event => { events.push(event) })
    const originalError = console.error; console.error = () => {}
    try {
        const result = await advanceUntilSettled(t, client.auth.getUser())
        assert.equal(result.error.status, 503); assert.equal(result.data.user, null)
        assert.equal(values.has(key), true); assert.equal(events.includes('SIGNED_OUT'), false)
        assert.equal(cookieWrites.some(cookie => cookie.options.maxAge === 0), false)
        assert.deepEqual(calls, [{ path: '/auth/v1/token', method: 'POST' }])
        successful = true; t.mock.timers.tick(60_001)
        const recovered = await advanceUntilSettled(t, client.auth.getUser())
        assert.equal(recovered.error, null); assert.equal(recovered.data.user.id, user.id)
        assert.equal(calls.filter(call => call.path.endsWith('/token')).length, 2)
    } finally { console.error = originalError; client.auth.stopAutoRefresh() }
})

for (const status of [400, 401]) test(`actual SDK hard refresh${status} still invalidates the session without a retry`, async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_798_000_000_000 })
    const key = 'synthetic-auth-token', values = new Map([[key, JSON.stringify(session(Math.floor(Date.now() / 1000) - 60))]]), events = []
    let calls = 0
    const client = createClient(origin, 'synthetic-anonymous-key', { global: { fetch: createAuthFetch(origin, async () => { calls++; return Response.json({ message: 'Invalid refresh token' }, { status }) }) }, auth: { storageKey: key, storage: { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value), removeItem: name => values.delete(name) }, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } })
    client.auth.onAuthStateChange(event => { events.push(event) })
    const originalError = console.error; console.error = () => {}
    try { const result = await advanceUntilSettled(t, client.auth.getUser()); assert.equal(result.error.status, status); assert.equal(values.has(key), false); assert.equal(events.includes('SIGNED_OUT'), true); assert.equal(calls, 1) }
    finally { console.error = originalError }
})

test('the overall verified-user read deadline ends before the SDK backoff, with no extra HTTP or authorized user', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_798_000_000_000 })
    let calls = 0
    const expired = session(Math.floor(Date.now() / 1000) - 60), key = 'synthetic-deadline', values = new Map([[key, JSON.stringify(expired)]])
    const client = createClient(origin, 'synthetic-anonymous-key', { global: { fetch: createAuthFetch(origin, async () => { calls++; return Response.json({ message: 'Throttle' }, { status: 429 }) }) }, auth: { storageKey: key, storage: { getItem: name => values.get(name) ?? null, setItem: (name, value) => values.set(name, value), removeItem: name => values.delete(name) }, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } })
    const originalError = console.error; console.error = () => {}
    try {
        const sdkRead = client.auth.getUser()
        const read = boundedClientRead(() => sdkRead, { timeoutMs: 5000 })
        await assert.rejects(advanceUntilSettled(t, read, 6000), { name: 'TimeoutError' })
        assert.equal(calls, 1); assert.equal(values.has(key), true)
        // Finish the SDK's bounded private backoff; the circuit emits no HTTP.
        await advanceUntilSettled(t, sdkRead)
        assert.equal(calls, 1)
    } finally { console.error = originalError }
})
