/** Opt-in synthetic recovery proof. Uses a dedicated local database and empty
 * Storage backend; never accepts a remote URL or edits Storage catalog rows.
 * NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL=1 node scripts/security/rehearse-storage-recovery.mjs STATUS_JSON EVIDENCE_DIR
 */
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import sharp from 'sharp'
import { backupStorage, verifyStorage, STORAGE_CATALOG_QUERY } from './storage-recovery.mjs'

if (process.env.NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL !== '1') throw new Error('Local rehearsal requires explicit opt-in')
const [statusFile, evidenceArg] = process.argv.slice(2)
if (!statusFile || !evidenceArg) throw new Error('Expected STATUS_JSON EVIDENCE_DIR')
const config = JSON.parse(await readFile(statusFile, 'utf8'))
for (const input of [config.API_URL, config.DB_URL]) {
    const url = new URL(input)
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Only local Supabase is allowed')
}
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidence = resolve(evidenceArg)
if (evidence === repo || evidence.startsWith(repo + '/')) throw new Error('Private evidence must be outside the repository')
await mkdir(evidence, { mode: 0o700 })
const suffix = process.env.NSSO_LOCAL_REHEARSAL_SUFFIX || '20261026'
if (!/^[a-z0-9-]+$/.test(suffix)) throw new Error('Invalid local stack suffix')
const container = `supabase_db_nsso-security-rehearsal-${suffix}`
const storage = `supabase_storage_nsso-security-rehearsal-${suffix}`
const database = `nsso_media_restore_${Date.now().toString(36)}`
const restoredStorage = `nsso-media-restore-${Date.now().toString(36)}`
const restoredRest = `nsso-media-rest-${Date.now().toString(36)}`
const origin = 'http://127.0.0.1:55834'
const keyFile = resolve(evidence, 'recovery.key'), directory = resolve(evidence, 'media')
const results = []
const drillStarted = performance.now()
const timing = { scope: 'Synthetic local paired database and empty-Storage recovery; not a production SLO', startedAt: new Date().toISOString(), phases: [] }
let phase, recoveryStarted
function beginPhase(name) {
    const now = performance.now(), at = new Date().toISOString()
    if (phase) { phase.completedAt = at; phase.durationMs = Number((now - phase.started).toFixed(2)); delete phase.started }
    phase = { name, startedAt: at, started: now }; timing.phases.push(phase)
}
function sql(query, db = 'postgres') {
    return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim()
}
const options = token => ({ auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) })
const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options())
const session = () => createClient(config.API_URL, config.ANON_KEY, options())
const ok = result => { assert.equal(result.error, null, 'Synthetic Storage/Auth operation failed'); return result.data }
async function check(name, run) { await run(); results.push(name); console.log(`PASS ${name}`) }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=', 'base64')
const actors = []
let storageStarted = false, restStarted = false, databaseCreated = false
try {
    beginPhase('synthetic_fixture_setup')
    for (const name of ['owner', 'other']) {
        const email = `${name}-${Date.now()}@nsso-storage-rehearsal.invalid`, password = 'Synthetic-local-only-471!'
        const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user
        const signedIn = ok(await session().auth.signInWithPassword({ email, password }))
        actors.push({ id: user.id, token: signedIn.session.access_token, client: createClient(config.API_URL, config.ANON_KEY, options(signedIn.session.access_token)) })
    }
    const [owner, other] = actors
    const paths = ['avatars', 'portfolio-assets'].map(bucket => ({ bucket, name: `${owner.id}/recovery-fixture.png` }))
    // A one-path-per-bucket fixture policy creates genuine pre-cutover ownership
    // through Auth+Storage APIs, even when the source stack is already final.
    // It is removed BEFORE the dump; the restored final policies are never weakened.
    sql(`CREATE POLICY nsso_recovery_legacy_fixture ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id IN ('avatars','portfolio-assets') AND name='${owner.id}/recovery-fixture.png' AND (SELECT auth.uid())='${owner.id}'::uuid)`)
    try { for (const path of paths) ok(await owner.client.storage.from(path.bucket).upload(path.name, png, { contentType: 'image/png', cacheControl: '120', metadata: { caption: 'Synthetic recovery fixture', nested: { retained: true } } })) }
    finally { sql('DROP POLICY nsso_recovery_legacy_fixture ON storage.objects') }
    beginPhase('paired_media_capture')
    const catalog = JSON.parse(sql(STORAGE_CATALOG_QUERY))
    timing.catalogCapturedAt = new Date().toISOString()
    await check('encrypted byte snapshot captures original ownership and user metadata', async () => {
        const result = await backupStorage({ directory, keyFile, client: service, sourceUrl: config.API_URL, catalog })
        timing.snapshot = { objects: result.objects, bytes: result.bytes, buckets: result.buckets }
        assert.equal(result.ownershipCaptured, true)
        for (const path of paths) {
            const row = catalog.objects.find(row => row.bucket_id === path.bucket && row.name === path.name)
            assert.equal(row.owner_id, owner.id)
            assert.equal(row.user_metadata.nested.retained, true)
        }
    })
    // Use normal whole-database backup/restore. No SQL INSERT/UPDATE/DELETE is
    // performed against Storage catalog tables to repair an object's owner.
    beginPhase('paired_database_capture')
    timing.databaseCaptureStartedAt = new Date().toISOString()
    const dump = execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc'], { maxBuffer: 64 * 1024 * 1024 })
    await writeFile(resolve(evidence, 'synthetic-storage-recovery.dump'), dump, { mode: 0o600 })
    timing.databaseCapturedAt = new Date().toISOString(); timing.databaseDumpBytes = dump.length
    beginPhase('database_restore')
    recoveryStarted = performance.now(); timing.recoveryStartedAt = new Date().toISOString()
    sql(`CREATE DATABASE ${database} TEMPLATE template0;`); databaseCreated = true
    const restored = spawnSync('docker', ['exec', '-i', container, 'pg_restore', '-U', 'supabase_admin', '-d', database, '--exit-on-error'], { input: dump, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
    await writeFile(resolve(evidence, 'database-restore.log'), restored.stderr || '', { mode: 0o600 })
    assert.equal(restored.status, 0, 'Synthetic database restore failed; inspect private evidence')
    beginPhase('forward_schema_reconciliation')
    const migrations = await readdir(resolve(repo, 'supabase/migrations'))
    async function apply(suffix) {
        const matching = migrations.filter(file => file.endsWith('_' + suffix + '.sql')); assert.equal(matching.length, 1)
        sql(await readFile(resolve(repo, 'supabase/migrations', matching[0]), 'utf8'), database)
    }
    for (const [suffix, signature] of [
        ['profile_operation_journal', 'public.apply_profile_operation(jsonb)'],
        ['nsso_runtime_limits', 'public.nsso_security_health()'],
        ['nsso_retrieval_bounds', 'private.validate_retrieval_request(public.vector,double precision,integer,text,text[],integer,public.vector)'],
        ['nsso_profile_media_registry', 'public.register_profile_media(uuid,text,text,text,bigint)'],
    ]) if (sql(`SELECT to_regprocedure('${signature}') IS NULL`, database) === 't') await apply(suffix)
    await apply('nsso_safe_schema_defaults')
    await apply('nsso_payment_receipt_minimization')
    await apply('nsso_profile_auth_cascade')
    await apply('nsso_profile_write_cutover')
    await apply('nsso_media_write_cutover')
    beginPhase('isolated_data_and_storage_startup')
    const original = JSON.parse(execFileSync('docker', ['inspect', storage], { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 }))[0]
    const environment = original.Config.Env.map(entry => {
        const split = entry.indexOf('='), name = entry.slice(0, split), value = entry.slice(split + 1)
        if (['DATABASE_URL', 'VECTOR_DATABASE_URL'].includes(name)) { const url = new URL(value); url.pathname = `/${database}`; return `${name}=${url}` }
        return entry
    })
    assert.ok(environment.every(value => !value.includes('\n')), 'Unexpected multiline container configuration')
    const backend = environment.find(entry => entry.startsWith('STORAGE_BACKEND='))?.slice('STORAGE_BACKEND='.length)
    assert.equal(backend, 'file', 'This proof requires an isolated local file backend')
    const backendPath = environment.find(entry => entry.startsWith('FILE_STORAGE_BACKEND_PATH='))?.slice('FILE_STORAGE_BACKEND_PATH='.length)
    assert.ok(backendPath?.startsWith('/') && !backendPath.includes('..'), 'Unexpected local backend path')
    const envFile = resolve(evidence, 'restored-storage.env')
    await writeFile(envFile, environment.join('\n') + '\n', { mode: 0o600 })
    const network = Object.keys(original.NetworkSettings.Networks)[0]
    execFileSync('docker', ['run', '-d', '--rm', '--name', restoredStorage, '--network', network, '-p', '127.0.0.1:55834:5000', '--env-file', envFile, '--tmpfs', `${backendPath}:rw`, original.Config.Image], { encoding: 'utf8' })
    storageStarted = true
    const originalRest = JSON.parse(execFileSync('docker', ['inspect', container.replace('supabase_db_', 'supabase_rest_')], { encoding: 'utf8' }))[0]
    const restEnvironment = originalRest.Config.Env.map(entry => {
        if (!entry.startsWith('PGRST_DB_URI=')) return entry
        const url = new URL(entry.slice('PGRST_DB_URI='.length)); url.pathname = '/' + database
        return 'PGRST_DB_URI=' + url
    })
    assert.ok(restEnvironment.every(value => !value.includes('\n')))
    const restEnv = resolve(evidence, 'restored-rest.env'); await writeFile(restEnv, restEnvironment.join('\n') + '\n', { mode: 0o600 })
    execFileSync('docker', ['run', '-d', '--rm', '--name', restoredRest, '--network', Object.keys(originalRest.NetworkSettings.Networks)[0], '-p', '127.0.0.1:55835:3000', '--env-file', restEnv, originalRest.Config.Image], { encoding: 'utf8' })
    restStarted = true
    for (let attempt = 0; ; attempt++) {
        let ready = false
        try { ready = (await fetch(origin + '/status')).ok && (await fetch('http://127.0.0.1:55835/')).ok } catch { /* Local containers are starting. */ }
        if (ready) break
        if (attempt >= 60) throw new Error('Isolated recovered Storage did not start')
        await new Promise(resolve => setTimeout(resolve, 200))
    }
    const recoveredClient = token => createClient(origin, config.SERVICE_ROLE_KEY, {
        ...options(token), global: { ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
            fetch: (input, init) => {
                const url = new URL(input)
                if (url.pathname.startsWith('/rest/v1/')) { url.port = '55835'; url.pathname = url.pathname.slice('/rest/v1'.length) }
                else url.pathname = url.pathname.replace(/^\/storage\/v1(?=\/)/, '')
                return fetch(url, { ...init, signal: AbortSignal.timeout(10000) })
            } },
    })
    const recovered = recoveredClient()
    beginPhase('empty_backend_and_catalog_acceptance')
    await check('database restore retains owners while an empty Storage backend has no bytes', async () => {
        assert.deepEqual(JSON.parse(sql(STORAGE_CATALOG_QUERY, database)), catalog)
        assert.ok((await recovered.storage.from(paths[0].bucket).download(paths[0].name)).error)
    })
    beginPhase('byte_restore_and_checksum_metadata_acceptance')
    await check('Storage API restores every byte and preserves database ownership plus user metadata', async () => {
        const result = await verifyStorage({ directory, keyFile, restoreClient: recovered, readCatalog: () => JSON.parse(sql(STORAGE_CATALOG_QUERY, database)) })
        assert.equal(result.ownershipVerified, true); assert.equal(result.userMetadataVerified, true)
        assert.equal(result.objects, catalog.objects.length)
    })
    beginPhase('final_policy_and_app_replacement_acceptance')
    await check('final policies deny raw owner writes but permit owner app-mediated replacement; foreign edits fail', async () => {
        const ownerClient = recoveredClient(owner.token), otherClient = recoveredClient(other.token)
        assert.deepEqual(ok(await recovered.rpc('nsso_security_health')), { healthy: true })
        const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#335577' } }).jpeg().toBuffer()
        for (const path of paths) {
            assert.ok((await otherClient.storage.from(path.bucket).update(path.name, png, { contentType: 'image/png' })).error)
            assert.ok((await ownerClient.storage.from(path.bucket).update(path.name, png, { contentType: 'image/png' })).error)
            assert.ok((await ownerClient.storage.from(path.bucket).upload(`${owner.id}/bypass-${randomUUID()}.jpg`, jpeg, { contentType: 'image/jpeg' })).error)
            const row = JSON.parse(sql(STORAGE_CATALOG_QUERY, database)).objects.find(row => row.bucket_id === path.bucket && row.name === path.name)
            assert.equal(row.owner_id, owner.id); assert.equal(row.user_metadata.nested.retained, true)
            const kind = path.bucket === 'avatars' ? 'avatar' : 'project', replacement = `${owner.id}/${kind}/${randomUUID()}.jpg`
            ok(await recovered.storage.from(path.bucket).upload(replacement, jpeg, { contentType: 'image/jpeg', upsert: false }))
            const args = { p_actor_id: owner.id, p_bucket_id: path.bucket, p_object_name: replacement, p_content_type: 'image/jpeg', p_bytes: jpeg.length }
            assert.ok((await otherClient.rpc('register_profile_media', args)).error)
            assert.ok((await recovered.rpc('register_profile_media', { ...args, p_actor_id: other.id })).error)
            const asset = ok(await recovered.rpc('register_profile_media', args)); assert.equal(asset.objectName, replacement)
            const snapshot = ok(await ownerClient.rpc('get_profile_snapshot'))
            const url = recovered.storage.from(path.bucket).getPublicUrl(replacement).data.publicUrl
            const change = kind === 'avatar' ? { kind: 'profile.patch', patch: { profile_pic_url: url } } : { kind: 'project.add', values: { project_name: 'Recovered owner replacement', contribution: 'Synthetic', project_photo_url: url } }
            const saved = ok(await ownerClient.rpc('apply_profile_operation', { p_operation: { version: 1, operationId: randomUUID(), expectedRevision: snapshot.revision, changes: [change] } })); assert.equal(saved.status, 'applied')
            if (kind === 'avatar') assert.ok((await otherClient.from('profiles').update({ profile_pic_url: url }).eq('user_id', owner.id)).error)
            else {
                const foreign = ok(await otherClient.rpc('get_profile_snapshot'))
                const denied = ok(await otherClient.rpc('apply_profile_operation', { p_operation: { version: 1, operationId: randomUUID(), expectedRevision: foreign.revision, changes: [{ kind: 'project.patch', id: saved.changes[0].id, patch: { project_name: 'Foreign overwrite' } }] } })); assert.equal(denied.status, 'rejected')
            }
            ok(await recovered.storage.from(path.bucket).download(path.name))
            assert.equal(ok(await otherClient.storage.from(path.bucket).remove([path.name])).length, 0)
            assert.equal(ok(await ownerClient.storage.from(path.bucket).remove([path.name])).length, 1)
        }
    })
    timing.recoveryAcceptedAt = new Date().toISOString()
    timing.recoveryThroughAcceptanceMs = Number((performance.now() - recoveryStarted).toFixed(2))
    timing.checks = results.length
    await writeFile(resolve(evidence, 'checks.json'), JSON.stringify({ checks: results, objects: catalog.objects.length, ownershipVerified: true, systemTimestampsPreserved: false }, null, 2), { mode: 0o600 })
    console.log(`Completed ${results.length} local ownership-aware media recovery checks.`)
} finally {
    beginPhase('synthetic_fixture_cleanup')
    if (storageStarted) execFileSync('docker', ['stop', restoredStorage], { encoding: 'utf8' })
    if (restStarted) execFileSync('docker', ['stop', restoredRest], { encoding: 'utf8' })
    if (databaseCreated) sql(`DROP DATABASE ${database};`)
    // Remove only files/accounts created by this opt-in local fixture, through APIs.
    const cleanupFailures = []
    for (const actor of actors) {
        for (const bucket of ['avatars', 'portfolio-assets']) {
            const result = await service.storage.from(bucket).remove([`${actor.id}/recovery-fixture.png`])
            if (result.error) cleanupFailures.push(result.error)
        }
        const deleted = await service.auth.admin.deleteUser(actor.id)
        if (deleted.error) cleanupFailures.push(deleted.error)
    }
    const finished = performance.now(), finishedAt = new Date().toISOString()
    phase.completedAt = finishedAt; phase.durationMs = Number((finished - phase.started).toFixed(2)); delete phase.started
    timing.finishedAt = finishedAt; timing.totalDrillMs = Number((finished - drillStarted).toFixed(2)); timing.cleanupSucceeded = cleanupFailures.length === 0
    await writeFile(resolve(evidence, 'timing.json'), JSON.stringify(timing, null, 2), { mode: 0o600 })
    if (cleanupFailures.length) throw new AggregateError(cleanupFailures, 'Synthetic Storage/Auth cleanup failed; errors are never ignored')
}
