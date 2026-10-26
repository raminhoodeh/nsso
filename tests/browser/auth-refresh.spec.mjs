import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife',
        define: { 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://auth-fixture.supabase.co"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"synthetic-anonymous-key"' },
        stdin: { resolveDir: root, loader: 'ts', contents: `
            import {createClient} from './src/lib/supabase/client';
            window.fixtureEvents=[];const client=createClient();
            client.auth.onAuthStateChange(event=>window.fixtureEvents.push(event));
            window.fixtureVerify=(async()=>{await client.auth.initialize();await client.auth.stopAutoRefresh();const result=await client.auth.getUser();window.fixtureResult={status:result.error?.status,verifiedUser:!!result.data.user};})();
        ` },
    })
    bundle = result.outputFiles[0].text
})

test('the real browser factory preserves an expired credential on Auth429 while verification fails closed and native HTTP is capped', async ({ page, context }) => {
    const now = 1_798_000_000_000
    await page.clock.install({ time: new Date(now) })
    const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-26T00:00:00Z' }
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), expiry = Math.floor(now / 1000) - 60
    const access = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: user.id, exp: expiry, aud: 'authenticated', role: 'authenticated' }) + '.synthetic-signature'
    const value = 'base64-' + encode({ access_token: access, refresh_token: 'synthetic-refresh', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user })
    await context.addCookies([{ name: 'sb-auth-fixture-auth-token', value, domain: 'nsso.test', path: '/', secure: true, sameSite: 'Lax' }])
    const requests = [], errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin === 'https://nsso.test') return route.fulfill({ contentType: 'text/html', body: '<div id="fixture"></div>' })
        expect(url.origin).toBe('https://auth-fixture.supabase.co')
        expect(url.pathname).toBe('/auth/v1/token')
        expect(url.searchParams.get('grant_type')).toBe('refresh_token')
        requests.push({ path: url.pathname, method: route.request().method() })
        return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"message":"Synthetic Auth throttle"}' })
    })
    await page.goto('https://nsso.test/fixture')
    await page.addScriptTag({ content: bundle })
    await expect.poll(() => requests.length).toBe(1)
    // Native fetch is untouched. Fake time advances only the pinned SDK's
    // existing internal backoff; all outgoing requests use Chromium's fetch.
    for (let step = 0; step < 56; step++) {
        if (await page.evaluate(() => Boolean(window.fixtureResult))) break
        await page.clock.fastForward(1000)
    }
    await expect.poll(() => page.evaluate(() => window.fixtureResult)).toEqual({ status: 503, verifiedUser: false })
    expect(requests).toEqual([{ path: '/auth/v1/token', method: 'POST' }])
    expect(await page.evaluate(() => window.fixtureEvents.includes('SIGNED_OUT'))).toBe(false)
    const cookie = (await context.cookies()).find(cookie => cookie.name === 'sb-auth-fixture-auth-token')
    expect(cookie?.value).toBe(value)
    expect(errors).toEqual([])
})
