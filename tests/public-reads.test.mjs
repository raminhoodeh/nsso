import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const source = new URL('../src/', import.meta.url)
const moduleUrl = text => `data:text/javascript,${encodeURIComponent(text)}`
const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: moduleUrl('export {};'), shortCircuit: true }
    if (specifier === '@/lib/supabase/server') return { url: moduleUrl('export const createClient = async()=>globalThis.__publicViewerSession;'), shortCircuit: true }
    if (specifier.startsWith('@/')) return next(new URL(specifier.slice(2) + '.ts', source).href, context)
    if (specifier === '../urls') return next(new URL('lib/urls.ts', source).href, context)
    return next(specifier, context)
} })
const { loadPublicProfile, loadPublicProfileMetadata, loadPublicProfileViewer } = await import('../src/lib/public-profile.ts')
const { createPublicReadClient } = await import('../src/lib/supabase/public.ts')
hook.deregister()
const originalFetch = globalThis.fetch, previousEnvironment = { ...process.env }
const profileId = '11111111-1111-4111-8111-111111111111'
let requests, viewerCalls
beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://public-fixture.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anonymous-key'
    requests = []; viewerCalls = 0
    globalThis.__publicViewerSession = { auth: { getUser: async () => { viewerCalls++; throw new Error('Synthetic expired-session Auth outage') } }, from: () => assert.fail('An unavailable viewer must not read private connection flags') }
    globalThis.fetch = async (input, init) => {
        const url = new URL(input), headers = new Headers(init.headers)
        requests.push({ url, headers, init })
        assert.equal(url.origin, 'https://public-fixture.supabase.co')
        assert.ok(url.pathname.startsWith('/rest/v1/'), 'Public reads must never refresh or validate Auth')
        assert.equal(headers.get('authorization'), 'Bearer synthetic-anonymous-key')
        assert.equal(headers.has('cookie'), false)
        assert.equal(init.cache, 'no-store')
        assert.ok(init.signal instanceof AbortSignal)
        const table = url.pathname.split('/').at(-1)
        const data = table === 'users' ? { id: profileId, username: 'public-fixture' }
            : table === 'profiles' ? { user_id: profileId, full_name: 'Public Fixture', headline: 'Public content remains available', bio: 'Synthetic public bio' }
                : table === 'razinflix_films' ? [{ id: 1, title: 'Public fixture film' }] : []
        return Response.json(data)
    }
})
after(() => { globalThis.fetch = originalFetch; process.env = previousEnvironment })

test('profile metadata and all public collections use anonymous requests independently of a viewer Auth outage', async () => {
    const metadata = await loadPublicProfileMetadata('public-fixture')
    const profile = await loadPublicProfile('public-fixture')
    assert.equal(metadata.profile.full_name, 'Public Fixture')
    assert.equal(profile.profile.bio, 'Synthetic public bio')
    assert.equal(profile.user.id, profileId)
    assert.equal(viewerCalls, 0)
    const viewer = await loadPublicProfileViewer(profileId)
    assert.deepEqual(viewer, { viewer: null, connectionExists: false })
    assert.equal(viewerCalls, 1)
    assert.equal(requests.length, 10)
    const products = requests.find(request => request.url.pathname.endsWith('/products'))
    assert.doesNotMatch(products.url.searchParams.get('select'), /sales_page_draft|sales_page_content|\*/)
    assert.equal(requests.some(request => request.url.pathname.endsWith('/my_nsso')), false)
})

test('returned viewer errors fall back to guest while verified viewer flags use only the session client', async () => {
    globalThis.__publicViewerSession.auth.getUser = async () => ({ data: { user: { id: 'old-subject' } }, error: { status: 503 } })
    assert.deepEqual(await loadPublicProfileViewer(profileId), { viewer: null, connectionExists: false })
    const filters = []
    const query = { select() { return query }, eq(...args) { filters.push(args); return query }, maybeSingle: async () => ({ data: { id: 'connection' }, error: null }) }
    globalThis.__publicViewerSession = { auth: { getUser: async () => ({ data: { user: { id: 'verified-viewer', email: 'private-fixture@example.test', user_metadata: { private: true } } }, error: null }) }, from(table) { assert.equal(table, 'my_nsso'); return query } }
    assert.deepEqual(await loadPublicProfileViewer(profileId), { viewer: { id: 'verified-viewer' }, connectionExists: true })
    assert.deepEqual(filters, [['user_id', 'verified-viewer'], ['connected_user_id', profileId]])
    assert.equal(requests.length, 0)
})

test('the same isolated client reads the film catalog without session persistence and preserves caller cancellation', async () => {
    const controller = new AbortController()
    const result = await createPublicReadClient().from('razinflix_films').select('*').order('id').abortSignal(controller.signal)
    assert.equal(result.error, null); assert.equal(result.data[0].title, 'Public fixture film')
    controller.abort()
    assert.equal(requests[0].init.signal.aborted, true)
    assert.equal(viewerCalls, 0)
})
