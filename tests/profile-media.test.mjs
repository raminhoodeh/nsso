import test, { beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const source = new URL('../src/', import.meta.url)
const moduleUrl = text => `data:text/javascript,${encodeURIComponent(text)}`
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: moduleUrl('export {};'), shortCircuit: true }
    if (specifier === '@/lib/supabase/server') return { url: moduleUrl('export const createClient = async()=>globalThis.__mediaSession;'), shortCircuit: true }
    if (specifier === '@/lib/server/runtime-signals') return { url: moduleUrl('export const reportRuntimeSignal = ()=>"synthetic-request";'), shortCircuit: true }
    if (specifier === '@/lib/server/runtime-guard') return { url: moduleUrl('export const guardActorUpload = async id=>{globalThis.__mediaQuotaChecks.push(id);return globalThis.__mediaQuotaDenied?Response.json({error:"Please pause briefly.",code:"rate_denied"},{status:429,headers:{"Cache-Control":"private, no-store"}}):null};'), shortCircuit: true }
    if (specifier === '@supabase/supabase-js') return { url: moduleUrl('export const createClient = ()=>{globalThis.__mediaCalls.push(["privileged"]);return globalThis.__mediaService};'), shortCircuit: true }
    if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`, source).href, context)
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(`${specifier}.ts`, context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
    return next(specifier, context)
} })
const { POST } = await import('../src/app/api/profile/media/route.ts')
hooks.deregister()
const actorId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222'
const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#ff000080' } }).png().toBuffer()
const jpeg = await sharp(png).withMetadata({ exif: { IFD0: { Artist: 'private-synthetic-fixture' } } }).jpeg().toBuffer()
let actor, calls, uploadError, registrationFailures
beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fixture.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only-not-a-secret'
    actor = { id: actorId }; calls = globalThis.__mediaCalls = []; uploadError = null; registrationFailures = 0
    globalThis.__mediaQuotaChecks = []; globalThis.__mediaQuotaDenied = false
    globalThis.__mediaSession = { auth: { getUser: async () => ({ data: { user: actor }, error: null }) } }
    globalThis.__mediaService = {
        storage: { from(bucket) { return {
            async upload(path, bytes, options) { calls.push(['upload', bucket, path, Buffer.from(bytes), options]); return { error: uploadError } },
            getPublicUrl(path) { return { data: { publicUrl: `https://fixture.supabase.co/storage/v1/object/public/${bucket}/${path}` } } },
            remove() { assert.fail('Registration uncertainty must never delete a potentially committed asset') },
        } } },
        async rpc(name, args) {
            calls.push(['rpc', name, args])
            if (registrationFailures-- > 0) throw new Error('private-storage-diagnostic')
            return { data: { assetId: 'fixture', bucket: args.p_bucket_id, objectName: args.p_object_name, contentType: args.p_content_type, bytes: args.p_bytes }, error: null }
        },
    }
})
function request(bytes = png, type = 'image/png', kind = 'avatar', extra = {}) {
    const form = new FormData(); form.set('kind', kind); form.set('file', new Blob([bytes], { type }), 'untrusted-name.svg')
    for (const [key, value] of Object.entries(extra)) form.set(key, value)
    return new Request('https://nsso.test/api/profile/media', { method: 'POST', headers: { origin: 'https://nsso.test', 'X-Nsso-Account': actorId }, body: form })
}
const unreadable = headers => new Proxy(new Request('https://nsso.test/api/profile/media', { method: 'POST', headers, body: 'not-consumed' }), { get(target, key) { if (key === 'body') assert.fail('Denied upload must not read bytes'); return Reflect.get(target, key, target) } })

test('authentication, origin and captured-account preconditions run before reading or storing bytes', async () => {
    actor = null
    assert.equal((await POST(unreadable({ origin: 'https://nsso.test' }))).status, 401)
    actor = { id: actorId }
    assert.equal((await POST(unreadable({ origin: 'https://outside.test' }))).status, 403)
    assert.equal((await POST(unreadable({ origin: 'https://nsso.test', 'X-Nsso-Account': otherId }))).status, 409)
    assert.equal((await POST(unreadable({ origin: 'https://nsso.test' }))).status, 409)
    assert.deepEqual(calls, [])
    assert.deepEqual(globalThis.__mediaQuotaChecks, [])
})

test('verified-account quota rejection precedes body parsing, image decoding and Storage work', async () => {
    globalThis.__mediaQuotaDenied = true
    const response = await POST(unreadable({ origin: 'https://nsso.test', 'X-Nsso-Account': actorId }))
    assert.equal(response.status, 429); assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(globalThis.__mediaQuotaChecks, [actorId]); assert.deepEqual(calls, [])
})

test('valid raster bytes become a metadata-free JPEG under a generated actor-owned identity', async () => {
    const response = await POST(request(jpeg, 'image/jpeg'))
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const body = await response.json(), upload = calls.find(call => call[0] === 'upload')
    assert.match(body.path, new RegExp(`^${actorId}/avatar/[a-f0-9-]{36}\\.jpg$`)); assert.equal(body.accountId, actorId)
    assert.equal(upload[1], 'avatars'); assert.equal(upload[2], body.path)
    assert.deepEqual(upload[4], { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
    const metadata = await sharp(upload[3]).metadata()
    assert.equal(metadata.format, 'jpeg'); assert.equal(metadata.exif, undefined); assert.equal(metadata.xmp, undefined)
    assert.deepEqual(calls.find(call => call[0] === 'rpc').slice(1), ['register_profile_media', { p_actor_id: actorId, p_bucket_id: 'avatars', p_object_name: body.path, p_content_type: 'image/jpeg', p_bytes: upload[3].length }])
})

test('project and product images preserve their kind with new portfolio paths and no overwrite', async () => {
    for (const kind of ['project', 'product']) {
        const response = await POST(request(png, 'image/png', kind)), body = await response.json()
        assert.equal(response.status, 200)
        assert.ok(body.path.startsWith(`${actorId}/${kind}/`)); assert.ok(body.url.includes('/portfolio-assets/'))
    }
    const writes = calls.filter(call => call[0] === 'upload')
    assert.notEqual(writes[0][2], writes[1][2]); assert.ok(writes.every(call => call[4].upsert === false))
})

test('fake JPEGs, SVG payloads, MIME mismatches and caller-chosen destinations never reach Storage', async () => {
    const attempts = [request(Buffer.from('<svg onload="bad()"/>'), 'image/jpeg'), request(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0]), 'image/jpeg'), request(png, 'image/jpeg'), request(png, 'text/html'), request(png, 'image/png', 'avatar', { path: `${otherId}/stolen.jpg` }), request(png, 'image/png', 'foreign-bucket')]
    for (const req of attempts) assert.ok([400, 415].includes((await POST(req)).status))
    assert.deepEqual(calls, [])
})

test('body, image-byte and decoded-pixel limits reject work before Storage access', async () => {
    const headers = { origin: 'https://nsso.test', 'X-Nsso-Account': actorId, 'content-type': 'multipart/form-data; boundary=fixture', 'content-length': String(12 * 1024 * 1024) }
    assert.equal((await POST(unreadable(headers))).status, 413)
    assert.equal((await POST(request(Buffer.alloc(5 * 1024 * 1024 + 1), 'image/jpeg'))).status, 413)
    const oversized = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(10 * 1024 * 1024 + 32769)); controller.close() } })
    const streamed = new Request('https://nsso.test/api/profile/media', { method: 'POST', duplex: 'half', headers: { origin: 'https://nsso.test', 'X-Nsso-Account': actorId, 'content-type': 'multipart/form-data; boundary=fixture' }, body: oversized })
    assert.equal((await POST(streamed)).status, 413)
    const large = await sharp({ create: { width: 6000, height: 4000, channels: 3, background: '#fff' } }).png().toBuffer()
    assert.equal((await POST(request(large, 'image/png'))).status, 415)
    assert.deepEqual(calls, [])
})

test('dropped registration replies reconcile the same object, while unknown outcomes retain it safely', async () => {
    registrationFailures = 1
    let response = await POST(request())
    assert.equal(response.status, 200)
    let registrations = calls.filter(call => call[0] === 'rpc')
    assert.equal(registrations.length, 2); assert.deepEqual(registrations[0], registrations[1])
    assert.equal(calls.filter(call => call[0] === 'upload').length, 1)
    calls.length = 0; registrationFailures = 2
    response = await POST(request())
    assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /private-storage-diagnostic/)
    assert.equal(calls.filter(call => call[0] === 'upload').length, 1)
    registrations = calls.filter(call => call[0] === 'rpc'); assert.equal(registrations.length, 2)
})
