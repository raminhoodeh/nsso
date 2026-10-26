import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { encryptPayload, decryptPayload, attachStorageMetadata, verifyStorage } from '../scripts/security/storage-recovery.mjs'

const content = Buffer.from('synthetic recovery fixture')
const sha256 = createHash('sha256').update(content).digest('hex')
const timestamp = '2026-10-26T10:00:00.000Z'
const identity = '11111111-1111-4111-8111-111111111111'
async function fixture(run) {
    const root = await mkdtemp(join(tmpdir(), 'nsso-recovery-unit-'))
    const directory = join(root, 'snapshot'), keyFile = join(root, 'key')
    const key = randomBytes(32)
    const object = { bucket: 'avatars', name: `${identity}/fixture.png`, file: '00000000.bin', bytes: content.length, sha256, contentType: 'image/png', updatedAt: timestamp }
    const bucket = { id: 'avatars', public: true, file_size_limit: 5242880, allowed_mime_types: ['image/png'] }
    const manifest = { version: 1, sourceUrl: 'https://fixture.supabase.co', createdAt: timestamp, buckets: [bucket], objects: [object] }
    const catalog = { objects: [{ id: '22222222-2222-4222-8222-222222222222', bucket_id: object.bucket, name: object.name, owner: identity, owner_id: identity, metadata: { size: content.length, mimetype: 'image/png', cacheControl: 'max-age=120' }, user_metadata: { caption: 'Synthetic caption' }, updated_at: timestamp, version: 'original-version' }], buckets: [{ ...bucket, name: bucket.id, owner: null, owner_id: null }] }
    await mkdir(directory, { mode: 0o700 })
    await writeFile(keyFile, key, { mode: 0o600 })
    const save = async () => writeFile(join(directory, 'manifest.enc'), encryptPayload(Buffer.from(JSON.stringify(manifest)), key), { mode: 0o600 })
    await save()
    await writeFile(join(directory, object.file), encryptPayload(content, key), { mode: 0o600 })
    try { await run({ root, directory, keyFile, key, manifest, catalog, object, save }) }
    finally { await rm(root, { recursive: true, force: true }) }
}

test('authenticated encryption rejects tampering, truncation and a different key', () => {
    const key = randomBytes(32), encrypted = encryptPayload(content, key)
    assert.deepEqual(decryptPayload(encrypted, key), content)
    assert.notDeepEqual(encryptPayload(content, key), encrypted, 'Every envelope needs a fresh nonce')
    assert.throws(() => decryptPayload(encrypted, randomBytes(32)))
    for (const offset of [0, 14, 28, encrypted.length - 1]) {
        const corrupt = Buffer.from(encrypted); corrupt[offset] ^= 1
        assert.throws(() => decryptPayload(corrupt, key))
    }
    assert.throws(() => decryptPayload(encrypted.subarray(0, 20), key))
    assert.throws(() => encryptPayload(content, Buffer.alloc(31)))
})

test('existing byte snapshots upgrade only with complete matching ownership metadata', async () => fixture(async state => {
    const original = await readFile(join(state.directory, 'manifest.enc'))
    const result = await attachStorageMetadata({ ...state, catalog: state.catalog })
    assert.equal(result.ownershipCaptured, true)
    assert.deepEqual(await readFile(join(state.directory, 'manifest.v1.enc')), original)
    const upgraded = JSON.parse(decryptPayload(await readFile(join(state.directory, 'manifest.enc')), state.key))
    assert.deepEqual(upgraded.catalog, state.catalog)
    assert.equal(upgraded.version, 2)
    const verified = await verifyStorage(state)
    assert.equal(verified.bytes, content.length)
    assert.equal(verified.ownershipCaptured, true)
    assert.equal(verified.ownershipVerified, false, 'A captured catalog alone cannot prove restored ownership')
    await assert.rejects(attachStorageMetadata({ ...state, catalog: state.catalog }), /already has/)
}))

test('metadata mismatches refuse upgrade and preserve the original manifest', async () => {
    for (const change of [catalog => { catalog.objects = [] }, catalog => { catalog.objects[0].metadata.size++ }, catalog => { catalog.objects[0].updated_at = '2026-10-26T10:00:01Z' }, catalog => { delete catalog.objects[0].owner_id }, catalog => { catalog.objects.push(structuredClone(catalog.objects[0])) }]) {
        await fixture(async state => {
            const before = await readFile(join(state.directory, 'manifest.enc'))
            change(state.catalog)
            await assert.rejects(attachStorageMetadata(state))
            assert.deepEqual(await readFile(join(state.directory, 'manifest.enc')), before)
        })
    }
})

test('unsafe paths and duplicate records fail before any Storage API operation', async () => {
    for (const change of [manifest => { manifest.objects[0].file = '../outside' }, manifest => { manifest.objects[0].name = '../outside' }, manifest => { manifest.objects[0].name = 'folder\\outside' }, manifest => { manifest.objects.push(structuredClone(manifest.objects[0])) }, manifest => { manifest.buckets[0].id = '../outside' }]) {
        await fixture(async state => {
            change(state.manifest); await state.save()
            const restoreClient = { storage: new Proxy({}, { get() { assert.fail('Invalid manifests must not reach Storage') } }) }
            await assert.rejects(verifyStorage({ ...state, restoreClient, allowBytesOnly: true }))
        })
    }
})

test('recovery refuses symlinks and weak file permissions', async () => fixture(async state => {
    await chmod(state.keyFile, 0o644)
    await assert.rejects(verifyStorage(state), /owner-only/)
    await chmod(state.keyFile, 0o600)
    const file = join(state.directory, state.object.file), outside = join(state.root, 'outside')
    await writeFile(outside, encryptPayload(content, state.key), { mode: 0o600 })
    await rm(file); await symlink(outside, file)
    await assert.rejects(verifyStorage(state))
}))

test('owned recovery refuses missing or mismatched database identities before uploading', async () => fixture(async state => {
    await attachStorageMetadata(state)
    const restoreClient = { storage: new Proxy({}, { get() { assert.fail('Mismatched ownership must not reach Storage') } }) }
    await assert.rejects(verifyStorage({ ...state, restoreClient }), /matching restored database/)
    for (const change of [catalog => { catalog.objects = [] }, catalog => { catalog.objects[0].owner_id = null }, catalog => { catalog.objects[0].id = identity }, catalog => { catalog.objects[0].user_metadata = {} }]) {
        const restored = structuredClone(state.catalog); change(restored)
        await assert.rejects(verifyStorage({ ...state, restoreClient, readCatalog: async () => restored }))
    }
}))

test('owned recovery keeps metadata in API options and verifies catalog again after byte writes', async () => fixture(async state => {
    await attachStorageMetadata(state)
    const restored = structuredClone(state.catalog), uploads = []
    let reads = 0
    const restoreClient = { storage: { from: bucket => ({
        async upload(name, bytes, options) { uploads.push({ bucket, name, options }); assert.deepEqual(bytes, content); restored.objects[0].version = 'new-api-version'; return { error: null } },
        async download() { return { data: new Blob([content]), error: null } },
    }) } }
    const result = await verifyStorage({ ...state, restoreClient, readCatalog: async () => { reads++; return restored } })
    assert.equal(result.ownershipVerified, true); assert.equal(result.userMetadataVerified, true)
    assert.equal(reads, 2)
    assert.deepEqual(uploads, [{ bucket: state.object.bucket, name: state.object.name, options: { contentType: 'image/png', upsert: true, cacheControl: '120', metadata: { caption: 'Synthetic caption' } } }])
}))

test('corrupt bytes abort the whole recovery before uploading any object', async () => fixture(async state => {
    await attachStorageMetadata(state)
    const corrupt = await readFile(join(state.directory, state.object.file)); corrupt[corrupt.length - 1] ^= 1
    await writeFile(join(state.directory, state.object.file), corrupt)
    const restoreClient = { storage: new Proxy({}, { get() { assert.fail('Corrupt files must not reach Storage') } }) }
    await assert.rejects(verifyStorage({ ...state, restoreClient, readCatalog: async () => state.catalog }))
}))

test('a provider that loses ownership after upload cannot report a successful recovery', async () => fixture(async state => {
    await attachStorageMetadata(state)
    const catalog = structuredClone(state.catalog)
    const restoreClient = { storage: { from: () => ({
        async upload() { catalog.objects[0].owner_id = null; return { error: null } },
        async download() { return { data: new Blob([content]), error: null } },
    }) } }
    await assert.rejects(verifyStorage({ ...state, restoreClient, readCatalog: async () => catalog }), /ownership or user metadata differs/)
}))

test('a catalog reader pointing at a different unchanged database cannot prove recovery', async () => fixture(async state => {
    await attachStorageMetadata(state)
    const restoreClient = { storage: { from: () => ({ async upload() { return { error: null } }, async download() { return { data: new Blob([content]), error: null } } }) } }
    await assert.rejects(verifyStorage({ ...state, restoreClient, readCatalog: async () => state.catalog }), /matching restored database catalog/)
}))

test('legacy restore is explicitly byte-only and cannot claim ownership verification', async () => fixture(async state => {
    const restoreClient = { storage: { async createBucket() { return { error: null } }, from: () => ({ async upload() { return { error: null } }, async download() { return { data: new Blob([content]), error: null } } }) } }
    await assert.rejects(verifyStorage({ ...state, restoreClient }), /proves bytes only/)
    const result = await verifyStorage({ ...state, restoreClient, allowBytesOnly: true })
    assert.equal(result.ownershipCaptured, false); assert.equal(result.ownershipVerified, false)
}))
