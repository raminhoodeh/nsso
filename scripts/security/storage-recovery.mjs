import { createClient } from '@supabase/supabase-js'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, open, lstat, rename } from 'node:fs/promises'
import { constants } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const magic = Buffer.from('NSSO-MEDIA-1\n')
const envelopeLength = magic.length + 28
const maxObjectBytes = 512 * 1024 * 1024
const maxManifestBytes = 16 * 1024 * 1024
export const STORAGE_CATALOG_QUERY = `SELECT jsonb_build_object(
 'objects',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'bucket_id',bucket_id,'name',name,'owner',owner,'owner_id',owner_id,'metadata',metadata,'user_metadata',user_metadata,'created_at',created_at,'updated_at',updated_at,'last_accessed_at',last_accessed_at,'version',version) ORDER BY bucket_id,name) FROM storage.objects),'[]'::jsonb),
 'buckets',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'owner',to_jsonb(b)->'owner','owner_id',to_jsonb(b)->'owner_id','public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types) ORDER BY id) FROM storage.buckets b),'[]'::jsonb));`
export function encryptPayload(bytes, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid recovery key')
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()])
    return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext])
}
export function decryptPayload(bytes, key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Invalid recovery key')
    if (!Buffer.isBuffer(bytes) || bytes.length < envelopeLength || !bytes.subarray(0, magic.length).equals(magic)) throw new Error('Invalid recovery format')
    const offset = magic.length
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(offset, offset + 12))
    decipher.setAuthTag(bytes.subarray(offset + 12, offset + 28))
    return Buffer.concat([decipher.update(bytes.subarray(offset + 28)), decipher.final()])
}

async function privateFile(path, maxBytes) {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
        const info = await file.stat()
        if (!info.isFile() || info.size > maxBytes || (info.mode & 0o077) !== 0) throw new Error('Recovery files must be bounded, regular and owner-only')
        return await file.readFile()
    } finally { await file.close() }
}

async function privateDirectory(directory) {
    const info = await lstat(directory)
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) throw new Error('Recovery directory must be owner-only and not a symlink')
}

async function loadKey(path, create = false) {
    try {
        const key = await privateFile(path, 32)
        if (key.length !== 32) throw new Error('Invalid recovery key')
        return key
    } catch (error) {
        if (error.code !== 'ENOENT' || !create) throw error
        const key = randomBytes(32)
        await writeFile(path, key, { mode: 0o600, flag: 'wx' })
        return key
    }
}

const validBucket = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value) && !['.', '..'].includes(value)
const validName = value => typeof value === 'string' && Buffer.byteLength(value) <= 1024 && !/[\\\u0000-\u001f\u007f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..')
const objectKey = value => JSON.stringify([value.bucket_id ?? value.bucket, value.name])
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const metadataIsValid = value => value === null || record(value)

function validateCatalog(value) {
    const catalog = Array.isArray(value) ? { objects: value } : value
    if (!record(catalog) || !Array.isArray(catalog.objects) || catalog.objects.length > 100000) throw new Error('Invalid storage catalog')
    const keys = new Set()
    for (const row of catalog.objects) {
        if (!record(row) || !validBucket(row.bucket_id) || !validName(row.name) || typeof row.id !== 'string' || !row.id
            || !Object.hasOwn(row, 'owner') || !Object.hasOwn(row, 'owner_id') || !Object.hasOwn(row, 'user_metadata')
            || ![row.owner, row.owner_id].every(owner => owner === null || typeof owner === 'string')
            || !metadataIsValid(row.metadata) || !metadataIsValid(row.user_metadata) || typeof row.updated_at !== 'string'
            || !Number.isFinite(Date.parse(row.updated_at)) || keys.has(objectKey(row))) throw new Error('Invalid or duplicate storage catalog object')
        keys.add(objectKey(row))
    }
    if (catalog.buckets !== undefined) {
        const bucketIds = new Set()
        if (!Array.isArray(catalog.buckets) || catalog.buckets.some(bucket => {
            if (!record(bucket) || !validBucket(bucket.id) || bucketIds.has(bucket.id) || !Object.hasOwn(bucket, 'owner') || !Object.hasOwn(bucket, 'owner_id')) return true
            bucketIds.add(bucket.id)
            return ![bucket.owner, bucket.owner_id].every(owner => owner === null || typeof owner === 'string')
        })) throw new Error('Invalid storage bucket catalog')
    }
    return catalog
}

function validateManifest(manifest) {
    if (!record(manifest) || ![1, 2].includes(manifest.version) || !Array.isArray(manifest.buckets) || !Array.isArray(manifest.objects) || manifest.objects.length > 100000) throw new Error('Invalid recovery manifest')
    const buckets = new Set(), keys = new Set(), files = new Set()
    for (const bucket of manifest.buckets) {
        if (!record(bucket) || !validBucket(bucket.id) || buckets.has(bucket.id) || typeof bucket.public !== 'boolean'
            || !(bucket.file_size_limit === null || bucket.file_size_limit === undefined || (Number.isSafeInteger(bucket.file_size_limit) && bucket.file_size_limit > 0))
            || !(bucket.allowed_mime_types === null || bucket.allowed_mime_types === undefined || (Array.isArray(bucket.allowed_mime_types) && bucket.allowed_mime_types.every(value => typeof value === 'string' && value.length <= 200)))) throw new Error('Invalid recovery bucket')
        buckets.add(bucket.id)
    }
    for (const object of manifest.objects) {
        if (!record(object) || !buckets.has(object.bucket) || !validName(object.name) || !/^\d{8}\.bin$/.test(object.file)
            || !Number.isSafeInteger(object.bytes) || object.bytes < 0 || object.bytes > maxObjectBytes || !/^[a-f0-9]{64}$/.test(object.sha256)
            || typeof object.contentType !== 'string' || !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(object.contentType)
            || keys.has(objectKey(object)) || files.has(object.file)) throw new Error('Invalid or duplicate recovery object')
        keys.add(objectKey(object)); files.add(object.file)
    }
    if (manifest.version === 2) {
        const catalog = validateCatalog(manifest.catalog)
        if (catalog.objects.length !== manifest.objects.length) throw new Error('Storage catalog coverage mismatch')
        const rows = new Map(catalog.objects.map(row => [objectKey(row), row]))
        for (const object of manifest.objects) {
            const row = rows.get(objectKey(object))
            if (!row || Number(row.metadata?.size ?? row.metadata?.contentLength) !== object.bytes
                || row.metadata?.mimetype !== object.contentType
                || Date.parse(row.updated_at) !== Date.parse(object.updatedAt)) throw new Error('Storage catalog differs from byte snapshot; take a fresh snapshot')
        }
        if (catalog.buckets && (catalog.buckets.length !== buckets.size || catalog.buckets.some(bucket => !buckets.has(bucket.id)))) throw new Error('Storage bucket catalog coverage mismatch')
    }
    return manifest
}

async function loadManifest(directory, key) {
    await privateDirectory(directory)
    return validateManifest(JSON.parse(decryptPayload(await privateFile(join(directory, 'manifest.enc'), maxManifestBytes), key).toString()))
}

/** Adds a private read-only SQL catalog to an existing complete byte snapshot. */
export async function attachStorageMetadata({ directory, keyFile, catalog }) {
    const key = await loadKey(keyFile)
    const manifest = await loadManifest(directory, key)
    if (manifest.version !== 1) throw new Error('Recovery snapshot already has a metadata catalog')
    const upgraded = validateManifest({ ...manifest, version: 2, catalog: validateCatalog(catalog), metadataCapturedAt: new Date().toISOString() })
    await verifyStorage({ directory, keyFile })
    // Preserve the original authenticated manifest and replace only after full validation.
    await writeFile(join(directory, 'manifest.v1.enc'), await privateFile(join(directory, 'manifest.enc'), maxManifestBytes), { mode: 0o600, flag: 'wx' })
    const temporary = join(directory, `manifest-${randomBytes(8).toString('hex')}.tmp`)
    await writeFile(temporary, encryptPayload(Buffer.from(JSON.stringify(upgraded)), key), { mode: 0o600, flag: 'wx' })
    await rename(temporary, join(directory, 'manifest.enc'))
    return { objects: upgraded.objects.length, ownershipCaptured: true, bucketOwnershipCaptured: Array.isArray(upgraded.catalog.buckets) }
}

async function objectsIn(client, bucket, prefix = '', visited = new Set()) {
    if (visited.has(prefix)) throw new Error('Repeated storage prefix')
    visited.add(prefix)
    const found = []
    for (let offset = 0; ; offset += 100) {
        const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
        if (error || !data) throw new Error('Storage listing failed')
        for (const item of data) {
            const name = prefix ? `${prefix}/${item.name}` : item.name
            if (!validName(name)) throw new Error('Unsupported storage object path')
            if (!item.id) found.push(...await objectsIn(client, bucket, name, visited))
            else found.push({ name, metadata: item.metadata, updated_at: item.updated_at })
        }
        if (data.length < 100) return found
    }
}

function storageClient(url, key) {
    if (!url || !key) throw new Error('Storage access is not configured')
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(60_000) }) } })
}

export async function backupStorage({ directory, keyFile, client, sourceUrl, catalog }) {
    const key = await loadKey(keyFile, true)
    await mkdir(directory, { mode: 0o700 }) // Deliberately refuses to overwrite a prior snapshot.
    const { data: buckets, error } = await client.storage.listBuckets()
    if (error || !buckets) throw new Error('Bucket listing failed')
    const manifest = { version: 1, sourceUrl, createdAt: new Date().toISOString(), buckets: [], objects: [] }
    for (const bucket of buckets) {
        manifest.buckets.push({ id: bucket.id, public: bucket.public, file_size_limit: bucket.file_size_limit, allowed_mime_types: bucket.allowed_mime_types })
        const objects = await objectsIn(client, bucket.id)
        for (const object of objects) {
            const { data, error: downloadError } = await client.storage.from(bucket.id).download(object.name)
            if (downloadError || !data) throw new Error('Object download failed; snapshot is incomplete')
            if (data.size > maxObjectBytes) throw new Error('Object exceeds bounded recovery size')
            const bytes = Buffer.from(await data.arrayBuffer())
            const file = `${String(manifest.objects.length).padStart(8, '0')}.bin`
            await writeFile(join(directory, file), encryptPayload(bytes, key), { mode: 0o600, flag: 'wx' })
            manifest.objects.push({ bucket: bucket.id, name: object.name, file, bytes: bytes.length, sha256: hash(bytes),
                contentType: object.metadata?.mimetype ?? data.type ?? 'application/octet-stream', updatedAt: object.updated_at })
        }
    }
    // Paths and metadata are encrypted too. A snapshot is usable only once this exists.
    const complete = validateManifest(catalog ? { ...manifest, version: 2, catalog: validateCatalog(catalog) } : manifest)
    await writeFile(join(directory, 'manifest.enc'), encryptPayload(Buffer.from(JSON.stringify(complete)), key), { mode: 0o600, flag: 'wx' })
    return { buckets: complete.buckets.length, objects: complete.objects.length, bytes: complete.objects.reduce((sum, object) => sum + object.bytes, 0), ownershipCaptured: complete.version === 2 }
}

function compareCatalog(manifest, value, restored = false) {
    const catalog = validateCatalog(value)
    const current = new Map(catalog.objects.map(row => [objectKey(row), row]))
    if (current.size !== manifest.objects.length) throw new Error('Restore requires the complete matching database catalog first')
    for (const expected of manifest.catalog.objects) {
        const row = current.get(objectKey(expected))
        if (!row || row.id !== expected.id || row.owner !== expected.owner || row.owner_id !== expected.owner_id
            || !isDeepStrictEqual(row.user_metadata, expected.user_metadata)) throw new Error('Restored object ownership or user metadata differs from snapshot')
        for (const property of ['mimetype', 'cacheControl']) {
            if (row.metadata?.[property] !== expected.metadata?.[property]) throw new Error('Restored object properties differ from snapshot')
        }
        if (Number(row.metadata?.size ?? row.metadata?.contentLength) !== Number(expected.metadata?.size ?? expected.metadata?.contentLength)) throw new Error('Restored object size differs from snapshot')
        if (!restored && row.version !== expected.version) throw new Error('Database catalog does not match snapshot version')
        if (restored && row.version === expected.version) throw new Error('Storage API did not update the matching restored database catalog')
    }
    if (manifest.catalog.buckets) {
        if (!catalog.buckets || catalog.buckets.length !== manifest.catalog.buckets.length) throw new Error('Restored bucket catalog differs from snapshot')
        const buckets = new Map(catalog.buckets.map(bucket => [bucket.id, bucket]))
        for (const expected of manifest.catalog.buckets) {
            const bucket = buckets.get(expected.id)
            if (!bucket || !['owner', 'owner_id', 'public', 'file_size_limit', 'allowed_mime_types'].every(field => isDeepStrictEqual(bucket[field], expected[field]))) throw new Error('Restored bucket ownership or settings differ from snapshot')
        }
    }
}

function uploadOptions(object, catalog) {
    const row = catalog.objects.find(row => objectKey(row) === objectKey(object))
    const cache = row.metadata?.cacheControl
    const seconds = cache === undefined ? undefined : /^max-age=(\d+)$/.exec(cache)?.[1]
    if (cache !== undefined && !seconds) throw new Error('Unsupported cache policy; requires a documented recovery adapter')
    return { contentType: object.contentType, upsert: true,
        ...(seconds ? { cacheControl: seconds } : {}),
        ...(row.user_metadata !== null ? { metadata: row.user_metadata } : {}) }
}

export async function verifyStorage({ directory, keyFile, restoreClient, readCatalog, allowBytesOnly = false }) {
    const key = await loadKey(keyFile)
    const manifest = await loadManifest(directory, key)
    if (restoreClient && manifest.version === 2) {
        if (typeof readCatalog !== 'function') throw new Error('Ownership recovery requires the matching restored database catalog')
        compareCatalog(manifest, await readCatalog())
        // Validate all options before the first byte write.
        manifest.objects.forEach(object => uploadOptions(object, manifest.catalog))
    } else if (restoreClient && !allowBytesOnly) throw new Error('Version 1 recovery proves bytes only; attach ownership metadata first')
    // Authenticate every ciphertext and checksum before performing any restore.
    let bytes = 0
    for (const object of manifest.objects) {
        const body = decryptPayload(await privateFile(join(directory, object.file), object.bytes + envelopeLength), key)
        if (body.length !== object.bytes || hash(body) !== object.sha256) throw new Error('Object recovery checksum mismatch')
        bytes += body.length
    }
    for (const bucket of manifest.buckets) {
        if (!restoreClient || manifest.version === 2) continue
        const { error } = await restoreClient.storage.createBucket(bucket.id, { public: bucket.public, fileSizeLimit: bucket.file_size_limit || undefined, allowedMimeTypes: bucket.allowed_mime_types || undefined })
        if (error && error.message !== 'The resource already exists') throw new Error('Test bucket creation failed')
    }
    for (const object of manifest.objects) {
        if (!restoreClient) continue
        const body = decryptPayload(await privateFile(join(directory, object.file), object.bytes + envelopeLength), key)
        if (body.length !== object.bytes || hash(body) !== object.sha256) throw new Error('Object recovery checksum mismatch')
        const options = manifest.version === 2 ? uploadOptions(object, manifest.catalog) : { contentType: object.contentType, upsert: true }
        const { error } = await restoreClient.storage.from(object.bucket).upload(object.name, body, options)
        if (error) throw new Error('Test object restoration failed')
        const { data, error: downloadError } = await restoreClient.storage.from(object.bucket).download(object.name)
        if (downloadError || !data || hash(Buffer.from(await data.arrayBuffer())) !== object.sha256) throw new Error('Restored object download failed verification')
    }
    if (restoreClient && manifest.version === 2) compareCatalog(manifest, await readCatalog(), true)
    return { buckets: manifest.buckets.length, objects: manifest.objects.length, bytes, restored: Boolean(restoreClient), ownershipCaptured: manifest.version === 2,
        ownershipVerified: Boolean(restoreClient && manifest.version === 2), userMetadataVerified: Boolean(restoreClient && manifest.version === 2) }
}

async function main() {
    const [command, directoryInput, keyInput, catalogInput] = process.argv.slice(2)
    if (!['backup', 'verify', 'attach-metadata', 'restore-local', 'restore-bytes-local'].includes(command) || !directoryInput || !keyInput) throw new Error('Usage: storage-recovery.mjs backup|verify|attach-metadata|restore-local|restore-bytes-local DIRECTORY KEY_FILE [METADATA_ENC]')
    const directory = resolve(directoryInput), keyFile = resolve(keyInput)
    const catalog = catalogInput ? JSON.parse(decryptPayload(await privateFile(resolve(catalogInput), maxManifestBytes), await loadKey(keyFile)).toString()) : undefined
    let result
    if (command === 'backup') {
        result = await backupStorage({ directory, keyFile, sourceUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            client: storageClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY), catalog })
    } else if (command === 'attach-metadata') {
        if (!catalog) throw new Error('An encrypted read-only catalog snapshot is required')
        result = await attachStorageMetadata({ directory, keyFile, catalog })
    } else {
        let restoreClient
        let readCatalog
        if (command === 'restore-local' || command === 'restore-bytes-local') {
            const url = new URL(process.env.TEST_SUPABASE_URL || '')
            if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Restoration is restricted to an isolated local Supabase instance')
            restoreClient = storageClient(url.origin, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY)
            if (command === 'restore-local') {
                const container = process.env.TEST_SUPABASE_DB_CONTAINER || ''
                const database = process.env.TEST_SUPABASE_DB_NAME || ''
                if (!/^supabase_db_nsso-security-rehearsal-[a-z0-9-]+$/.test(container) || !/^nsso_[a-z0-9_]+$/.test(database)) throw new Error('A dedicated local restored database is required')
                readCatalog = () => JSON.parse(execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], { input: STORAGE_CATALOG_QUERY, encoding: 'utf8', maxBuffer: maxManifestBytes }))
            }
        }
        result = await verifyStorage({ directory, keyFile, restoreClient, readCatalog, allowBytesOnly: command === 'restore-bytes-local' })
    }
    console.log(JSON.stringify({ command, ...result }))
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
    main().catch(() => { console.error('Storage recovery operation failed. No credentials or object contents were logged; inspect the private snapshot and configuration.'); process.exitCode = 1 })
}
