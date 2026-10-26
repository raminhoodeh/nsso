import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = new URL('../src/', import.meta.url)
const moduleUrl = text => `data:text/javascript,${encodeURIComponent(text)}`
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: moduleUrl('export {};'), shortCircuit: true }
    if (specifier === '@/lib/supabase/server') return { url: moduleUrl('export const createClient = ()=>{throw Error("Photo reads must not use Auth")};'), shortCircuit: true }
    if (specifier === '@/lib/server/runtime-signals') return { url: moduleUrl('export const reportRuntimeSignal = ()=>"synthetic-request";'), shortCircuit: true }
    if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`, source).href, context)
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(`${specifier}.ts`, context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
    return next(specifier, context)
} })
const { GET } = await import('../src/app/api/places/photo/route.ts')
hooks.deregister()

const originalFetch = globalThis.fetch, originalEnvironment = { ...process.env }
const key = 'synthetic-public-google-key'
const cdn = 'https://lh3.googleusercontent.com/places/synthetic-photo=w720-h540'
const newUrl = (params = {}) => {
    const url = new URL('https://places.googleapis.com/v1/places/ChIJ_synthetic/photos/AaW_synthetic-Photo/media')
    url.search = new URLSearchParams({ maxWidthPx: '1440', maxHeightPx: '1080', key, ...params }).toString()
    return url.href
}
const legacyUrl = (reference = 'photo_reference') => `https://maps.googleapis.com/maps/api/place/photo?${new URLSearchParams({ [reference]: 'synthetic-photo-reference', maxwidth: '720', key })}`
const request = (photo = newUrl(), headers = {}, signal) => {
    const url = new URL('https://preview.nsso.test/api/places/photo')
    url.searchParams.set('url', photo)
    return new Request(url, { headers, signal })
}
const raster = (headers = {}) => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpeg', ...headers } })
let calls, replies
beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = key
    process.env.NEXT_PUBLIC_SITE_URL = 'https://nsso.me'
    calls = []; replies = [raster()]
    globalThis.fetch = async (input, init) => {
        calls.push({ url: String(input), ...init, headers: new Headers(init.headers) })
        const reply = replies.shift()
        return typeof reply === 'function' ? reply(input, init) : reply
    }
})
after(() => { globalThis.fetch = originalFetch; process.env = originalEnvironment })

test('the actual New media URL gets only the configured canonical website Referer', async () => {
    const response = await GET(request(newUrl(), { origin: 'https://preview.nsso.test', referer: 'https://untrusted.test/private?token=do-not-forward', cookie: 'private-session', authorization: 'Bearer private' }))
    assert.equal(response.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].headers.get('referer'), 'https://nsso.me/')
    assert.equal(calls[0].headers.get('cookie'), null)
    assert.equal(calls[0].headers.get('authorization'), null)
    assert.equal(calls[0].redirect, 'manual')
    assert.equal(calls[0].credentials, 'omit')
    assert.equal(calls[0].cache, 'no-store')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin')
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('content-type'), 'image/jpeg')
    assert.equal((await response.arrayBuffer()).byteLength, 4)
})

test('Legacy photo requests accept the documented and older reference spellings, bounded dimensions and www origin', async () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://www.nsso.me/'
    for (const url of [legacyUrl(), legacyUrl('photoreference'), newUrl({ maxWidthPx: '4800', maxHeightPx: '1', skipHttpRedirect: 'false' })]) {
        replies.push(raster())
        assert.equal((await GET(request(url))).status, 200)
    }
    assert.ok(calls.every(call => call.headers.get('referer') === 'https://www.nsso.me/'))
})

test('other Maps/Places API methods, alternate hosts and ambiguous or unbounded photo parameters are rejected before fetch', async () => {
    const attempts = [
        newUrl().replace('/photos/AaW_synthetic-Photo/media', '/details'),
        newUrl().replace('/media?', '/media/extra?'),
        newUrl().replace('ChIJ_synthetic', '%252Fother'),
        newUrl().replace('ChIJ_synthetic', '%2Fother'),
        newUrl().replace('places.googleapis.com', 'places.googleapis.com.attacker.test'),
        newUrl().replace('https://', 'http://'),
        newUrl().replace('https://', 'https://caller:password@'),
        newUrl().replace('places.googleapis.com', 'places.googleapis.com:8443'),
        newUrl().replace('/v1/places/', '/v1/%70laces/'),
        'https://maps.googleapis.com/maps/api/place/details/json?place_id=synthetic&key=' + key,
        newUrl({ key: 'different-key' }), newUrl() + '&key=' + key,
        newUrl({ maxWidthPx: '4801' }), newUrl({ maxWidthPx: '0' }), newUrl({ maxHeightPx: '1.5' }),
        newUrl({ skipHttpRedirect: 'true' }), newUrl() + '&fields=*', newUrl() + '&maxWidthPx=1',
        newUrl().replace(/maxWidthPx=1440&maxHeightPx=1080&/, ''),
        legacyUrl().replace('maxwidth=720', 'maxwidth=1601'),
        legacyUrl() + '&photoreference=ambiguous', legacyUrl().replace('synthetic-photo-reference', ''),
        'https://127.0.0.1/private', 'https://metadata.google.internal/private', 'https://googleusercontent.com/private',
        'https://lh3.googleusercontent.com.attacker.test/private',
    ]
    for (const url of attempts) assert.equal((await GET(request(url))).status, 400, url.replace(key, 'fixture-key'))
    assert.equal(calls.length, 0)
})

test('API photo configuration fails closed without copying untrusted site origins into Referer', async () => {
    for (const site of ['', 'http://nsso.me', 'https://outside.test', 'https://nsso.me/path', 'https://nsso.me?query=value', 'https://nsso.me/#fragment', 'https://user@nsso.me']) {
        process.env.NEXT_PUBLIC_SITE_URL = site
        assert.equal((await GET(request())).status, 503)
    }
    process.env.NEXT_PUBLIC_SITE_URL = 'https://nsso.me'
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    assert.equal((await GET(request())).status, 503)
    assert.equal(calls.length, 0)
})

test('cross-site browser photo requests are refused before Google work', async () => {
    for (const headers of [{ origin: 'https://outside.test' }, { 'sec-fetch-site': 'cross-site' }]) {
        const response = await GET(request(newUrl(), headers))
        assert.equal(response.status, 403)
        assert.equal(response.headers.get('cache-control'), 'private, no-store')
    }
    assert.equal(calls.length, 0)
})

test('a valid API redirect drops Referer on every CDN hop, including relative redirects', async () => {
    replies = [new Response(null, { status: 302, headers: { location: cdn } }), new Response(null, { status: 307, headers: { location: '/places/final' } }), raster()]
    assert.equal((await GET(request())).status, 200)
    assert.equal(calls.length, 3)
    assert.equal(calls[0].headers.get('referer'), 'https://nsso.me/')
    assert.equal(calls[1].headers.get('referer'), null)
    assert.equal(calls[2].headers.get('referer'), null)
    assert.equal(calls[2].url, 'https://lh3.googleusercontent.com/places/final')
})

test('direct CDN photos remain available without API config and never receive website or caller Referer', async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL; delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    for (const url of [cdn, 'https://images.ggpht.com/synthetic-photo', 'https://lh5.googleusercontent.com/synthetic-photo']) {
        replies.push(raster())
        assert.equal((await GET(request(url, { referer: 'https://preview.nsso.test/private' }))).status, 200)
    }
    assert.ok(calls.every(call => call.headers.get('referer') === null))
})

test('redirects cannot pivot back into API calls, private hosts, insecure URLs or credential-bearing URLs', async () => {
    for (const location of [newUrl(), legacyUrl(), 'https://outside.test/image.jpg', 'https://127.0.0.1/image', 'http://lh3.googleusercontent.com/photo', 'https://user:password@lh3.googleusercontent.com/photo']) {
        calls = []; replies = [new Response(null, { status: 302, headers: { location } })]
        const response = await GET(request())
        assert.equal(response.status, 502)
        assert.equal(calls.length, 1)
        assert.doesNotMatch(await response.text(), /synthetic|password|127\.0\.0\.1/)
    }
})

test('redirect loops stop after four hops and missing redirect destinations fail closed', async () => {
    replies = Array.from({ length: 5 }, () => new Response(null, { status: 302, headers: { location: cdn } }))
    assert.equal((await GET(request())).status, 502); assert.equal(calls.length, 5)
    calls = []; replies = [new Response(null, { status: 302 })]
    assert.equal((await GET(request())).status, 502); assert.equal(calls.length, 1)
})

test('only nonempty successful raster responses within declared and streamed byte limits are returned', async () => {
    let canceled = false
    for (const reply of [new Response('private-error', { status: 403, headers: { 'content-type': 'image/png' } }), new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }), new Response('{}', { headers: { 'content-type': 'application/json' } }), new Response('', { headers: { 'content-type': 'image/jpeg' } }), raster({ 'content-length': String(8 * 1024 * 1024 + 1) }), new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)) }, cancel() { canceled = true } }), { headers: { 'content-type': 'image/png' } })]) {
        replies = [reply]
        assert.equal((await GET(request())).status, 502)
    }
    assert.equal(canceled, true)
})

test('request cancellation aborts in-flight Google work and already canceled requests do no network work', async () => {
    const controller = new AbortController()
    replies = [(_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))]
    const pending = GET(request(newUrl(), {}, controller.signal))
    controller.abort()
    assert.equal((await pending).status, 502)
    assert.equal(calls[0].signal.aborted, true)
    calls = []
    assert.equal((await GET(request(newUrl(), {}, controller.signal))).status, 502)
    assert.equal(calls.length, 0)
})
