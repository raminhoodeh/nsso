import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { setImmediate as turn } from 'node:timers/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = new URL('../src/', import.meta.url)
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'next/headers') return { url: 'data:text/javascript,' + encodeURIComponent('export const cookies=async()=>globalThis.__authDeadlineCookies;'), shortCircuit: true }
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(specifier + '.ts', context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
    return next(specifier, context)
} })
const { createClient } = await import('../src/lib/supabase/server.ts')
hooks.deregister()

test('the application server factory bounds the complete SDK task and retains SSR cookies on refresh throttling', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_798_000_000_000 })
    const originalFetch = globalThis.fetch, originalError = console.error, previousEnv = { ...process.env }
    const key = 'sb-auth-fixture-auth-token', expiry = Math.floor(Date.now() / 1000) - 60
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-26T00:00:00Z' }
    const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: user.id, exp: expiry, aud: 'authenticated', role: 'authenticated' }) + '.synthetic-signature'
    const value = 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user })).toString('base64url')
    const values = new Map([[key, value]]), writes = []
    globalThis.__authDeadlineCookies = { getAll: () => [...values].map(([name, value]) => ({ name, value })), set: (name, value, options) => { writes.push({ name, value, options }); if (options.maxAge === 0) values.delete(name); else values.set(name, value) } }
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://auth-fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anonymous-key' })
    let calls = 0
    globalThis.fetch = async input => { assert.equal(new URL(input).pathname, '/auth/v1/token'); calls++; return Response.json({ message: 'Synthetic throttle' }, { status: 429 }) }
    console.error = () => {}
    try {
        const client = await createClient({ timeoutMs: 5000 })
        const started = Date.now()
        let outcome
        const read = client.auth.getUser().then(value => { outcome = { value } }, error => { outcome = { error } })
        for (let elapsed = 0; !outcome && elapsed < 6000; elapsed += 200) { await turn(); t.mock.timers.tick(200) }
        await turn(); await read
        assert.equal(outcome.error?.name, 'TimeoutError')
        assert.ok(Date.now() - started <= 5200)
        assert.equal(calls, 1); assert.equal(values.get(key), value); assert.deepEqual(writes, [])
        // Drain the pinned SDK's existing bounded backoff under fake time.
        for (let elapsed = 0; elapsed < 30_000; elapsed += 200) { await turn(); t.mock.timers.tick(200) }
        assert.equal(calls, 1); assert.equal(values.get(key), value); assert.deepEqual(writes, [])
    } finally { globalThis.fetch = originalFetch; console.error = originalError; process.env = previousEnv; delete globalThis.__authDeadlineCookies }
})

test('the pinned SSR client can refresh a deletion identity without writing over a replacement account cookie', async () => {
    const previousEnv = { ...process.env }, originalFetch = globalThis.fetch
    const key = 'sb-readonly-fixture-auth-token', now = Math.floor(Date.now() / 1000)
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-26T00:00:00Z' }
    const token = exp => encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: user.id, exp, aud: 'authenticated', role: 'authenticated' }) + '.synthetic-signature'
    const session = { access_token: token(now - 60), refresh_token: 'synthetic-refresh', expires_at: now - 60, expires_in: 3600, token_type: 'bearer', user }
    const values = new Map([[key, 'base64-' + encode(session)]]), writes = []
    globalThis.__authDeadlineCookies = { getAll: () => [...values].map(([name, value]) => ({ name, value })), set: (...args) => writes.push(args) }
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://readonly-fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anonymous-key' })
    let refreshed = false
    globalThis.fetch = async input => {
        const path = new URL(input).pathname
        if (path === '/auth/v1/token') {
            refreshed = true
            // A newer browser sign-in arrives while the identity-bound request
            // is still authenticating. Its response must not overwrite B.
            values.set(key, 'replacement-account-cookie')
            return Response.json({ ...session, access_token: token(now + 3600), expires_at: now + 3600 })
        }
        assert.equal(path, '/auth/v1/user')
        return Response.json(user)
    }
    try {
        const client = await createClient({ readOnlyCookies: true })
        const result = await client.auth.getUser()
        assert.equal(result.error, null)
        assert.equal(result.data.user.id, user.id)
        assert.equal(refreshed, true)
        assert.deepEqual(writes, [])
        assert.equal(values.get(key), 'replacement-account-cookie')
    } finally { process.env = previousEnv; globalThis.fetch = originalFetch; delete globalThis.__authDeadlineCookies }
})
