import { createClient } from '@supabase/supabase-js'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const magic = Buffer.from('NSSO-MEDIA-1\n')
export function encryptPayload(bytes, key) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()])
    return Buffer.concat([magic, iv, cipher.getAuthTag(), ciphertext])
}
export function decryptPayload(bytes, key) {
    if (!bytes.subarray(0, magic.length).equals(magic)) throw new Error('Invalid recovery format')
    const offset = magic.length
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(offset, offset + 12))
    decipher.setAuthTag(bytes.subarray(offset + 12, offset + 28))
    return Buffer.concat([decipher.update(bytes.subarray(offset + 28)), decipher.final()])
}

async function loadKey(path, create = false) {
    try {
        const info = await stat(path)
        if ((info.mode & 0o077) !== 0) throw new Error('Recovery key permissions must be owner-only')
        const key = await readFile(path)
        if (key.length !== 32) throw new Error('Invalid recovery key')
        return key
    } catch (error) {
        if (error.code !== 'ENOENT' || !create) throw error
        const key = randomBytes(32)
        await writeFile(path, key, { mode: 0o600, flag: 'wx' })
        return key
    }
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

export async function backupStorage({ directory, keyFile, client, sourceUrl }) {
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
            const bytes = Buffer.from(await data.arrayBuffer())
            const file = `${String(manifest.objects.length).padStart(8, '0')}.bin`
            await writeFile(join(directory, file), encryptPayload(bytes, key), { mode: 0o600, flag: 'wx' })
            manifest.objects.push({ bucket: bucket.id, name: object.name, file, bytes: bytes.length, sha256: hash(bytes),
                contentType: object.metadata?.mimetype ?? data.type ?? 'application/octet-stream', updatedAt: object.updated_at })
        }
    }
    // Paths and metadata are encrypted too. A snapshot is usable only once this exists.
    await writeFile(join(directory, 'manifest.enc'), encryptPayload(Buffer.from(JSON.stringify(manifest)), key), { mode: 0o600, flag: 'wx' })
    return { buckets: manifest.buckets.length, objects: manifest.objects.length, bytes: manifest.objects.reduce((sum, object) => sum + object.bytes, 0) }
}

export async function verifyStorage({ directory, keyFile, restoreClient }) {
    const key = await loadKey(keyFile)
    const manifest = JSON.parse(decryptPayload(await readFile(join(directory, 'manifest.enc')), key).toString())
    if (manifest.version !== 1 || !Array.isArray(manifest.objects)) throw new Error('Invalid recovery manifest')
    for (const bucket of manifest.buckets) {
        if (!restoreClient) continue
        const { error } = await restoreClient.storage.createBucket(bucket.id, { public: bucket.public, fileSizeLimit: bucket.file_size_limit || undefined, allowedMimeTypes: bucket.allowed_mime_types || undefined })
        if (error && error.message !== 'The resource already exists') throw new Error('Test bucket creation failed')
    }
    let bytes = 0
    for (const object of manifest.objects) {
        if (!/^\d{8}\.bin$/.test(object.file)) throw new Error('Invalid recovery file path')
        const body = decryptPayload(await readFile(join(directory, object.file)), key)
        if (body.length !== object.bytes || hash(body) !== object.sha256) throw new Error('Object recovery checksum mismatch')
        bytes += body.length
        if (restoreClient) {
            const { error } = await restoreClient.storage.from(object.bucket).upload(object.name, body, { contentType: object.contentType, upsert: true })
            if (error) throw new Error('Test object restoration failed')
            const { data, error: downloadError } = await restoreClient.storage.from(object.bucket).download(object.name)
            if (downloadError || !data || hash(Buffer.from(await data.arrayBuffer())) !== object.sha256) throw new Error('Restored object download failed verification')
        }
    }
    return { buckets: manifest.buckets.length, objects: manifest.objects.length, bytes, restored: Boolean(restoreClient) }
}

async function main() {
    const [command, directoryInput, keyInput] = process.argv.slice(2)
    if (!['backup', 'verify', 'restore-local'].includes(command) || !directoryInput || !keyInput) throw new Error('Usage: storage-recovery.mjs backup|verify|restore-local DIRECTORY KEY_FILE')
    const directory = resolve(directoryInput), keyFile = resolve(keyInput)
    let result
    if (command === 'backup') {
        result = await backupStorage({ directory, keyFile, sourceUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            client: storageClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) })
    } else {
        let restoreClient
        if (command === 'restore-local') {
            const url = new URL(process.env.TEST_SUPABASE_URL || '')
            if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Restoration is restricted to an isolated local Supabase instance')
            restoreClient = storageClient(url.origin, process.env.TEST_SUPABASE_SERVICE_ROLE_KEY)
        }
        result = await verifyStorage({ directory, keyFile, restoreClient })
    }
    console.log(JSON.stringify({ command, ...result }))
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
    main().catch(() => { console.error('Storage recovery operation failed. No credentials or object contents were logged; inspect the private snapshot and configuration.'); process.exitCode = 1 })
}
