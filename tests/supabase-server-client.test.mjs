import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = new URL('../src/', import.meta.url)
const previousEnvironment = { ...process.env }
Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://configured-fixture.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-anonymous-key' })
const moduleUrl = text => `data:text/javascript,${encodeURIComponent(text)}`
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@supabase/ssr') return { url: moduleUrl('export const createServerClient=(url,key,options)=>({options,auth:{getUser:async()=>({data:{user:null},error:null})}});'), shortCircuit: true }
    if (specifier === 'next/headers') return { url: moduleUrl('export const cookies=async()=>({getAll:()=>[],set(...args){globalThis.__serverCookieWrites.push(args)}});'), shortCircuit: true }
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(specifier + '.ts', context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
    return next(specifier, context)
} })
const { createClient } = await import('../src/lib/supabase/server.ts')
hooks.deregister()
const previousFetch = globalThis.fetch
after(() => { globalThis.fetch = previousFetch; process.env = previousEnvironment })

test('identity-bound deletion verifies Auth without queuing cookies over a newer sign-in', async () => {
    globalThis.__serverCookieWrites = []
    const readOnly = await createClient({ readOnlyCookies: true })
    readOnly.options.cookies.setAll([{ name: 'synthetic-session', value: 'old-account-refresh', options: { path: '/' } }])
    assert.deepEqual(globalThis.__serverCookieWrites, [])
    const ordinary = await createClient()
    ordinary.options.cookies.setAll([{ name: 'synthetic-session', value: 'ordinary-refresh', options: { path: '/' } }])
    assert.equal(globalThis.__serverCookieWrites.length, 1, 'Ordinary SSR refresh behavior remains unchanged')
})

test('server database transport adds a timeout while preserving caller cancellation and cookie adapters', async () => {
    const calls = []
    globalThis.fetch = async (...args) => { calls.push(args); return Response.json({}) }
    const client = await createClient()
    const controller = new AbortController()
    await client.options.global.fetch('https://synthetic.test/rest/v1/profiles', { signal: controller.signal, method: 'PATCH', body: 'synthetic patch' })
    assert.notEqual(calls[0][1].signal, controller.signal)
    assert.equal(calls[0][1].method, 'PATCH'); assert.equal(calls[0][1].body, 'synthetic patch')
    controller.abort(); assert.equal(calls[0][1].signal.aborted, true)
    assert.deepEqual(client.options.cookies.getAll(), [])
})

test('the optional viewer transport can use a shorter deadline without changing ordinary clients', async () => {
    globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
    const client = await createClient({ timeoutMs: 5 })
    // AbortSignal.timeout is intentionally unref'ed; this keeps only the test's
    // own event loop alive while checking the transport's actual timeout.
    const keepAlive = setTimeout(() => {}, 100)
    try { await assert.rejects(client.options.global.fetch('https://synthetic.test/auth/v1/user'), { name: 'TimeoutError' }) }
    finally { clearTimeout(keepAlive) }
})
