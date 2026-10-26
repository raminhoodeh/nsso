import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { prepareSecurityRequest, securityHeaders } from '../../src/lib/server/security-headers.ts'
import { inlineScriptHashes } from '../../scripts/security/build-with-csp.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const env = { NODE_ENV: 'production', NSSO_CSP_MODE: 'enforce', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co' }
const dynamicFixtureManifest = { version: 1, buildId: null, routes: {} }
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' }, stdin: { resolveDir: root, loader: 'tsx', contents: `
        import React from 'react';import {createRoot} from 'react-dom/client';
        import {QRCodeSVG} from 'qrcode.react';import PayPal from './src/components/ui/PayPalSmartButton';
        import Meta from './src/components/analytics/MetaPixelConsent';
        const root=createRoot(document.getElementById('root'));
        window.renderQR=()=>root.render(<QRCodeSVG value="https://nsso.test/fixture-profile" title="Profile QR code"/>);
        window.renderPayPal=()=>root.render(<PayPal config={{version:1,kind:'hosted-button',hostedButtonId:'FIXTUREGBP',currency:'GBP'}}/>);
        window.renderMeta=consent=>root.render(<Meta key={consent} pixelId="1234567890" initialConsent={consent}/>);
    ` } })
    bundle = result.outputFiles[0].text
})

async function fixture(page, path = '/fixture-profile', extra = '') {
    const request = new Request('https://nsso.test' + path)
    // Keep synthetic HTML independent of an in-progress two-pass build's real
    // static route hashes. This fixture intentionally exercises a nonce page.
    const context = prepareSecurityRequest(request, env, dynamicFixtureManifest)
    const headers = Object.fromEntries(securityHeaders(request, new Response(), context).headers)
    const requests = []
    await page.route('**/*', async route => {
        const url = route.request().url(); requests.push(url)
        if (url === request.url) return route.fulfill({ contentType: 'text/html', headers, body: `<div id="root"></div><script nonce="${context.nonce}">window.violations=[];document.addEventListener('securitypolicyviolation',e=>window.violations.push({directive:e.effectiveDirective,blocked:e.blockedURI}));</script><script src="/fixture.js"></script>${extra}` })
        if (url === 'https://nsso.test/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.startsWith('https://nsso.test/vendor/')) return route.fulfill({ contentType: 'application/javascript', body: await readFile(new URL('../../public/' + new URL(url).pathname.slice(1), import.meta.url)) })
        if (url.startsWith('https://www.paypal.com/sdk/js')) return route.fulfill({ contentType: 'application/javascript', body: `const n=document.currentScript.dataset.namespace;window[n]={HostedButtons:()=>({render:c=>{const b=document.createElement('button');b.textContent='Provider checkout';c.append(b)}})};` })
        if (url.startsWith('https://connect.facebook.net/')) return route.fulfill({ contentType: 'application/javascript', body: 'window.pixelLoaded=true;' })
        if (url.startsWith('https://maps.googleapis.com/')) return route.fulfill({ contentType: 'application/javascript', body: 'window.mapProviderLoaded=true;' })
        if (url.startsWith('https://www.youtube.com/embed/')) return route.fulfill({ contentType: 'text/html', body: '<p>Video provider fixture</p>' })
        if (url === 'https://nsso.test/api/deity/chat') return route.fulfill({ contentType: 'text/plain', body: 'Synthetic chat stream' })
        throw new Error('Unexpected external request: ' + url)
    })
    await page.goto(request.url)
    return requests
}

test('enforced CSP blocks injected inline scripts and executable HTML attributes', async ({ page }) => {
    await fixture(page, '/fixture-profile', '<script>window.injectedScript=true</script><img src="data:image/png,x" onerror="window.injectedAttribute=true">')
    await page.waitForFunction(() => window.violations.length >= 2)
    expect(await page.evaluate(() => window.injectedScript)).toBeUndefined()
    expect(await page.evaluate(() => window.injectedAttribute)).toBeUndefined()
    expect(await page.evaluate(() => window.violations.map(v => v.directive))).toEqual(expect.arrayContaining(['script-src-elem', 'script-src-attr']))
})

test('hash-only static HTML hydrates its approved script while rejecting added code', async ({ page }) => {
    const inline = 'window.staticReady=true;window.staticViolations=[];document.addEventListener("securitypolicyviolation",e=>window.staticViolations.push(e.effectiveDirective));'
    const request = new Request('https://nsso.test/static-fixture')
    const context = prepareSecurityRequest(request, env, { version: 1, buildId: 'fixture', routes: { '/static-fixture': inlineScriptHashes(`<script>${inline}</script>`) } })
    expect(context.nonce).toBeNull()
    const headers = Object.fromEntries(securityHeaders(request, new Response(null, { headers: { 'Cache-Control': 'public, max-age=60' } }), context).headers)
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', headers, body: `<script>${inline}</script><script>window.staticInjected=true</script><p>Static fixture</p>` }))
    await page.goto(request.url)
    await page.waitForFunction(() => window.staticReady && window.staticViolations.length)
    expect(await page.evaluate(() => window.staticInjected)).toBeUndefined()
})

test('local background libraries, QR, YouTube, provider checkout and chat remain usable under enforcement', async ({ page }) => {
    await fixture(page, '/fixture-profile', '<script src="/vendor/three-r134/three.min.js"></script><script src="/vendor/vanta-0.5.24/vanta.clouds.min.js"></script><iframe title="Trailer" src="https://www.youtube.com/embed/FIXTURE1234"></iframe>')
    await page.waitForFunction(() => window.THREE?.REVISION === '134' && typeof window.VANTA?.CLOUDS === 'function')
    await page.evaluate(() => window.renderQR())
    await expect(page.locator('svg')).toBeVisible()
    await page.evaluate(() => window.renderPayPal())
    await expect(page.getByRole('button', { name: 'Provider checkout' })).toBeVisible()
    expect(await page.evaluate(async () => (await fetch('/api/deity/chat', { method: 'POST' })).text())).toBe('Synthetic chat stream')
    expect(await page.evaluate(() => window.violations)).toEqual([])
})

test('marketing provider stays off until consent and loads without inline-script exceptions', async ({ page }) => {
    const requests = await fixture(page)
    await page.evaluate(() => window.renderMeta('denied'))
    expect(requests.some(url => url.includes('facebook'))).toBe(false)
    await page.evaluate(() => window.renderMeta('granted'))
    await page.waitForFunction(() => window.pixelLoaded)
    expect(await page.evaluate(() => window.fbq.queue)).toEqual(expect.arrayContaining([['init', '1234567890'], ['consent', 'grant'], ['track', 'PageView']]))
    expect(await page.evaluate(() => window.violations)).toEqual([])
})

test('map provider scripts are allowed only on the map page without contacting live Maps services', async ({ page }) => {
    await fixture(page, '/places/dubai', '<script src="https://maps.googleapis.com/maps/api/js?fixture=1"></script>')
    await page.waitForFunction(() => window.mapProviderLoaded)
    expect(await page.evaluate(() => window.violations)).toEqual([])
})

test('CSP permits the OAuth redirect navigation without running a live sign-in', async ({ page }) => {
    await fixture(page)
    await page.route('https://accounts.google.com/o/oauth2/v2/auth?fixture=1', route => route.fulfill({ contentType: 'text/html', body: '<p>OAuth provider fixture</p>' }))
    await page.evaluate(() => { window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?fixture=1' })
    await expect(page).toHaveURL('https://accounts.google.com/o/oauth2/v2/auth?fixture=1')
    await expect(page.getByText('OAuth provider fixture')).toBeVisible()
})

test('private no-store API responses are fetched again after switching two fixture identities', async ({ page }) => {
    let reads = 0
    const server = createServer((request, response) => {
        if (request.url === '/api/me') {
            reads++
            const actor = /actor=(actor-[ab])/.exec(request.headers.cookie || '')?.[1] || 'signed-out'
            response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' })
            response.end(JSON.stringify({ id: actor, privateValue: actor + ' private draft' }))
        } else { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<p>Local identity cache fixture</p>') }
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = 'http://127.0.0.1:' + server.address().port
    try {
        // No routing/interception: Chrome's normal HTTP cache remains enabled.
        await page.goto(origin)
        const first = await page.evaluate(async () => { document.cookie = 'actor=actor-a; Path=/'; const r = await fetch('/api/me'); return { cache: r.headers.get('cache-control'), body: await r.json() } })
        const second = await page.evaluate(async () => { document.cookie = 'actor=actor-b; Path=/'; const r = await fetch('/api/me'); return { cache: r.headers.get('cache-control'), body: await r.json() } })
        expect(first.cache).toBe('private, no-store'); expect(second.cache).toBe('private, no-store')
        expect(first.body.id).toBe('actor-a'); expect(second.body.id).toBe('actor-b')
        expect(second.body.privateValue).not.toContain('actor-a'); expect(reads).toBe(2)
    } finally { await new Promise(resolve => server.close(resolve)) }
})
