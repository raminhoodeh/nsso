/** Public, synthetic-only integration proof against an empty local Supabase.
 * NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL=1 NSSO_LOCAL_REHEARSAL_CONTAINER=supabase_db_nsso-security-ci-...
 * node scripts/security/verify-fresh-project.mjs STATUS_JSON PRIVATE_EVIDENCE_DIR [--existing]
 * --existing rechecks an already provisioned synthetic fixture; it never resets data.
 * NSSO_TEST_UNSAFE_POLICY=avatar is a LOCAL negative control: the actor suite must fail.
 */
import assert from 'node:assert/strict'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync,spawnSync} from 'node:child_process'
import {randomUUID,createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import sharp from 'sharp'

if(process.env.NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL!=='1')throw Error('Explicit local rehearsal opt-in required')
const [statusFile,evidenceArg,existing]=process.argv.slice(2)
if(!statusFile||!evidenceArg||(existing&&existing!=='--existing'))throw Error('Expected STATUS_JSON PRIVATE_EVIDENCE_DIR [--existing]')
const config=JSON.parse(readFileSync(statusFile,'utf8')),api=new URL(config.API_URL),db=new URL(config.DB_URL)
if(api.protocol!=='http:'||!['localhost','127.0.0.1'].includes(api.hostname)||!['localhost','127.0.0.1'].includes(db.hostname))throw Error('Local Supabase only')
const container=process.env.NSSO_LOCAL_REHEARSAL_CONTAINER
if(!container||!/^supabase_db_nsso-security-ci-[a-z0-9-]+$/.test(container))throw Error('Dedicated empty CI stack required')
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),evidence=resolve(evidenceArg)
if(evidence===repo||evidence.startsWith(repo+'/'))throw Error('Local credentials/evidence must remain outside repository')
mkdirSync(evidence,{recursive:true,mode:0o700})
const sql=query=>execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8',maxBuffer:16*1024*1024}).trim()
const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
const client=(key,token)=>createClient(config.API_URL,key,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:'Bearer '+token}}}:{})})
const service=client(config.SERVICE_ROLE_KEY),anon=client(config.ANON_KEY),actors={}
const ok=result=>{assert.equal(result.error,null,result.error?.message);return result.data}
const denied=result=>assert.ok(result.error,'Actor unexpectedly obtained forbidden access')
const checks=[]
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);writeFileSync(resolve(evidence,'fresh-checks.json'),JSON.stringify({checks},null,2),{mode:0o600})}
if(!existing){
 sql(readFileSync(resolve(repo,'supabase/bootstrap/schema.sql'),'utf8'))
 sql("NOTIFY pgrst,'reload schema'")
 await new Promise(r=>setTimeout(r,500))
}
for(const name of ['owner','other','admin']){
 const email=name+'@nsso-rehearsal.invalid',password='Local-Synthetic-Only-471!'
 if(!existing)ok(await service.auth.admin.createUser({email,password,email_confirm:true}))
 const login=ok(await client(config.ANON_KEY).auth.signInWithPassword({email,password}))
 actors[name]={id:login.user.id,client:client(config.ANON_KEY,login.session.access_token)}
}
const {owner,other,admin}=actors
if(process.env.NSSO_TEST_UNSAFE_POLICY&&process.env.NSSO_TEST_UNSAFE_POLICY!=='avatar')throw Error('Unknown local negative control')
const unsafe=process.env.NSSO_TEST_UNSAFE_POLICY==='avatar'
if(unsafe)sql("CREATE POLICY nsso_ci_deliberately_unsafe ON storage.objects FOR INSERT TO anon WITH CHECK(bucket_id='avatars')")
try{
 await check('future postgres application objects require explicit browser grants',async()=>{
  sql("CREATE TABLE public.nsso_ci_acl_probe(id integer); INSERT INTO public.nsso_ci_acl_probe VALUES(1); ALTER TABLE public.nsso_ci_acl_probe ENABLE ROW LEVEL SECURITY; CREATE POLICY deliberately_readable ON public.nsso_ci_acl_probe FOR SELECT USING(true); CREATE FUNCTION public.nsso_ci_acl_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'; NOTIFY pgrst,'reload schema'")
  try{
   await new Promise(resolve=>setTimeout(resolve,400))
   for(const actor of ['anon','authenticated']){
    assert.equal(sql(`SELECT has_table_privilege('${actor}','public.nsso_ci_acl_probe','SELECT') OR has_function_privilege('${actor}','public.nsso_ci_acl_function()','EXECUTE')`),'f')
   }
   denied(await anon.from('nsso_ci_acl_probe').select('id'));denied(await owner.client.from('nsso_ci_acl_probe').select('id'))
   denied(await anon.rpc('nsso_ci_acl_function'));denied(await owner.client.rpc('nsso_ci_acl_function'))
  }finally{sql("DROP FUNCTION public.nsso_ci_acl_function(); DROP TABLE public.nsso_ci_acl_probe; NOTIFY pgrst,'reload schema'")}
 })
 await check('fresh Auth bootstrap provisions private free accounts without writable roles',async()=>{
  for(const actor of [owner,other]){
   const current=ok(await actor.client.rpc('get_current_account'));assert.equal(current.id,actor.id);assert.equal(current.is_premium,true);assert.deepEqual(current.permissions,[])
   denied(await actor.client.from('users').update({username:'bypass'}).eq('id',actor.id))
   denied(await actor.client.rpc('has_app_permission',{p_user_id:actor.id,p_permission:'nsso:admin'}))
  }
  const publicRows=ok(await anon.from('users').select('*'));assert.equal(publicRows.length,3)
  for(const row of publicRows)assert.deepEqual(Object.keys(row).sort(),['created_at','id','is_premium','username'])
  denied(await anon.from('profiles').select('embedding'))
  denied(await anon.from('agent_knowledge').select('content,metadata'))
  denied(await owner.client.from('agent_knowledge').select('content'))
  denied(await owner.client.rpc('get_agent_context',{user_uuid:other.id}))
  denied(await owner.client.rpc('admin_list_accounts',{p_actor_id:owner.id}))
  const claimed=ok(await owner.client.rpc('claim_profile_username',{p_username:'owner-local'}));assert.deepEqual(claimed,{success:true,username:'owner-local'});assert.equal(ok(await owner.client.rpc('get_current_account')).is_premium,true)
  assert.equal(sql('SELECT count(*) FROM public.subscriptions'),'0')
  assert.equal(ok(await owner.client.rpc('update_account_settings',{p_patch:{deity_fast_mode:true,paypal_me_slug:'synthetic-only'}})).paypal_me_slug,'synthetic-only')
 })
 await check('protected server membership is independent and last admin cannot be removed',async()=>{
  sql(`INSERT INTO private.app_permissions(user_id,permission) VALUES(${literal(admin.id)},'nsso:admin') ON CONFLICT DO NOTHING`)
  assert.equal(ok(await service.rpc('has_app_permission',{p_user_id:admin.id,p_permission:'nsso:admin'})),true)
  denied(await owner.client.rpc('admin_set_permission',{p_actor_id:admin.id,p_user_id:owner.id,p_permission:'nsso:admin',p_granted:true}))
  denied(await service.rpc('admin_set_permission',{p_actor_id:owner.id,p_user_id:owner.id,p_permission:'nsso:admin',p_granted:true}))
  denied(await service.rpc('admin_set_permission',{p_actor_id:admin.id,p_user_id:admin.id,p_permission:'nsso:admin',p_granted:false}))
  assert.equal(ok(await service.rpc('admin_list_accounts',{p_actor_id:admin.id})).length,3)
 })
 await check('film reads are public while direct writes and fabricated financial records are denied',async()=>{
  const title='Synthetic fresh film '+randomUUID()
  ok(await service.from('razinflix_films').insert({title}))
  assert.equal(ok(await anon.from('razinflix_films').select('title').eq('title',title)).length,1)
  denied(await anon.from('razinflix_films').insert({title:'Forbidden'}));denied(await owner.client.from('razinflix_films').insert({title:'Forbidden'}))
  denied(await owner.client.from('referrals').insert({referrer_user_id:owner.id,referred_user_id:other.id,referral_code:'fabricated',subscription_status:'active'}))
  denied(await owner.client.from('subscriptions').insert({user_id:owner.id,status:'active',polar_sub_id:'fabricated'}))
  denied(await owner.client.rpc('process_daily_feed_aggregation',{target_user_id:owner.id}))
  denied(await anon.rpc('reserve_nsso_chat_budget',{p_request_id:randomUUID(),p_route:'guest',p_ip_hash:'a'.repeat(64),p_micros:1}))
 })
 await check('network RPC preserves private reciprocal notes and protects relationship identity',async()=>{
  const connected=ok(await owner.client.rpc('connect_my_nsso',{p_connected_user_id:other.id,p_location_name:'Synthetic place'}));assert.equal(connected.success,true);assert.ok('isNewConnection'in connected);assert.ok('scannedUser'in connected)
  ok(await other.client.from('my_nsso').update({notes:'Private synthetic note'}).eq('user_id',other.id))
  ok(await owner.client.rpc('connect_my_nsso',{p_connected_user_id:other.id,p_location_name:'Different place'}))
  assert.equal(ok(await other.client.from('my_nsso').select('notes').eq('user_id',other.id).single()).notes,'Private synthetic note')
  assert.equal(ok(await owner.client.from('my_nsso').select('id').eq('user_id',other.id)).length,0)
  denied(await owner.client.from('my_nsso').update({connected_user_id:admin.id}).eq('user_id',owner.id))
 })
 await check('Storage cutover denies direct writes while validated replacement assets and legacy owner deletion work',async()=>{
  const jpeg=await sharp({create:{width:2,height:2,channels:3,background:'#224466'}}).jpeg().toBuffer(),key=randomUUID()+'.jpg'
  const anonymousUpload=await anon.storage.from('avatars').upload(owner.id+'/'+key,jpeg,{contentType:'image/jpeg'})
  if(unsafe&&!anonymousUpload.error)throw Error('NSSO_NEGATIVE_CONTROL: anonymous avatar upload bypassed ownership RLS')
  denied(anonymousUpload)
  denied(await other.client.storage.from('avatars').upload(owner.id+'/'+key,jpeg,{contentType:'image/jpeg'}))
  denied(await owner.client.storage.from('avatars').upload(owner.id+'/bad.svg',Buffer.from('<svg/>'),{contentType:'image/svg+xml'}))
  denied(await owner.client.storage.from('avatars').upload(owner.id+'/huge.jpg',Buffer.alloc(5242881),{contentType:'image/jpeg'}))
  denied(await owner.client.storage.from('avatars').upload(owner.id+'/'+key,jpeg,{contentType:'image/jpeg'}))
  // Create a narrowly scoped pre-cutover legacy fixture through the real API.
  // The policy exists only for this one synthetic path and is removed before
  // every final-cutover authorization assertion; no catalog ownership edits.
  const owned=owner.id+'/legacy-'+randomUUID()+'.jpg'
  sql(`CREATE POLICY nsso_ci_legacy_fixture ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='avatars' AND name=${literal(owned)} AND (SELECT auth.uid())=${literal(owner.id)}::uuid)`)
  try{ok(await owner.client.storage.from('avatars').upload(owned,jpeg,{contentType:'image/jpeg'}))}finally{sql('DROP POLICY nsso_ci_legacy_fixture ON storage.objects')}
  denied(await owner.client.storage.from('avatars').update(owned,jpeg,{contentType:'image/jpeg'}))
  denied(await other.client.storage.from('avatars').update(owned,jpeg,{contentType:'image/jpeg'}))
  assert.equal(ok(await other.client.storage.from('avatars').remove([owned])).length,0)
  const bytes=ok(await anon.storage.from('avatars').download(owned));assert.equal(createHash('sha256').update(Buffer.from(await bytes.arrayBuffer())).digest('hex'),createHash('sha256').update(jpeg).digest('hex'))
  const path=owner.id+'/avatar/'+randomUUID()+'.jpg';ok(await service.storage.from('avatars').upload(path,jpeg,{contentType:'image/jpeg',upsert:false}))
  const args={p_actor_id:owner.id,p_bucket_id:'avatars',p_object_name:path,p_content_type:'image/jpeg',p_bytes:jpeg.length}
  denied(await owner.client.rpc('register_profile_media',args));denied(await anon.rpc('register_profile_media',args))
  const registered=ok(await service.rpc('register_profile_media',args));assert.equal(registered.objectName,path)
  assert.deepEqual(ok(await service.rpc('register_profile_media',args)),registered)
  denied(await service.rpc('register_profile_media',{...args,p_actor_id:other.id}))
  denied(await service.rpc('register_profile_media',{...args,p_bytes:jpeg.length+1}))
  const replacement=owner.id+'/avatar/'+randomUUID()+'.jpg'
  ok(await service.storage.from('avatars').upload(replacement,jpeg,{contentType:'image/jpeg',upsert:false}))
  const replacementAsset=ok(await service.rpc('register_profile_media',{...args,p_object_name:replacement}));assert.notEqual(replacementAsset.assetId,registered.assetId)
  const snapshot=ok(await owner.client.rpc('get_profile_snapshot'))
  const replacementUrl=service.storage.from('avatars').getPublicUrl(replacement).data.publicUrl
  const saved=ok(await owner.client.rpc('apply_profile_operation',{p_operation:{version:1,operationId:randomUUID(),expectedRevision:snapshot.revision,changes:[{kind:'profile.patch',patch:{profile_pic_url:replacementUrl}}]}}));assert.equal(saved.status,'applied')
  assert.equal(ok(await anon.from('profiles').select('profile_pic_url').eq('user_id',owner.id).single()).profile_pic_url,replacementUrl)
  ok(await anon.storage.from('avatars').download(path))
  assert.equal(ok(await owner.client.storage.from('avatars').remove([owned])).length,1)
 })
 await check('public product cards and published DTOs exclude private payment/source fields',async()=>{
  const config={version:1,kind:'payment-form',action:'https://www.paypal.com/ncp/payment/ABC123',fields:[],label:'Pay with PayPal'}
  const product=ok(await service.from('products').insert({user_id:owner.id,name:'Synthetic public product',paypal_html:'<form/>',payment_config:config,sales_page_published:true,headline:'Public body'}).select('id').single())
  const publicPage=ok(await anon.rpc('get_product_details',{p_product_id:product.id}));assert.equal(publicPage.headline,'Public body');assert.equal(Object.hasOwn(publicPage,'paypal_html'),false)
  denied(await anon.from('products').select('paypal_html'));denied(await owner.client.from('products').update({payment_config:null}).eq('id',product.id))
  assert.ok(ok(await owner.client.rpc('get_own_products')).some(row=>row.id===product.id&&row.paypal_html==='<form/>'))
  ok(await service.from('products').update({sales_page_published:false}).eq('id',product.id));assert.equal(ok(await anon.rpc('get_product_details',{p_product_id:product.id})),null)
  denied(await owner.client.from('profiles').update({headline:'Bypass journal'}).eq('user_id',owner.id))
  denied(await owner.client.from('links').insert({user_id:owner.id,link_name:'Bypass',link_url:''}))
 })
 await check('final health detects column grants, disabled profile RLS and Storage write-policy drift',async()=>{
  const healthy=()=>service.rpc('nsso_security_health').then(ok)
  assert.deepEqual(await healthy(),{healthy:true})
  try{sql('GRANT UPDATE(headline) ON public.profiles TO authenticated');assert.deepEqual(await healthy(),{healthy:false})}finally{sql('REVOKE UPDATE(headline) ON public.profiles FROM authenticated')}
  try{sql('ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY');assert.deepEqual(await healthy(),{healthy:false})}finally{sql('ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY')}
  try{sql("CREATE POLICY nsso_ci_health_drift ON storage.objects FOR UPDATE TO authenticated USING(false) WITH CHECK(false)");assert.deepEqual(await healthy(),{healthy:false})}finally{sql('DROP POLICY nsso_ci_health_drift ON storage.objects')}
  assert.deepEqual(await healthy(),{healthy:true})
 })
 await check('fresh bootstrap refuses existing data instead of resetting it',async()=>{
  const result=spawnSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:readFileSync(resolve(repo,'supabase/bootstrap/schema.sql')),encoding:'utf8'});assert.notEqual(result.status,0);assert.match(result.stderr,/requires empty application schemas/)
  assert.equal(sql('SELECT count(*) FROM auth.users'),'3')
 })
 const dump=resolve(evidence,'fresh-synthetic.dump')
 writeFileSync(dump,execFileSync('docker',['exec',container,'pg_dump','-U','supabase_admin','-d','postgres','--format=custom'],{maxBuffer:64*1024*1024}),{mode:0o600})
 const journal=spawnSync(process.execPath,[resolve(repo,'scripts/security/rehearse-profile-journal.mjs'),resolve(statusFile),dump,resolve(evidence,'journal')],{env:{...process.env,NSSO_JOURNAL_REQUIRE_GATEWAY:'1'},encoding:'utf8',maxBuffer:8*1024*1024})
 writeFileSync(resolve(evidence,'journal.log'),(journal.stdout||'')+(journal.stderr||''),{mode:0o600});assert.equal(journal.status,0,'Fresh journal HTTP proof failed; inspect private journal.log')
 checks.push('fresh schema passes the complete journal, retrieval, rate-limit and health HTTP suite')
 writeFileSync(resolve(evidence,'fresh-checks.json'),JSON.stringify({checks},null,2),{mode:0o600})
 console.log('Completed '+checks.length+' fresh-project integration checks.')
}finally{if(unsafe)sql('DROP POLICY IF EXISTS nsso_ci_deliberately_unsafe ON storage.objects')}
