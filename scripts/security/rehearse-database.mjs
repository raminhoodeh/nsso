/** Explicitly opt-in integration rehearsal. Never accepts a remote database/API.
 * Usage: NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL=1 node scripts/security/rehearse-database.mjs STATUS_JSON CATALOG_SQL EVIDENCE_DIR
 * Inputs contain only a local CLI status and a metadata-only current-schema clone.
 * The named dedicated local stack is reset; all accounts/data are synthetic.
 */
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

if (process.env.NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL !== '1') throw new Error('Local rehearsal requires explicit opt-in')
const [statusFile, catalogFile, evidenceArg] = process.argv.slice(2)
if (!statusFile || !catalogFile || !evidenceArg) throw new Error('Expected STATUS_JSON CATALOG_SQL EVIDENCE_DIR')
const config = JSON.parse(readFileSync(statusFile, 'utf8'))
const api = new URL(config.API_URL)
if (api.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(api.hostname)) throw new Error('Only local HTTP Supabase is allowed')
if (!['127.0.0.1', 'localhost'].includes(new URL(config.DB_URL).hostname)) throw new Error('Only local databases are allowed')
const container = process.env.NSSO_LOCAL_REHEARSAL_CONTAINER || 'supabase_db_nsso-security-rehearsal-20261026'
if (!/^supabase_db_nsso-security-rehearsal-[a-z0-9-]+$/.test(container)) throw new Error('Dedicated rehearsal container required')
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidence = resolve(evidenceArg)
if (evidence.startsWith(repo + '/')) throw new Error('Private evidence must be outside the repository')
mkdirSync(evidence, { recursive: true, mode: 0o700 })
const results = []
function sql(query, db = 'postgres') {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim()
}
function apply(name) {
  const suffix = name.replace(/^\d+_/, '')
  const matches = readdirSync(resolve(repo, 'supabase/migrations')).filter(file => file.replace(/^\d+_/, '') === suffix)
  assert.equal(matches.length, 1, `Expected exactly one forward migration ending ${suffix}`)
  sql(readFileSync(resolve(repo, 'supabase/migrations', matches[0]), 'utf8'))
}
function literal(value) { return "'" + String(value).replaceAll("'", "''") + "'" }
function client(key, token) {
  return createClient(config.API_URL, key, { auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}) })
}
const service = client(config.SERVICE_ROLE_KEY)
const anon = client(config.ANON_KEY)
async function check(name, run) {
  await run(); results.push(name); console.log(`PASS ${name}`)
  writeFileSync(resolve(evidence, 'checks.json'), JSON.stringify({ checks: results }, null, 2), { mode: 0o600 })
}
function ok(result) { assert.equal(result.error, null, result.error?.message); return result.data }
function denied(result) { assert.ok(result.error, 'Operation unexpectedly succeeded'); return result.error }
async function refreshSchema() { sql("NOTIFY pgrst,'reload schema';"); await new Promise(r => setTimeout(r, 350)) }
async function withRestDatabase(database, port, run) {
  const originalName = container.replace('supabase_db_', 'supabase_rest_')
  const original = JSON.parse(execFileSync('docker', ['inspect', originalName], { encoding: 'utf8' }))[0]
  const env = original.Config.Env.map(value => {
    if (!value.startsWith('PGRST_DB_URI=')) return value
    const uri = new URL(value.slice('PGRST_DB_URI='.length)); uri.pathname = '/' + database
    return 'PGRST_DB_URI=' + uri.toString()
  })
  assert.ok(env.some(value => value.startsWith('PGRST_DB_URI=')))
  assert.ok(env.every(value => !value.includes('\n')), 'Unexpected multiline local container configuration')
  const envFile = resolve(evidence, database + '-rest.env')
  writeFileSync(envFile, env.join('\n') + '\n', { mode: 0o600 })
  const name = 'nsso-security-rest-' + database.replaceAll('_', '-')
  spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' })
  const network = Object.keys(original.NetworkSettings.Networks)[0]
  execFileSync('docker', ['run', '-d', '--rm', '--name', name, '--network', network, '-p', `127.0.0.1:${port}:3000`, '--env-file', envFile, original.Config.Image], { encoding: 'utf8' })
  const origin = `http://127.0.0.1:${port}`
  const request = async (path, token = config.ANON_KEY, body) => {
    const response = await fetch(origin + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json() }
  }
  try {
    let ready = false
    for (let i = 0; i < 40; i++) {
      try { ready = (await fetch(origin + '/')).ok } catch { /* Dedicated local REST is starting. */ }
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'Dedicated local recovered REST did not become ready')
    await run(request)
  } finally { execFileSync('docker', ['stop', name], { encoding: 'utf8' }) }
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=', 'base64')

// Storage bytes are removed through its API, never by deleting metadata rows.
// This reset is confined to the dedicated local container above.
const existingObjects = JSON.parse(sql("SELECT coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name)),'[]'::json) FROM storage.objects"))
for (const bucket of [...new Set(existingObjects.map(x => x.bucket))]) {
  ok(await service.storage.from(bucket).remove(existingObjects.filter(x => x.bucket === bucket).map(x => x.name)))
}
for (const bucket of ok(await service.storage.listBuckets())) ok(await service.storage.deleteBucket(bucket.id))
sql(`DO $$ DECLARE p record; BEGIN FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP EXECUTE format('DROP POLICY %I ON storage.objects',p.policyname); END LOOP; END $$;
DROP SCHEMA IF EXISTS private CASCADE;
DROP SCHEMA public CASCADE;
CREATE SCHEMA public AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
TRUNCATE auth.users CASCADE;
`)
sql(readFileSync(catalogFile, 'utf8'))
await refreshSchema()

const actors = {}
for (const name of ['owner', 'other', 'admin', 'film', 'legacyAdmin']) {
  const email = `${name.toLowerCase()}@nsso-rehearsal.invalid`
  const password = 'Local-Synthetic-Only-471!'
  const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user
  const login = ok(await client(config.ANON_KEY).auth.signInWithPassword({ email, password }))
  actors[name] = { id: user.id, email, client: client(config.ANON_KEY, login.session.access_token), token: login.session.access_token }
}
const { owner, other, admin, film, legacyAdmin } = actors
// Preserve deliberately untrusted legacy roles and historical financial rows.
sql(`UPDATE public.users SET user_type='admin',paypal_me_slug='legacy-owner',deity_fast_mode=true WHERE id=${literal(legacyAdmin.id)};
UPDATE public.users SET paypal_me_slug='old-payout',deity_fast_mode=true WHERE id=${literal(owner.id)};
INSERT INTO public.subscriptions(user_id,polar_sub_id,status) VALUES(${literal(owner.id)},'synthetic-historical-paid','active');
INSERT INTO public.referrals(referrer_user_id,referred_user_id,referral_code,subscription_status) SELECT ${literal(owner.id)},${literal(other.id)},referral_code,'active' FROM public.users WHERE id=${literal(owner.id)};`)
const product = ok(await service.from('products').insert({ user_id: owner.id, name: 'Synthetic legacy product', price: '£9', headline: 'Private draft body', paypal_html: '<form action="https://www.paypal.com/ncp/payment/ABC123" method="post"></form>', success_url: 'https://example.invalid/private-delivery' }).select('id').single())
ok(await owner.client.storage.from('avatars').upload(`${owner.id}/existing.png`, png, { contentType: 'image/png' }))
ok(await owner.client.storage.from('portfolio-assets').upload('projects/legacy-owned.png', png, { contentType: 'image/png' }))

apply('nsso_security_containment.sql')
apply('nsso_product_projection.sql')
sql(`INSERT INTO private.app_permissions(user_id,permission) VALUES(${literal(admin.id)},'nsso:admin'),(${literal(admin.id)},'razinflix:manage'),(${literal(film.id)},'razinflix:manage');`)
await refreshSchema()

await check('stage A preserves legacy read and preference hand-off', async () => {
  const row = ok(await owner.client.from('users').select('*').eq('id', owner.id).single())
  assert.equal(row.paypal_me_slug, 'old-payout')
  ok(await owner.client.from('users').update({ paypal_me_slug: 'legacy-write', deity_fast_mode: false }).eq('id', owner.id))
  let account = ok(await owner.client.rpc('get_current_account'))
  assert.equal(account.paypal_me_slug, 'legacy-write'); assert.equal(account.deity_fast_mode, false)
  account = ok(await owner.client.rpc('update_account_settings', { p_patch: { paypal_me_slug: 'rpc-write', deity_fast_mode: true } }))
  const legacy = ok(await owner.client.from('users').select('paypal_me_slug,deity_fast_mode').eq('id', owner.id).single())
  assert.equal(account.paypal_me_slug, 'rpc-write'); assert.equal(legacy.paypal_me_slug, 'rpc-write'); assert.equal(legacy.deity_fast_mode, true)
})
await check('untrusted legacy role cannot become protected permission', async () => {
  assert.equal(ok(await service.rpc('has_app_permission', { p_user_id: legacyAdmin.id, p_permission: 'nsso:admin' })), false)
  const me = ok(await legacyAdmin.client.rpc('get_current_account'))
  assert.equal(me.user_type, 'standard'); assert.deepEqual(me.permissions, [])
  denied(await legacyAdmin.client.from('users').update({ user_type: 'admin' }).eq('id', legacyAdmin.id))
  denied(await anon.from('users').update({ username: 'stolen' }).eq('id', owner.id))
  denied(await other.client.from('users').update({ user_type: 'admin' }).eq('id', owner.id))
  denied(await owner.client.from('users').update({ is_premium: false }).eq('id', owner.id))
})
await check('current account is private identity-derived and idempotent', async () => {
  denied(await anon.rpc('get_current_account'))
  const accounts = await Promise.all(Array.from({ length: 5 }, () => owner.client.rpc('ensure_current_account')))
  accounts.forEach(r => assert.equal(ok(r).id, owner.id))
  assert.equal(accounts[0].data.email, owner.email); assert.equal(accounts[0].data.is_premium, true)
  denied(await owner.client.rpc('update_account_settings', { p_patch: { user_type: 'admin' } }))
  denied(await owner.client.rpc('update_account_settings', { p_patch: { deity_fast_mode: 'true' } }))
  denied(await owner.client.rpc('update_account_settings', { p_patch: { paypal_me_slug: 'javascript:bad' } }))
  denied(await owner.client.from('account_settings').select('*'))
  assert.equal(sql(`SELECT count(*) FROM public.profiles WHERE user_id=${literal(owner.id)}`), '1')
})
await check('free username claims normalize and reject reserved/conflicting names', async () => {
  assert.equal(ok(await owner.client.rpc('claim_profile_username', { p_username: 'Rehearsal_Owner' })).username, 'rehearsal_owner')
  denied(await other.client.rpc('claim_profile_username', { p_username: 'REHEARSAL_OWNER' }))
  denied(await owner.client.rpc('claim_profile_username', { p_username: 'admin' }))
  denied(await anon.rpc('claim_profile_username', { p_username: 'test-owner' }))
})
await check('admin listing and changes require service plus fresh protected actor', async () => {
  denied(await anon.rpc('admin_list_accounts', { p_actor_id: admin.id }))
  denied(await admin.client.rpc('admin_list_accounts', { p_actor_id: admin.id }))
  denied(await service.rpc('admin_list_accounts', { p_actor_id: legacyAdmin.id }))
  denied(await service.rpc('admin_list_accounts', { p_actor_id: admin.id, p_limit: 101 }))
  const rows = ok(await service.rpc('admin_list_accounts', { p_actor_id: admin.id }))
  assert.equal(rows.length, 5); assert.deepEqual(rows.find(x => x.id === admin.id).permissions, ['nsso:admin', 'razinflix:manage'])
  assert.equal(rows.find(x => x.id === legacyAdmin.id).user_type, 'standard')
  assert.equal(denied(await service.rpc('admin_set_permission', { p_actor_id: admin.id, p_user_id: admin.id, p_permission: 'nsso:admin', p_granted: false })).code, '23514')
  ok(await service.rpc('admin_set_permission', { p_actor_id: admin.id, p_user_id: other.id, p_permission: 'nsso:admin', p_granted: true }))
  ok(await service.rpc('admin_set_permission', { p_actor_id: other.id, p_user_id: other.id, p_permission: 'nsso:admin', p_granted: false }))
  assert.equal(sql('SELECT count(*) FROM private.permission_audit'), '2')
  denied(await service.rpc('admin_set_permission', { p_actor_id: film.id, p_user_id: owner.id, p_permission: 'nsso:admin', p_granted: true }))
})
await check('historical earnings stay owner-only with zero invented current revenue', async () => {
  denied(await anon.rpc('get_user_earnings_stats', { user_uuid: owner.id }))
  denied(await other.client.rpc('get_user_earnings_stats', { user_uuid: owner.id }))
  const row = ok(await owner.client.rpc('get_user_earnings_stats', { user_uuid: owner.id }))[0]
  assert.equal(Number(row.active_referrals), 1); assert.equal(Number(row.expected_earnings), 0); assert.equal(row.paypal_me_slug, 'rpc-write')
  assert.equal(ok(await owner.client.rpc('get_referred_users_details')).length, 1)
  denied(await anon.from('referrals').insert({ referrer_user_id: owner.id, referred_user_id: film.id, referral_code: 'fabricated', subscription_status: 'active' }))
  denied(await other.client.from('subscriptions').insert({ user_id: other.id, polar_sub_id: 'fake', status: 'active' }))
  assert.equal(sql("SELECT count(*) FROM public.subscriptions WHERE polar_sub_id='synthetic-historical-paid'"), '1')
})
await check('raw corpus and cross-profile context RPCs are server-only', async () => {
  denied(await anon.from('agent_knowledge').select('id,content,metadata'))
  denied(await owner.client.from('agent_knowledge').select('id,content,metadata'))
  denied(await anon.rpc('get_agent_context', { user_uuid: owner.id }))
  denied(await owner.client.rpc('get_agent_context', { user_uuid: other.id }))
  ok(await service.rpc('get_agent_context', { user_uuid: owner.id }))
  assert.equal(sql("SELECT bool_or(has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('intelligent_search','hybrid_search','match_documents')"), 'f')
})
await check('film metadata is publicly readable and browser writes are denied', async () => {
  ok(await anon.from('razinflix_films').select('id,title').limit(1))
  denied(await anon.from('razinflix_films').insert({ title: 'Anonymous write' }))
  denied(await film.client.from('razinflix_films').insert({ title: 'Direct authenticated write' }))
  ok(await service.from('razinflix_films').insert({ title: 'Synthetic server film' }))
  assert.equal(ok(await anon.from('razinflix_films').select('title').eq('title', 'Synthetic server film')).length, 1)
})
await check('feed aggregation is service-only and concurrent runs capture each pending update once', async () => {
  denied(await owner.client.rpc('process_daily_feed_aggregation', { target_user_id: owner.id }))
  sql(`INSERT INTO public.feed_pending_updates(user_id,type,reference_id,metadata) VALUES(${literal(owner.id)},'project_added',gen_random_uuid(),'{"marker":"one"}'),(${literal(owner.id)},'product_added',gen_random_uuid(),'{"marker":"two"}');`)
  const attempts = await Promise.all([service.rpc('process_daily_feed_aggregation', { target_user_id: owner.id }), service.rpc('process_daily_feed_aggregation', { target_user_id: owner.id })])
  attempts.forEach(ok)
  assert.equal(sql(`SELECT count(*) FROM public.feed_pending_updates WHERE user_id=${literal(owner.id)}`), '0')
  assert.equal(sql(`SELECT count(*) FROM public.feed_posts WHERE user_id=${literal(owner.id)} AND type='daily_summary'`), '1')
  sql(`INSERT INTO public.feed_pending_updates(user_id,type,reference_id,metadata) VALUES(${literal(owner.id)},'project_added',gen_random_uuid(),'{"marker":"later"}');`)
  ok(await service.rpc('process_daily_feed_aggregation', { target_user_id: owner.id }))
  assert.equal(sql(`SELECT count(*) FROM public.feed_posts WHERE user_id=${literal(owner.id)} AND type='daily_summary'`), '2')
})
await check('network creation is atomic and never changes the recipient private notes', async () => {
  let result = ok(await owner.client.rpc('connect_my_nsso', { p_connected_user_id: other.id, p_location_name: 'First place' }))
  assert.equal(result.isNewConnection, true)
  assert.deepEqual(Object.keys(result).sort(), ['isNewConnection','scannedUser','success'])
  assert.equal(result.scannedUser.username, ok(await anon.from('users').select('username').eq('id', other.id).single()).username)
  ok(await other.client.from('my_nsso').update({ notes: 'Recipient secret', location_name: 'Recipient place' }).eq('user_id', other.id).eq('connected_user_id', owner.id))
  result = ok(await owner.client.rpc('connect_my_nsso', { p_connected_user_id: other.id, p_location_name: 'Second place' }))
  assert.equal(result.isNewConnection, false)
  const reverse = ok(await other.client.from('my_nsso').select('notes,location_name').eq('connected_user_id', owner.id).single())
  assert.equal(reverse.notes, 'Recipient secret'); assert.equal(reverse.location_name, 'Recipient place')
  denied(await owner.client.from('my_nsso').update({ connected_user_id: film.id }).eq('user_id', owner.id))
  denied(await owner.client.from('my_nsso').update({ id: film.id }).eq('user_id', owner.id))
  ok(await owner.client.from('my_nsso').update({ notes: 'Owner private note', location_name: 'Owner edited place' }).eq('user_id', owner.id))
  assert.equal(ok(await owner.client.from('my_nsso').select('id').eq('user_id', other.id)).length, 0)
  denied(await owner.client.from('my_nsso').insert({ user_id: owner.id, connected_user_id: film.id }))
  denied(await owner.client.rpc('connect_my_nsso', { p_connected_user_id: owner.id }))
  denied(await anon.rpc('connect_my_nsso', { p_connected_user_id: owner.id }))
})
await check('actual storage API enforces avatar namespace and legacy asset ownership', async () => {
  denied(await anon.storage.from('avatars').upload(`${owner.id}/anonymous.png`, png, { contentType: 'image/png' }))
  denied(await other.client.storage.from('avatars').upload(`${owner.id}/intruder.png`, png, { contentType: 'image/png' }))
  denied(await owner.client.storage.from('avatars').upload(`${owner.id}/executable.svg`, Buffer.from('<svg/>'), { contentType: 'image/svg+xml' }))
  denied(await owner.client.storage.from('avatars').upload(`${owner.id}/oversized.png`, Buffer.alloc(5242881), { contentType: 'image/png' }))
  denied(await service.storage.from('razinflix_posters').upload('unsupported.html', Buffer.from('<script/>'), { contentType: 'text/html' }))
  ok(await owner.client.storage.from('avatars').upload(`${owner.id}/new.png`, png, { contentType: 'image/png' }))
  ok(await owner.client.storage.from('avatars').upload(`${owner.id}/existing.png`, png, { contentType: 'image/png', upsert: true }))
  denied(await other.client.storage.from('avatars').update(`${owner.id}/existing.png`, png, { contentType: 'image/png' }))
  const removed = ok(await other.client.storage.from('avatars').remove([`${owner.id}/existing.png`]))
  assert.equal(removed.length, 0)
  const downloaded = ok(await owner.client.storage.from('avatars').download(`${owner.id}/existing.png`))
  assert.equal(createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex'), createHash('sha256').update(png).digest('hex'))
  ok(await owner.client.storage.from('portfolio-assets').update('projects/legacy-owned.png', png, { contentType: 'image/png' }))
  denied(await other.client.storage.from('portfolio-assets').update('projects/legacy-owned.png', png, { contentType: 'image/png' }))
  denied(await owner.client.storage.from('portfolio-assets').upload('projects/new-without-owner.png', png, { contentType: 'image/png' }))
  ok(await owner.client.storage.from('portfolio-assets').upload(`${owner.id}/projects/new.png`, png, { contentType: 'image/png' }))
})

// Simulate reviewed private canonical backfill before the public/raw grant cutover.
ok(await service.from('products').update({ payment_config: { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/ncp/payment/ABC123', fields: [], label: 'Pay with PayPal' } }).eq('id', product.id))
apply('nsso_product_privacy_cutover.sql')
apply('nsso_account_privacy_cutover.sql')
await refreshSchema()

await check('final public identity contains no private account or authority fields', async () => {
  const rows = ok(await anon.from('users').select('*'))
  assert.equal(rows.length, 5)
  rows.forEach(row => assert.deepEqual(Object.keys(row).sort(), ['created_at', 'id', 'is_premium', 'username']))
  denied(await owner.client.from('users').update({ username: 'bypass-rpc' }).eq('id', owner.id))
  const account = ok(await owner.client.rpc('get_current_account'))
  assert.equal(account.email, owner.email); assert.equal(account.paypal_me_slug, 'rpc-write'); assert.equal(account.deity_fast_mode, true)
  denied(await anon.from('profiles').select('embedding'))
  ok(await anon.from('profiles').select('user_id,full_name,headline,bio,profile_pic_url').limit(1))
  denied(await owner.client.from('profiles').update({ embedding: Array(768).fill(0) }).eq('user_id', owner.id))
  assert.equal(ok(await owner.client.rpc('update_account_settings', { p_patch: { deity_fast_mode: false } })).deity_fast_mode, false)
})
await check('product DTOs preserve legacy public page and draft owner editing without raw exposure', async () => {
  const publicPage = ok(await anon.rpc('get_product_details', { p_product_id: product.id }))
  assert.equal(publicPage.headline, 'Private draft body'); assert.equal(publicPage.sales_page_published, null)
  assert.equal(publicPage.payment_config.action, 'https://www.paypal.com/ncp/payment/ABC123')
  assert.equal(Object.hasOwn(publicPage, 'paypal_html'), false); assert.equal(Object.hasOwn(publicPage, 'success_url'), false)
  denied(await anon.from('products').select('paypal_html,headline').eq('id', product.id))
  ok(await anon.from('products').select('id,name,payment_config').eq('id', product.id))
  const own = ok(await owner.client.rpc('get_own_products'))
  assert.equal(own[0].id, product.id); assert.ok(own[0].paypal_html.includes('paypal.com'))
  assert.deepEqual(ok(await other.client.rpc('get_own_products')), [])
  ok(await owner.client.from('products').update({ headline: 'Updated body', sales_page_published: false }).eq('id', product.id))
  assert.equal(ok(await anon.rpc('get_product_details', { p_product_id: product.id })), null)
  assert.equal(ok(await owner.client.rpc('get_product_details', { p_product_id: product.id })).headline, 'Updated body')
  denied(await owner.client.from('products').update({ paypal_html: '<script>bad()</script>' }).eq('id', product.id))
  denied(await owner.client.from('products').update({ payment_config: null }).eq('id', product.id))
  const inserted = ok(await owner.client.from('products').insert({ user_id: owner.id, name: 'New draft' }).select('id,name,sales_page_published').single())
  assert.equal(inserted.sales_page_published, false)
  assert.equal(ok(await anon.rpc('get_product_details', { p_product_id: inserted.id })), null)
})
await check('database rejects malformed canonical payment data even for privileged writes', async () => {
  const invalids = [
    { version: 1, kind: 'hosted-button', hostedButtonId: 'ABC123', currency: 'GBP', html: '<script/>' },
    { version: 1, kind: 'hosted-button', hostedButtonId: 'abc', currency: 'GBP' },
    { version: 1, kind: 'payment-form', action: 'https://www.paypal.com.attacker.invalid/ncp/payment/ABC123', fields: [], label: 'Pay' },
    { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/cgi-bin/webscr', fields: [{ name: 'cmd', value: '_xclick' }], label: 'Pay' },
    { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/ncp/payment/ABC123', fields: [{ name: 'return', value: 'javascript:bad()' }], label: 'Pay' },
    { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/ncp/payment/ABC123', fields: [{ name: 'amount', value: '1000000001' }], label: 'Pay' },
    { version: 1, kind: 'payment-form', action: 'https://www.paypal.com/ncp/payment/ABC123', fields: [{ name: 'item_name', value: 'a' }, { name: 'item_name', value: 'b' }], label: 'Pay' },
  ]
  for (const payment_config of invalids) assert.equal(denied(await service.from('products').update({ payment_config }).eq('id', product.id)).code, '23514')
})
await check('post-cutover Auth signup bootstraps safely and preserves free access', async () => {
  const email = 'after-cutover@nsso-rehearsal.invalid', password = 'Local-Synthetic-Only-471!'
  const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user
  const login = ok(await client(config.ANON_KEY).auth.signInWithPassword({ email, password }))
  const account = ok(await client(config.ANON_KEY, login.session.access_token).rpc('ensure_current_account'))
  assert.equal(account.id, user.id); assert.equal(account.email, email); assert.equal(account.is_premium, true); assert.equal(account.user_type, 'standard')
  assert.ok(account.referral_code); assert.deepEqual(account.permissions, [])
})

await check('isolated database dump restores data and restrictive grants', async () => {
  const dump = execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc'], { maxBuffer: 32 * 1024 * 1024 })
  writeFileSync(resolve(evidence, 'synthetic-rehearsal.dump'), dump, { mode: 0o600 })
  sql('DROP DATABASE IF EXISTS nsso_security_restore; CREATE DATABASE nsso_security_restore TEMPLATE template0;')
  // The local managed-schema clone includes Supabase-owned Realtime functions;
  // restoring their existing settings/owners requires this local cluster role.
  const restored = spawnSync('docker', ['exec', '-i', container, 'pg_restore', '-U', 'supabase_admin', '-d', 'nsso_security_restore', '--exit-on-error'], { input: dump, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  writeFileSync(resolve(evidence, 'restore.log'), restored.stderr || '', { mode: 0o600 })
  assert.equal(restored.status, 0, 'Local restore failed; inspect private restore.log')
  const snapshot = `SELECT jsonb_build_object('users',(SELECT count(*) FROM public.users),'settings',(SELECT count(*) FROM private.account_settings),'memberships',(SELECT count(*) FROM private.app_permissions),'history',(SELECT count(*) FROM public.subscriptions),'products',(SELECT count(*) FROM public.products),'private_columns',(SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name IN ('email','user_type','paypal_me_slug')),'anon_corpus',has_table_privilege('anon','public.agent_knowledge','SELECT'),'anon_admin',has_function_privilege('anon','public.admin_list_accounts(uuid,integer,integer)','EXECUTE'),'authenticated_users_update',has_table_privilege('authenticated','public.users','UPDATE'));`
  assert.equal(sql(snapshot), sql(snapshot, 'nsso_security_restore'))
  writeFileSync(resolve(evidence, 'restore-snapshot.json'), sql(snapshot), { mode: 0o600 })
})

await check('recovered database serves the same safe DTOs through actual PostgREST', async () => {
  await withRestDatabase('nsso_security_restore', 55831, async request => {
    const identity = await request('/users?select=*')
    assert.equal(identity.status, 200)
    identity.body.forEach(row => assert.deepEqual(Object.keys(row).sort(), ['created_at','id','is_premium','username']))
    const account = await request('/rpc/get_current_account', owner.token, {})
    assert.equal(account.status, 200); assert.equal(account.body.id, owner.id); assert.equal(account.body.email, owner.email)
    assert.ok([401,403].includes((await request('/agent_knowledge?select=id,content')).status))
    assert.ok([401,403].includes((await request('/rpc/admin_list_accounts', owner.token, { p_actor_id: admin.id })).status))
  })
})

await check('guarded bootstrap builds a fresh managed project and refuses repeat application', async () => {
  const dump = readFileSync(resolve(evidence, 'synthetic-rehearsal.dump'))
  const toc = execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-l'], { input: dump, encoding: 'utf8' })
  const managedToc = toc.split('\n').filter(line => !line.includes(' TRIGGER auth users on_auth_user_created ') && !line.includes(' POLICY storage objects ') && !line.includes(' SCHEMA - private ')).join('\n')
  const tocFile = resolve(evidence, 'fresh-managed-toc.txt'); writeFileSync(tocFile, managedToc, { mode: 0o600 })
  execFileSync('docker', ['cp', tocFile, container + ':/tmp/nsso-security-fresh-managed-toc.txt'])
  sql('DROP DATABASE IF EXISTS nsso_fresh_bootstrap; CREATE DATABASE nsso_fresh_bootstrap TEMPLATE template0;')
  const managed = spawnSync('docker', ['exec', '-i', container, 'pg_restore', '-U', 'supabase_admin', '-d', 'nsso_fresh_bootstrap', '--exit-on-error', '--schema-only', '--exclude-schema=public', '--exclude-schema=private', '--use-list=/tmp/nsso-security-fresh-managed-toc.txt'], { input: dump, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  writeFileSync(resolve(evidence, 'fresh-managed.log'), managed.stderr || '', { mode: 0o600 }); assert.equal(managed.status, 0)
  const baseline = readFileSync(resolve(repo, 'supabase/bootstrap/schema.sql'), 'utf8')
  sql(baseline, 'nsso_fresh_bootstrap')
  assert.equal(sql('SELECT count(*) FROM public.users', 'nsso_fresh_bootstrap'), '0')
  assert.equal(sql('SELECT count(*) FROM private.app_permissions', 'nsso_fresh_bootstrap'), '0')
  const repeated = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'nsso_fresh_bootstrap', '-v', 'ON_ERROR_STOP=1'], { input: baseline, encoding: 'utf8' })
  assert.notEqual(repeated.status, 0); assert.ok(repeated.stderr.includes('Bootstrap requires empty application schemas'))
  sql(`INSERT INTO auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) VALUES(${literal(owner.id)},${literal(owner.email)},now(),'{"provider":"email"}','{}');`, 'nsso_fresh_bootstrap')
  await withRestDatabase('nsso_fresh_bootstrap', 55832, async request => {
    const identity = await request('/users?select=*')
    assert.equal(identity.status, 200); assert.equal(identity.body.length, 1)
    assert.deepEqual(Object.keys(identity.body[0]).sort(), ['created_at','id','is_premium','username'])
    const account = await request('/rpc/get_current_account', owner.token, {})
    assert.equal(account.status, 200); assert.equal(account.body.email, owner.email); assert.equal(account.body.is_premium, true); assert.deepEqual(account.body.permissions, [])
    assert.ok([401,403].includes((await request('/profiles?select=embedding')).status))
    assert.ok([401,403].includes((await request('/agent_knowledge?select=content')).status))
  })
})
console.log(`Completed ${results.length} local database/Auth/PostgREST/Storage/restore checks.`)
