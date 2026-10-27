import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = new URL('../src/', import.meta.url)
const previousEnv = { ...process.env }
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true }
    if (specifier === '@/lib/server/runtime-route') return { url: 'data:text/javascript,export const withRuntimeGuard=handler=>handler', shortCircuit: true }
    if (specifier === '@/lib/supabase/server') return { url: 'data:text/javascript,export const createClient=async(options)=>{globalThis.__deletionClientOptions=options;return globalThis.__deletionSession}', shortCircuit: true }
    if (specifier === '@supabase/supabase-js') return { url: 'data:text/javascript,export const createClient=()=>globalThis.__deletionService', shortCircuit: true }
    if (specifier.startsWith('@/')) return next(new URL(specifier.slice(2) + '.ts', source).href, context)
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(specifier + '.ts', context.parentURL)
        if (existsSync(fileURLToPath(url))) return next(url.href, context)
    }
    return next(specifier, context)
} })
const { DELETE } = await import(new URL('app/api/profile/route.ts', source))
hooks.deregister()
const actorId = '11111111-1111-4111-8111-111111111111'
const otherId = '22222222-2222-4222-8222-222222222222'
const intent = '33333333-3333-4333-8333-333333333333'
let actor, authError, exists, assets, calls, receipts, mode, prepareStatus, completeFails, lookupFails, removedFails, assurance

beforeEach(() => {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only-not-a-secret', NSSO_CHAT_IP_HASH_SECRET: 'synthetic-deletion-hmac-fixture-'.repeat(2), NSSO_ACCOUNT_DELETION_ENABLED: 'true' })
    actor = { id: actorId, factors: [] }; authError = null; exists = true; calls = []; receipts = new Map(); mode = 'normal'; prepareStatus = 'ready'; completeFails = false; lookupFails = false; removedFails = false; assurance = 'aal2'
    assets = [{ bucket: 'avatars', objectName: `${actorId}/avatar/fixture.jpg` }, { bucket: 'portfolio-assets', objectName: 'legacy-owner/old-photo.jpg' }]
    globalThis.__deletionSession = { auth: {
        getUser: async () => ({ data: { user: actor }, error: authError }),
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: assurance }, error: null }) },
    } }
    globalThis.__deletionService = {
        rpc: async (name, args) => {
            calls.push([name, args])
            if (name === 'get_profile_deletion_receipt') {
                const value = receipts.get(args.p_operation_id)
                return { data: { found: value?.hash === args.p_actor_hash, completed: value?.hash === args.p_actor_hash && value?.completed === true }, error: null }
            }
            if (name === 'prepare_profile_deletion') {
                assert.equal(args.p_actor_id, actorId)
                receipts.set(args.p_operation_id, { hash: args.p_actor_hash, completed: false })
                return { data: { accountId: actorId, operationId: args.p_operation_id, status: prepareStatus, reason: mode === 'last-admin' ? 'LAST_ADMIN' : 'SHARED_MEDIA', assets: structuredClone(assets) }, error: null }
            }
            if (name === 'complete_profile_deletion') {
                assert.equal(exists, false, 'Receipt completion must follow exact Auth absence')
                if (completeFails) { completeFails = false; return { data: null, error: { message: 'Synthetic receipt response unavailable' } } }
                for (const value of receipts.values()) if (value.hash === args.p_actor_hash) value.completed = true
                return { data: { completed: true }, error: null }
            }
            assert.fail('Unexpected service RPC ' + name)
        },
        storage: { from: bucket => ({ remove: async names => {
            calls.push(['storage.remove', { bucket, names }])
            if (removedFails) return { data: null, error: { message: 'Synthetic storage failure' } }
            assets = assets.filter(asset => asset.bucket !== bucket || !names.includes(asset.objectName))
            return { data: names.map(name => ({ name })), error: null }
        } }) },
        auth: { admin: {
            deleteUser: async (id, soft) => {
                calls.push(['deleteUser', { id, soft }]); assert.equal(id, actorId); assert.equal(soft, false); assert.equal(assets.length, 0)
                if (mode === 'auth-failure') return { data: { user: null }, error: { status: 503 } }
                exists = false
                if (mode === 'lost-committed') throw new TypeError('Synthetic lost response')
                return { data: { user: { id } }, error: null }
            },
            getUserById: async id => {
                calls.push(['getUserById', { id }]); assert.equal(id, actorId)
                if (lookupFails) return { data: { user: null }, error: { status: 503 } }
                return exists ? { data: { user: { id } }, error: null } : { data: { user: null }, error: { status: 404, code: 'user_not_found' } }
            },
        } },
    }
})
after(() => { process.env = previousEnv })
const request = (headers = {}, body) => new Request('https://nsso.test/api/profile', { method: 'DELETE', headers: { origin: 'https://nsso.test', 'X-Nsso-Account': actorId, 'X-Nsso-Delete-Intent': intent, ...headers }, ...(body === undefined ? {} : { body }) })
const writes = () => calls.filter(([name]) => name !== 'get_profile_deletion_receipt' && name !== 'getUserById')

test('self-delete rejects cross-origin, arbitrary target/body and invalid nonce before any privileged work', async () => {
    assert.equal((await DELETE(request({ origin: 'https://outside.test' }))).status, 403)
    assert.equal((await DELETE(request({}, JSON.stringify({ userId: otherId })))).status, 400)
    assert.equal((await DELETE(request({ 'X-Nsso-Delete-Intent': 'invalid' }))).status, 400)
    assert.equal((await DELETE(request({ 'X-Nsso-Account': otherId }))).status, 409)
    assert.deepEqual(calls, [])
})

test('anonymous/expired authentication can only read a matching completed receipt, never start deletion', async () => {
    actor = null
    const response = await DELETE(request())
    assert.equal(response.status, 401)
    assert.deepEqual(writes(), [])
    assert.equal(calls[0][0], 'get_profile_deletion_receipt')
    assert.equal(calls[0][1].p_actor_hash.includes(actorId), false)
})

test('deletion is fail-closed during the reserved-media rollout drain', async () => {
    delete process.env.NSSO_ACCOUNT_DELETION_ENABLED
    const response = await DELETE(request())
    assert.equal(response.status, 503)
    assert.equal((await response.json()).code, 'DELETION_NOT_READY')
    assert.deepEqual(calls, [])
})

test('transient Auth failure and enrolled MFA without assurance cannot delete', async () => {
    actor = null; authError = { status: 503, name: 'AuthRetryableFetchError' }
    assert.equal((await DELETE(request())).status, 503)
    assert.deepEqual(calls, [])
    authError = null; actor = { id: actorId, factors: [{ status: 'verified' }] }; assurance = 'aal1'
    assert.equal((await DELETE(request())).status, 403)
    assert.deepEqual(calls, [])
})

test('busy uploads and shared/last-admin blockers prevent Storage or Auth deletion', async () => {
    for (const state of ['busy', 'blocked']) {
        prepareStatus = state
        const response = await DELETE(request())
        assert.equal(response.status, 409)
        assert.equal((await response.json()).code, state === 'busy' ? 'DELETE_BUSY' : 'DELETE_BLOCKED')
        assert.equal(calls.some(([name]) => name === 'storage.remove' || name === 'deleteUser'), false)
    }
})

test('owned exact media is removed and rechecked before supported hard Auth deletion and a private receipt', async () => {
    const response = await DELETE(request())
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { deleted: true, accountId: actorId, operationId: intent })
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.deepEqual(globalThis.__deletionClientOptions, { readOnlyCookies: true }, 'The long DELETE must not queue a refreshed account cookie')
    assert.equal(calls.filter(([name]) => name === 'prepare_profile_deletion').length, 2)
    assert.deepEqual(calls.filter(([name]) => name === 'deleteUser'), [['deleteUser', { id: actorId, soft: false }]])
    assert(calls.findIndex(([name]) => name === 'deleteUser') > calls.findIndex(([name]) => name === 'storage.remove'))
    assert.equal(exists, false)
})

test('partial Storage or Auth failures stay retryable without claiming completion or signing out', async () => {
    removedFails = true
    let response = await DELETE(request())
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'DELETION_PENDING')
    assert.equal(calls.some(([name]) => name === 'deleteUser'), false)
    removedFails = false; mode = 'auth-failure'
    response = await DELETE(request())
    assert.equal(response.status, 503); assert.equal(exists, true)
    mode = 'normal'
    assert.equal((await DELETE(request())).status, 200)
})

test('a lost committed Auth DELETE is reconciled, but an unavailable lookup never proves absence', async () => {
    mode = 'lost-committed'; lookupFails = true
    assert.equal((await DELETE(request())).status, 503)
    assert.equal(calls.some(([name]) => name === 'complete_profile_deletion'), false)
    lookupFails = false; actor = null
    assert.equal((await DELETE(request())).status, 200)
    assert.equal(calls.filter(([name]) => name === 'deleteUser').length, 1)
})

test('a missing final receipt response resumes from the original nonce after Auth identity removal', async () => {
    completeFails = true
    assert.equal((await DELETE(request())).status, 503)
    assert.equal(exists, false)
    actor = null
    assert.equal((await DELETE(request())).status, 200)
    assert.equal(calls.filter(([name]) => name === 'deleteUser').length, 1)
    const missing = await DELETE(request({ 'X-Nsso-Delete-Intent': otherId }))
    assert.equal(missing.status, 401)
})

test('manifest identity/path corruption fails closed and never touches unknown buckets or another account', async () => {
    assets = [{ bucket: 'razinflix_posters', objectName: 'shared-poster.jpg' }]
    assert.equal((await DELETE(request())).status, 503)
    assert.equal(calls.some(([name]) => name === 'storage.remove' || name === 'deleteUser'), false)
})
