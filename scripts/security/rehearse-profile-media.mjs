/** Opt-in local Storage + media-registry contract proof. Never accepts remote
 * Supabase or edits the Storage catalog; cleanup uses Auth/Storage APIs only.
 * NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL=1 node scripts/security/rehearse-profile-media.mjs STATUS_JSON EVIDENCE_DIR
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

if (process.env.NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL !== '1') throw new Error('Local rehearsal requires explicit opt-in')
const [statusFile, evidenceArg] = process.argv.slice(2)
if (!statusFile || !evidenceArg) throw new Error('Expected STATUS_JSON EVIDENCE_DIR')
const config = JSON.parse(await readFile(statusFile, 'utf8'))
for (const value of [config.API_URL, config.DB_URL]) {
    if (!['localhost', '127.0.0.1'].includes(new URL(value).hostname)) throw new Error('Only local Supabase is allowed')
}
const suffix = process.env.NSSO_LOCAL_REHEARSAL_SUFFIX || '20261026'
if (!/^[a-z0-9-]+$/.test(suffix)) throw new Error('Invalid local stack suffix')
const container = `supabase_db_nsso-security-rehearsal-${suffix}`
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidence = resolve(evidenceArg)
if (evidence === repo || evidence.startsWith(repo + '/')) throw new Error('Private evidence must be outside the repository')
await mkdir(evidence, { mode: 0o700 })
const sql = query => execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }).trim()
const options = { auth: { persistSession: false, autoRefreshToken: false } }
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options)
const anonymous = createClient(config.API_URL, config.ANON_KEY, options)
const ok = result => { assert.equal(result.error, null, 'Synthetic local API operation failed'); return result.data }
const denied = result => assert.ok(result.error, 'An unauthorized or inconsistent media operation unexpectedly succeeded')
const checks = []
async function check(name, run) { await run(); checks.push(name); console.log(`PASS ${name}`) }
const actors = [], objects = []
try {
    if (sql("SELECT to_regprocedure('public.register_profile_media(uuid,text,text,text,bigint)') IS NOT NULL;") !== 't') {
        const directory = resolve(repo, 'supabase/migrations')
        const files = (await readdir(directory)).filter(file => file.endsWith('_nsso_profile_media_registry.sql'))
        assert.equal(files.length, 1, 'Expected exactly one media registry migration')
        const migration = await readFile(resolve(directory, files[0]), 'utf8')
        sql(migration)
        // PostgREST receives the migration's NOTIFY asynchronously.
        await new Promise(resolve => setTimeout(resolve, 300))
    }
    for (const name of ['owner', 'other']) {
        const email = `${name}-${randomUUID()}@nsso-media-rehearsal.invalid`
        const password = `Synthetic-local-only-${randomUUID()}!`
        const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user
        const client = createClient(config.API_URL, config.ANON_KEY, options)
        ok(await client.auth.signInWithPassword({ email, password }))
        actors.push({ id: user.id, client })
    }
    const [owner, other] = actors
    const jpeg = await sharp({ create: { width: 16, height: 12, channels: 3, background: '#214171' } }).jpeg({ quality: 88 }).toBuffer()
    const register = (client, path, overrides = {}) => client.rpc('register_profile_media', {
        p_actor_id: owner.id, p_bucket_id: path.bucket, p_object_name: path.name,
        p_content_type: 'image/jpeg', p_bytes: jpeg.length, ...overrides,
    })
    const paths = ['avatar', 'project', 'product'].map(kind => ({ bucket: kind === 'avatar' ? 'avatars' : 'portfolio-assets', name: `${owner.id}/${kind}/${randomUUID()}.jpg` }))
    await check('server JPEG uploads register all three canonical media kinds and bind the real ownerless Storage object', async () => {
        for (const path of paths) {
            ok(await service.storage.from(path.bucket).upload(path.name, jpeg, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false }))
            objects.push(path)
            const result = ok(await register(service, path))
            assert.deepEqual(Object.keys(result).sort(), ['assetId', 'bucket', 'bytes', 'contentType', 'objectName'].sort())
            assert.equal(result.bucket, path.bucket); assert.equal(result.objectName, path.name)
            assert.equal(result.contentType, 'image/jpeg'); assert.equal(result.bytes, jpeg.length)
            // All interpolated values were generated locally from UUIDs and a fixed
            // bucket allowlist. No actor/catalog data is printed or modified here.
            const valid = sql(`SELECT count(*) FROM private.media_assets a JOIN storage.objects o ON o.id=a.object_id WHERE a.id='${result.assetId}'::uuid AND a.user_id='${owner.id}'::uuid AND a.bucket_id=o.bucket_id AND a.object_name=o.name AND a.bytes=(o.metadata->>'size')::bigint AND o.owner IS NULL AND nullif(o.owner_id,'') IS NULL;`)
            assert.equal(valid, '1', 'Registry did not bind the ownerless Storage object to the verified actor')
            const downloaded = ok(await service.storage.from(path.bucket).download(path.name))
            assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), jpeg)
        }
    })
    await check('registration replay is idempotent and inconsistent actor, bucket, path and metadata are denied', async () => {
        const path = paths[0]
        const first = ok(await register(service, path)), second = ok(await register(service, path))
        assert.equal(first.assetId, second.assetId)
        denied(await register(service, path, { p_actor_id: other.id }))
        denied(await register(service, path, { p_bucket_id: 'portfolio-assets' }))
        denied(await register(service, path, { p_object_name: `${owner.id}/avatar/../${randomUUID()}.jpg` }))
        denied(await register(service, path, { p_object_name: `${owner.id}/avatar/${randomUUID()}.jpg` }))
        denied(await register(service, path, { p_content_type: 'image/png' }))
        denied(await register(service, path, { p_bytes: jpeg.length + 1 }))
        const png = await sharp(jpeg).png().toBuffer()
        const mismatched = { bucket: 'avatars', name: `${owner.id}/avatar/${randomUUID()}.jpg` }
        ok(await service.storage.from(mismatched.bucket).upload(mismatched.name, png, { contentType: 'image/png', upsert: false }))
        objects.push(mismatched)
        denied(await register(service, mismatched, { p_bytes: png.length }))
    })
    await check('anonymous and signed-in callers cannot register media or directly read the private registry', async () => {
        for (const client of [anonymous, owner.client, other.client]) {
            denied(await register(client, paths[0]))
            denied(await client.schema('private').from('media_assets').select('id').limit(1))
        }
    })
    await writeFile(resolve(evidence, 'checks.json'), JSON.stringify({ checks, kinds: paths.length, ownerlessStorageMapped: true, privateRegistryDenied: true }, null, 2), { mode: 0o600 })
    console.log(`Completed ${checks.length} local media-registry checks.`)
} finally {
    for (const object of objects) ok(await service.storage.from(object.bucket).remove([object.name]))
    for (const actor of actors) ok(await service.auth.admin.deleteUser(actor.id))
}
