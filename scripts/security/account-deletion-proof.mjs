/** Synthetic-only proof of self-deletion fencing, media ownership and durable
 * status receipts. Never accepts a remote URL or edits Storage catalog rows. */
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

export async function verifyAccountDeletion({ config, container, sql }) {
 const endpoint = new URL(config.API_URL)
 assert.ok(endpoint.protocol === 'http:' && ['localhost','127.0.0.1'].includes(endpoint.hostname))
 assert.match(container, /^supabase_db_nsso-security-[a-z0-9-]+$/)
 const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
 const options = token => ({ auth: { persistSession: false, autoRefreshToken: false }, ...(token ? { global: { headers: { Authorization: 'Bearer '+token } } } : {}) })
 const service = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options())
 const anon = createClient(config.API_URL, config.ANON_KEY, options())
 const ok = value => { assert.equal(value.error, null, value.error?.message); return value.data }
 const denied = value => assert.ok(value.error, 'Forbidden deletion capability was granted')
 const actors = [], objects = [], films = [], checks = []
 let failure
 const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#224466' } }).jpeg().toBuffer()
 async function actor(email = 'delete-'+randomUUID()+'@nsso-deletion.invalid') {
  const password = 'Local-Synthetic-Only-471!'
  const user = ok(await service.auth.admin.createUser({ email, password, email_confirm: true })).user
  const client = createClient(config.API_URL, config.ANON_KEY, options())
  const login = ok(await client.auth.signInWithPassword({ email, password }))
  const value = { id: user.id, client: createClient(config.API_URL, config.ANON_KEY, options(login.session.access_token)), operation: randomUUID(), hash: createHash('sha256').update(user.id).digest('hex'), deleted: false }
  actors.push(value); return value
 }
 const args = (value, operation = value.operation) => ({ p_actor_id: value.id, p_operation_id: operation, p_actor_hash: value.hash })
 const prepare = (value, operation) => service.rpc('prepare_profile_deletion', args(value, operation)).then(ok)
 const mediaArgs = (value, bucket, name) => ({ p_actor_id: value.id, p_bucket_id: bucket, p_object_name: name })
 async function upload(value, bucket, name, owned = false) {
  ok(await (owned ? value.client : service).storage.from(bucket).upload(name, jpeg, { contentType: 'image/jpeg', upsert: false }))
  objects.push({ bucket, name }); return name
 }
 async function removeObject(object) { ok(await service.storage.from(object.bucket).remove([object.objectName ?? object.name])) }
 async function removeAccount(value) { ok(await service.auth.admin.deleteUser(value.id, false)); value.deleted = true }
 async function complete(value) { return ok(await service.rpc('complete_profile_deletion', { p_operation_id: value.operation, p_actor_hash: value.hash })) }
 const operation = (revision, changes) => ({ version: 1, operationId: randomUUID(), expectedRevision: revision, changes })
 function absent(value) {
  for (const table of ['profiles','links','contacts','experiences','qualifications','projects','products']) assert.equal(sql(`SELECT count(*) FROM public.${table} WHERE user_id=${literal(value.id)}`), '0')
  for (const table of ['account_settings','app_permissions','profile_operations','profile_revisions','media_assets','profile_deletions','profile_media_uploads']) assert.equal(sql(`SELECT count(*) FROM private.${table} WHERE user_id=${literal(value.id)}`), '0')
  assert.equal(sql(`SELECT (SELECT count(*) FROM auth.users WHERE id=${literal(value.id)})+(SELECT count(*) FROM public.users WHERE id=${literal(value.id)})+(SELECT count(*) FROM public.user_links WHERE user_id=${literal(value.id)})+(SELECT count(*) FROM public.user_contacts WHERE profile_id=${literal(value.id)})`), '0')
 }
 try {
  const a = await actor(), b = await actor()
  const before = ok(await a.client.rpc('get_profile_snapshot'))
  const created = ok(await a.client.rpc('apply_profile_operation', { p_operation: operation(before.revision, [
   { kind: 'profile.patch', patch: { full_name: 'Synthetic deletion owner' } },
   { kind: 'link.add', values: { link_name: 'Owned link', link_url: 'https://example.invalid/owner' } },
   { kind: 'contact.add', values: { method: 'Email', value: 'owner@example.invalid' } },
   { kind: 'experience.add', values: { company_name: 'Owned company', job_title: 'Synthetic' } },
   { kind: 'qualification.add', values: { institution: 'Owned school', qualification_name: 'Synthetic' } },
   { kind: 'project.add', values: { project_name: 'Owned project', contribution: 'Synthetic' } },
   { kind: 'product.add', values: { name: 'Owned offering' } },
  ]) })); assert.equal(created.status, 'applied')
  const otherSnapshot = ok(await b.client.rpc('get_profile_snapshot'))
  ok(await b.client.rpc('apply_profile_operation', { p_operation: operation(otherSnapshot.revision, [{ kind: 'profile.patch', patch: { full_name: 'Other account sentinel' } }]) }))
  sql(`INSERT INTO public.user_links(user_id,name,url) VALUES(${literal(a.id)},'Legacy owned link','https://example.invalid'); INSERT INTO public.user_contacts(profile_id,contact_type,value) VALUES(${literal(a.id)},'email','legacy@example.invalid'); INSERT INTO private.permission_audit(actor_id,target_user_id,permission,granted) VALUES(${literal(a.id)},${literal(b.id)},'razinflix:manage',true),(${literal(b.id)},${literal(a.id)},'razinflix:manage',false)`)
  const actorAudit = sql(`SELECT id FROM private.permission_audit WHERE actor_id=${literal(a.id)} AND target_user_id=${literal(b.id)}`)
  const targetAudit = sql(`SELECT id FROM private.permission_audit WHERE actor_id=${literal(b.id)} AND target_user_id=${literal(a.id)}`)
  const registered = a.id+'/avatar/'+randomUUID()+'.jpg'
  const reserve = ok(await service.rpc('reserve_profile_media', mediaArgs(a, 'avatars', registered)))
  assert.equal(reserve.accountId, a.id)
  await upload(a, 'avatars', registered)
  ok(await service.rpc('register_profile_media', { ...mediaArgs(a, 'avatars', registered), p_content_type: 'image/jpeg', p_bytes: jpeg.length }))
  ok(await service.rpc('finish_profile_media_upload', { ...mediaArgs(a, 'avatars', registered), p_definite: true }))
  const orphan = await upload(a, 'portfolio-assets', a.id+'/product/'+randomUUID()+'.jpg')
  const otherImage = await upload(b, 'avatars', b.id+'/avatar/'+randomUUID()+'.jpg')
  const sharedPoster = await upload(a, 'razinflix_posters', a.id+'/film-shared/'+randomUUID()+'.jpg')
  const sharedFilm = ok(await service.from('razinflix_films').insert({ title: 'Synthetic shared deletion sentinel '+randomUUID(), poster: service.storage.from('razinflix_posters').getPublicUrl(sharedPoster).data.publicUrl }).select('id').single()); films.push(sharedFilm.id)
  const legacy = 'legacy-'+randomUUID()+'.jpg', blocking = a.id+'/legacy-shared-'+randomUUID()+'.jpg'
  sql(`CREATE POLICY nsso_delete_legacy_fixture ON storage.objects FOR INSERT TO authenticated WITH CHECK((SELECT auth.uid())=${literal(a.id)}::uuid AND ((bucket_id='portfolio-assets' AND name=${literal(legacy)}) OR (bucket_id='razinflix_posters' AND name=${literal(blocking)})))`)
  try { await upload(a, 'portfolio-assets', legacy, true); await upload(a, 'razinflix_posters', blocking, true) }
  finally { sql('DROP POLICY nsso_delete_legacy_fixture ON storage.objects') }
  const blocked = await prepare(a)
  assert.equal(blocked.status, 'blocked'); assert.equal(blocked.reason, 'SHARED_MEDIA')
  assert.equal(sql(`SELECT count(*) FROM private.profile_deletions WHERE user_id=${literal(a.id)}`), '0')
  ok(await service.storage.from('portfolio-assets').download(legacy))
  await removeObject({ bucket: 'razinflix_posters', name: blocking })
  checks.push('owned shared assets block deletion before any profile bytes or fence are changed; service-owned shared posters remain unrelated')

  for (const client of [anon, a.client, b.client]) {
   denied(await client.rpc('prepare_profile_deletion', args(a)))
   denied(await client.rpc('reserve_profile_media', mediaArgs(a, 'avatars', a.id+'/avatar/'+randomUUID()+'.jpg')))
   denied(await client.rpc('finish_profile_media_upload', { ...mediaArgs(a, 'avatars', registered), p_definite: true }))
   denied(await client.rpc('get_profile_deletion_receipt', { p_operation_id: a.operation, p_actor_hash: a.hash }))
   denied(await client.rpc('complete_profile_deletion', { p_operation_id: a.operation, p_actor_hash: a.hash }))
  }
  const unknownPath = a.id+'/project/'+randomUUID()+'.jpg'
  ok(await service.rpc('reserve_profile_media', mediaArgs(a, 'portfolio-assets', unknownPath)))
  const busy = await prepare(a)
  assert.equal(busy.status, 'busy'); assert.deepEqual(busy.assets, []); assert.ok(busy.retryAfterSeconds > 0 && busy.retryAfterSeconds <= 120)
  const alias = randomUUID(), aliasState = await prepare(a, alias)
  assert.equal(aliasState.operationId, alias); assert.equal(aliasState.status, 'busy')
  denied(await service.rpc('prepare_profile_deletion', { ...args(b), p_operation_id: a.operation }))
  denied(await service.rpc('reserve_profile_media', mediaArgs(a, 'avatars', a.id+'/avatar/'+randomUUID()+'.jpg')))
  denied(await service.rpc('register_profile_media', { ...mediaArgs(a, 'avatars', registered), p_content_type: 'image/jpeg', p_bytes: jpeg.length }))
  denied(await a.client.rpc('apply_profile_operation', { p_operation: operation(created.revision, [{ kind: 'profile.patch', patch: { bio: 'Must not publish after deletion intent' } }]) }))
  denied(await a.client.rpc('ensure_current_account'))
  denied(await service.rpc('complete_profile_deletion', { p_operation_id: a.operation, p_actor_hash: a.hash }))
  assert.deepEqual(ok(await service.rpc('get_profile_deletion_receipt', { p_operation_id: alias, p_actor_hash: a.hash })), { found: true, completed: false })
  // A response-lost upload is allowed to finish physically, but cannot register
  // after the fence. The lease keeps deletion busy before ANY byte removal.
  await upload(a, 'portfolio-assets', unknownPath)
  denied(await service.rpc('register_profile_media', { ...mediaArgs(a, 'portfolio-assets', unknownPath), p_content_type: 'image/jpeg', p_bytes: jpeg.length }))
  ok(await service.rpc('finish_profile_media_upload', { ...mediaArgs(a, 'portfolio-assets', unknownPath), p_definite: false }))
  assert.equal((await prepare(a)).status, 'busy')
  sql(`UPDATE private.profile_media_uploads SET expires_at=now()-interval '1 second' WHERE user_id=${literal(a.id)}`)
  let ready = await prepare(a)
  assert.equal(ready.status, 'ready')
  assert.deepEqual(new Set(ready.assets.map(asset => asset.objectName)), new Set([registered, orphan, legacy, unknownPath]))
  await removeObject(ready.assets[0])
  ready = await prepare(a)
  assert.equal(ready.assets.length, 3, 'Retry resumes only remaining known objects after a partial removal')
  for (const asset of ready.assets) await removeObject(asset)
  assert.deepEqual((await prepare(a)).assets, [])
  await removeAccount(a); absent(a)
  assert.deepEqual(await complete(a), { completed: true })
  for (const id of [a.operation, alias]) assert.deepEqual(ok(await service.rpc('get_profile_deletion_receipt', { p_operation_id: id, p_actor_hash: a.hash })), { found: true, completed: true })
  assert.deepEqual(ok(await service.rpc('get_profile_deletion_receipt', { p_operation_id: a.operation, p_actor_hash: b.hash })), { found: false, completed: false })
  assert.equal(sql(`SELECT actor_id IS NULL AND target_user_id=${literal(b.id)}::uuid FROM private.permission_audit WHERE id=${actorAudit}`), 't')
  assert.equal(sql(`SELECT actor_id=${literal(b.id)}::uuid AND target_user_id='00000000-0000-0000-0000-000000000000'::uuid FROM private.permission_audit WHERE id=${targetAudit}`), 't')
  denied(await a.client.from('user_links').insert({ user_id: a.id, name: 'Stale token', url: 'https://example.invalid' }))
  denied(await a.client.from('user_contacts').insert({ profile_id: a.id, contact_type: 'email', value: 'stale@example.invalid' }))
  denied(await service.rpc('reserve_profile_media', mediaArgs(a, 'avatars', a.id+'/avatar/'+randomUUID()+'.jpg')))
  assert.equal(ok(await b.client.rpc('get_profile_snapshot')).profile.full_name, 'Other account sentinel')
  ok(await service.storage.from('avatars').download(otherImage)); ok(await service.storage.from('razinflix_posters').download(sharedPoster))
  assert.equal(ok(await service.from('razinflix_films').select('id').eq('id', sharedFilm.id)).length, 1)
  checks.push('leases fence in-flight uploads, new media and profile writes; aliases survive Auth deletion; only own profile, legacy data and media disappear')

  const c = await actor(), prior = ok(await c.client.rpc('get_profile_snapshot'))
  const edit = operation(prior.revision, [{ kind: 'profile.patch', patch: { full_name: 'Concurrent pre-fence edit' } }])
  const child = spawn('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'])
  let output = '', errors = '', timer
  const barrier = new Promise((resolve,reject) => { timer = setTimeout(() => reject(Error('Profile parent-lock barrier timed out')), 5000); child.stdout.on('data', data => { output += data; if (output.includes('deletion-edit-lock-held')) { clearTimeout(timer); resolve() } }); child.on('error',reject) })
  const completed = new Promise((resolve,reject) => { child.stderr.on('data',data=>{errors+=data}); child.on('error',reject); child.on('close',code=>code===0?resolve():reject(Error(errors))) })
  child.stdin.end(`BEGIN; SET LOCAL statement_timeout='4s'; SET LOCAL request.jwt.claim.sub=${literal(c.id)}; SELECT private.profile_lock(${literal(c.id)}); SELECT 'deletion-edit-lock-held'; SELECT pg_sleep(0.5); SELECT public.apply_profile_operation(${literal(JSON.stringify(edit))}::jsonb); COMMIT;`)
  try { await barrier; const state = await prepare(c); await completed; assert.equal(state.status,'ready'); assert.match(output,/"status": "applied"/) }
  finally { clearTimeout(timer); child.kill() }
  denied(await c.client.rpc('apply_profile_operation', { p_operation: operation(prior.revision+1, [{ kind: 'profile.patch', patch: { full_name: 'Must not pass fence' } }]) }))
  await removeAccount(c); absent(c); await complete(c)
  checks.push('operation-first and deletion-first schedules serialize with parent719730 locks and cannot recreate a deleted or fenced profile')

  const r = await actor('raminhoodeh@gmail.com'), t = await actor('troy@nsso.me')
  sql(`INSERT INTO private.app_permissions(user_id,permission) VALUES(${literal(r.id)},'nsso:admin'),(${literal(t.id)},'nsso:admin')`)
  const administratorStates = await Promise.all([prepare(r), prepare(t)])
  assert.equal(administratorStates.filter(state=>state.status==='ready').length,1)
  assert.equal(administratorStates.filter(state=>state.reason==='LAST_ADMIN').length,1)
  const fencedAdmin = administratorStates[0].status==='ready' ? r : t
  const availableAdmin = fencedAdmin===r ? t : r
  denied(await service.rpc('admin_set_permission', { p_actor_id: availableAdmin.id, p_user_id: fencedAdmin.id, p_permission: 'nsso:admin', p_granted: true }))
  denied(await service.rpc('admin_set_permission', { p_actor_id: availableAdmin.id, p_user_id: availableAdmin.id, p_permission: 'nsso:admin', p_granted: false }))
  denied(await service.rpc('admin_set_permission', { p_actor_id: fencedAdmin.id, p_user_id: availableAdmin.id, p_permission: 'nsso:admin', p_granted: false }))
  checks.push('concurrent eligible administrator deletions leave one available administrator and block before destructive work')
 } catch (error) { failure = error }
 const cleanup = []
 for (const object of objects) { try { await removeObject(object) } catch (error) { cleanup.push(error) } }
 for (const value of actors) if (!value.deleted) { try { await removeAccount(value) } catch (error) { cleanup.push(error) } }
 for (const id of films) { const result = await service.from('razinflix_films').delete().eq('id',id); if (result.error) cleanup.push(result.error) }
 if (failure || cleanup.length) throw new AggregateError([...(failure?[failure]:[]),...cleanup], 'Synthetic account deletion proof failed; cleanup failures are never ignored')
 return checks
}
