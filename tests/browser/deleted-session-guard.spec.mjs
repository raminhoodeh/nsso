import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const actor = '11111111-1111-4111-8111-111111111111'
const replacement = '22222222-2222-4222-8222-222222222222'
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', define: {
        'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://fixture.supabase.co"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"synthetic-browser-fixture-key"',
    }, stdin: { resolveDir: root, loader: 'ts', contents: `
        import{createClient}from'./src/lib/supabase/client';
        import{clearDeletedAccountSession}from'./src/lib/supabase/deleted-account-session';
        import{stringToBase64URL}from'@supabase/ssr';
        window.client=createClient();window.clearDeletedAccountSession=clearDeletedAccountSession;
        window.fixtureSignIn=async id=>{const result=await window.client.auth.signInWithPassword({email:id+'@example.invalid',password:'synthetic-fixture-only'});if(result.error)throw result.error;return result.data.user.id};
        window.mixedSession=()=>{const jwt=stringToBase64URL('{}')+'.'+stringToBase64URL(JSON.stringify({sub:'${actor}'}))+'.signature';document.cookie='sb-fixture-auth-token=base64-'+stringToBase64URL(JSON.stringify({access_token:jwt,user:{id:'${replacement}'}}))+'; Path=/'};
    ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page, { large = false } = {}) {
    const calls = []
    await page.route('https://fixture.supabase.co/**', route => {
        const url = new URL(route.request().url())
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
        calls.push(url.pathname)
        if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
            const id = route.request().postDataJSON().email.split('@')[0]
            const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
            const payload = Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')
            return route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify({ access_token: `${header}.${payload}.signature`, refresh_token: 'synthetic-refresh-'+id, token_type: 'bearer', expires_in: 3600, user: { id, email: id+'@example.invalid', user_metadata: { about: large ? 'Fixture '.repeat(1000) : '' }, app_metadata: { provider: 'email' }, identities: [], created_at: new Date().toISOString() } }) })
        }
        return route.fulfill({ status: 500, headers, contentType: 'application/json', body: JSON.stringify({ message: 'Unexpected fixture Auth request' }) })
    })
    await page.route('https://nsso.test/**', route => new URL(route.request().url()).pathname === '/fixture.js'
        ? route.fulfill({ contentType: 'application/javascript', body: bundle })
        : route.fulfill({ contentType: 'text/html', body: '<script src="/fixture.js"></script>' }))
    await page.goto('https://nsso.test/')
    await page.waitForFunction(() => window.fixtureSignIn)
    return calls
}

test('real pinned SSR client session chunks are removed only for the deleted actor; verifier and unrelated cookies remain', async ({ page }) => {
    const calls = await mount(page, { large: true })
    await page.evaluate(id => window.fixtureSignIn(id), actor)
    const chunks = (await page.context().cookies()).filter(cookie => /^sb-fixture-auth-token\.\d+$/.test(cookie.name))
    expect(chunks.length).toBeGreaterThan(1)
    await page.evaluate(() => { document.cookie='sb-fixture-auth-token-code-verifier=another-oauth-attempt; Path=/'; document.cookie='unrelated=keep; Path=/' })
    expect(await page.evaluate(id => window.clearDeletedAccountSession(id), actor)).toBe('cleared')
    expect(await page.evaluate(async () => (await window.client.auth.getSession()).data.session)).toBeNull()
    const cookies = await page.context().cookies()
    expect(cookies.find(cookie => cookie.name === 'unrelated')?.value).toBe('keep')
    expect(cookies.find(cookie => cookie.name === 'sb-fixture-auth-token-code-verifier')?.value).toBe('another-oauth-attempt')
    expect(calls).toEqual(['/auth/v1/token'])
})

test('a real SDK replacement sign-in during a held deletion cannot be removed by actor A cleanup', async ({ page }) => {
    const calls = await mount(page)
    await page.evaluate(id => window.fixtureSignIn(id), actor)
    await page.evaluate(id => {
        let release
        const held = new Promise(resolve => { release = resolve })
        window.releaseDeletion = release
        window.pendingDeletion = held.then(() => window.clearDeletedAccountSession(id))
    }, actor)
    await page.evaluate(id => window.fixtureSignIn(id), replacement)
    const before = await page.context().cookies()
    expect(await page.evaluate(async () => { window.releaseDeletion(); return await window.pendingDeletion })).toBe('account-changed')
    expect(await page.context().cookies()).toEqual(before)
    expect(await page.evaluate(async () => (await window.client.auth.getSession()).data.session?.user.id)).toBe(replacement)
    expect(calls).toEqual(['/auth/v1/token', '/auth/v1/token'])
})

test('malformed, incomplete and mixed-subject cookies fail closed without changing any stored value', async ({ page }) => {
    await mount(page, { large: true })
    await page.evaluate(id => window.fixtureSignIn(id), actor)
    await page.evaluate(() => { document.cookie='sb-fixture-auth-token.0=; Max-Age=0; Path=/' })
    const incomplete = await page.context().cookies()
    expect(await page.evaluate(id => window.clearDeletedAccountSession(id), actor)).toBe('unavailable')
    expect(await page.context().cookies()).toEqual(incomplete)
    await page.context().clearCookies()
    await page.evaluate(() => window.mixedSession())
    const mixed = await page.context().cookies()
    expect(await page.evaluate(id => window.clearDeletedAccountSession(id), actor)).toBe('unavailable')
    expect(await page.context().cookies()).toEqual(mixed)
})
