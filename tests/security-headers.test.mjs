import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { prepareSecurityRequest, securityHeaders } from '../src/lib/server/security-headers.ts'
import { inlineScriptHashes, assertHashCoverage } from '../scripts/security/build-with-csp.mjs'

const env = { NODE_ENV: 'production', NSSO_CSP_MODE: 'enforce', NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co' }
const directive = (policy, name) => policy.split('; ').find(value => value.startsWith(name + ' ')) || ''

test('dynamic SSR receives a fresh nonce and caller-supplied policies cannot choose it', () => {
    const request = new Request('https://nsso.test/fixture-profile', { headers: { 'x-nonce': 'attacker', 'content-security-policy': "script-src 'unsafe-inline'", 'content-security-policy-report-only': "default-src *" } })
    const first = prepareSecurityRequest(request, env), second = prepareSecurityRequest(request, env)
    assert.match(first.nonce, /^[A-Za-z0-9+/]{24}$/)
    assert.notEqual(first.nonce, second.nonce)
    assert.equal(first.requestHeaders.get('x-nonce'), first.nonce)
    assert.equal(first.requestHeaders.get('Content-Security-Policy'), first.policy)
    assert.equal(first.requestHeaders.get('content-security-policy-report-only'), null)
    assert.doesNotMatch(directive(first.policy, 'script-src'), /unsafe-inline|unsafe-eval|attacker|https:\s/)
    assert.match(first.policy, /script-src-attr 'none'/)
    assert.match(first.policy, /form-action 'self' https:\/\/www.paypal.com/)
})

test('verified static hashes preserve cache headers and do not use reusable nonces', () => {
    const hashes = inlineScriptHashes('<script>window.fixture=1</script>')
    const manifest = { version: 1, buildId: 'fixture', routes: { '/': hashes } }
    const request = new Request('https://nsso.test/')
    const context = prepareSecurityRequest(request, env, manifest)
    assert.equal(context.nonce, null); assert.equal(context.requestHeaders.get('x-nonce'), null)
    assert.match(context.policy, new RegExp(hashes[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    const response = securityHeaders(request, new Response('', { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=31536000' } }), context)
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=31536000')
    assert.equal(response.headers.get('Content-Security-Policy'), context.policy)
    assert.equal(response.headers.get('Content-Security-Policy-Report-Only'), null)
})

test('report-only is explicit and sensitive response protections survive redirects and private cache headers', () => {
    const request = new Request('https://nsso.test/dashboard')
    const context = prepareSecurityRequest(request, { ...env, NSSO_CSP_MODE: 'report-only' })
    const response = securityHeaders(request, new Response(null, { status: 307, headers: { Location: '/sign-in', 'Cache-Control': 'private, no-store', 'Set-Cookie': 'fixture=rotated; HttpOnly' } }), context)
    assert.equal(response.status, 307); assert.equal(response.headers.get('Location'), '/sign-in')
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
    assert.match(response.headers.get('Set-Cookie'), /rotated/)
    assert.equal(response.headers.get('Content-Security-Policy'), null)
    assert.equal(response.headers.get('Content-Security-Policy-Report-Only'), context.policy)
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups')
    assert.match(response.headers.get('Permissions-Policy'), /camera=\(self\).*geolocation=\(self\)/)
})

test('Maps eval exception and provider access stay scoped to the map route', () => {
    for (const path of ['/', '/api/me', '/dashboard', '/film/razinflix']) {
        const context = prepareSecurityRequest(new Request('https://nsso.test' + path), env)
        assert.doesNotMatch(directive(context.policy, 'script-src'), /unsafe-eval|maps.googleapis.com/)
    }
    const maps = prepareSecurityRequest(new Request('https://nsso.test/places/dubai'), env)
    assert.match(directive(maps.policy, 'script-src'), /unsafe-eval/)
    assert.match(directive(maps.policy, 'connect-src'), /places.googleapis.com/)
    assert.doesNotMatch(maps.policy, /\*\.google|cdn.jsdelivr|cdnjs.cloudflare|unsafe-inline.*script/)
})

test('static extraction hashes actual script text, ignores external scripts and refuses changed builds', () => {
    const html = '<script src="/bundle.js"></script><script>window.fixture="<&";</script><script type="application/json">{"value":"x"}</script>'
    const hashes = inlineScriptHashes(html)
    assert.equal(hashes.length, 2)
    assert.ok(hashes.includes('sha256-' + createHash('sha256').update('window.fixture="<&";').digest('base64')))
    assertHashCoverage({ routes: { '/': hashes } }, { routes: { '/': hashes } })
    assert.throws(() => assertHashCoverage({ routes: { '/': ['sha256-changed'] } }, { routes: { '/': hashes } }), /refusing an unsafe artifact/)
})

test('vendored background files match fixed-version checksums and retain licenses', async () => {
    const manifest = JSON.parse(await readFile(new URL('../public/vendor/manifest.json', import.meta.url), 'utf8'))
    assert.equal(manifest.files.length, 2)
    for (const file of manifest.files) {
        const bytes = await readFile(new URL('../public/vendor/' + file.path, import.meta.url))
        assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
        assert.match(await readFile(new URL('../public/vendor/' + file.license, import.meta.url), 'utf8'), /Permission is hereby granted/)
    }
})
