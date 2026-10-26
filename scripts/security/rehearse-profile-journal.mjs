/** Local-only journal integration proof. Never resets the primary Supabase stack.
 * NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL=1 node scripts/security/rehearse-profile-journal.mjs STATUS_JSON SYNTHETIC_DUMP EVIDENCE_DIR
 */
import assert from 'node:assert/strict'
import { readFileSync,writeFileSync,mkdirSync,readdirSync } from 'node:fs'
import { resolve,dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync,spawnSync,spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
if(process.env.NSSO_ALLOW_LOCAL_SECURITY_REHEARSAL!=='1') throw Error('Explicit local rehearsal opt-in required')
const [statusFile,dumpFile,evidenceArg]=process.argv.slice(2)
if(!statusFile||!dumpFile||!evidenceArg) throw Error('Expected STATUS_JSON SYNTHETIC_DUMP EVIDENCE_DIR')
const config=JSON.parse(readFileSync(statusFile,'utf8')),api=new URL(config.API_URL),dbUrl=new URL(config.DB_URL)
if(api.protocol!=='http:'||!['127.0.0.1','localhost'].includes(api.hostname)||!['127.0.0.1','localhost'].includes(dbUrl.hostname)) throw Error('Local Supabase only')
const repo=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),evidence=resolve(evidenceArg)
if(evidence.startsWith(repo+'/')) throw Error('Evidence must stay outside public repository')
mkdirSync(evidence,{recursive:true,mode:0o700})
const container=process.env.NSSO_LOCAL_REHEARSAL_CONTAINER||'supabase_db_nsso-security-rehearsal-20261026',database='nsso_journal_rehearsal',restName='nsso-security-journal-rest'
if(!/^supabase_db_nsso-security-[a-z0-9-]+$/.test(container))throw Error('Dedicated local security container required')
const gateway=process.env.NSSO_JOURNAL_REQUIRE_GATEWAY==='1'
const sql=query=>execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8',maxBuffer:8*1024*1024}).trim()
const adminSql=query=>execFileSync('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{input:query,encoding:'utf8'}).trim()
const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
const results=[]
async function check(name,fn){await fn();results.push(name);console.log('PASS '+name);writeFileSync(resolve(evidence,'checks.json'),JSON.stringify({checks:results},null,2),{mode:0o600})}
spawnSync('docker',['rm','-f',restName],{encoding:'utf8'})
adminSql('DROP DATABASE IF EXISTS nsso_journal_rehearsal; CREATE DATABASE nsso_journal_rehearsal TEMPLATE template0;')
const restored=spawnSync('docker',['exec','-i',container,'pg_restore','-U','supabase_admin','-d',database,'--exit-on-error'],{input:readFileSync(dumpFile),encoding:'utf8',maxBuffer:8*1024*1024})
writeFileSync(resolve(evidence,'clone.log'),restored.stderr||'',{mode:0o600});assert.equal(restored.status,0)
function migration(suffix){const files=readdirSync(resolve(repo,'supabase/migrations')).filter(x=>x.endsWith('_'+suffix+'.sql'));assert.equal(files.length,1);sql(readFileSync(resolve(repo,'supabase/migrations',files[0]),'utf8'))}
if(sql("SELECT to_regprocedure('public.apply_profile_operation(jsonb)') IS NOT NULL")!=='t')migration('profile_operation_journal')
const runtimeFiles=readdirSync(resolve(repo,'supabase/migrations')).filter(x=>x.endsWith('_nsso_runtime_limits.sql'))
if(runtimeFiles.length===1&&sql("SELECT to_regprocedure('public.consume_nsso_request_limit(text,text)') IS NOT NULL")!=='t')sql(readFileSync(resolve(repo,'supabase/migrations',runtimeFiles[0]),'utf8'))
if(sql("SELECT to_regprocedure('public.intelligent_search(public.vector,text,public.vector,double precision,integer,text[],integer)') IS NOT NULL")==='t'&&sql("SELECT to_regprocedure('private.validate_retrieval_request(public.vector,double precision,integer,text,text[],integer,public.vector)') IS NOT NULL")!=='t')migration('nsso_retrieval_bounds')
const rest=JSON.parse(execFileSync('docker',['inspect',container.replace('supabase_db_','supabase_rest_')],{encoding:'utf8'}))[0]
const env=rest.Config.Env.map(x=>{if(!x.startsWith('PGRST_DB_URI='))return x;const uri=new URL(x.slice(13));uri.pathname='/'+database;return'PGRST_DB_URI='+uri})
assert.ok(env.every(x=>!x.includes('\n')));const envFile=resolve(evidence,'rest.env');writeFileSync(envFile,env.join('\n')+'\n',{mode:0o600})
execFileSync('docker',['run','-d','--rm','--name',restName,'--network',Object.keys(rest.NetworkSettings.Networks)[0],'-p','127.0.0.1:55833:3000','--env-file',envFile,rest.Config.Image])
const tokens={anon:config.ANON_KEY,service:config.SERVICE_ROLE_KEY},ids={}
for(const name of ['owner','other']){
 const c=createClient(config.API_URL,config.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const login=await c.auth.signInWithPassword({email:name+'@nsso-rehearsal.invalid',password:'Local-Synthetic-Only-471!'})
 assert.equal(login.error,null,login.error?.message);tokens[name]=login.data.session.access_token;ids[name]=login.data.user.id
}
async function request(path,who='owner',body,method){const response=await fetch('http://127.0.0.1:55833'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+tokens[who],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const text=await response.text();return{http:response.status,data:text?JSON.parse(text):null}}
async function rpc(name,args={},who='owner'){const r=await request('/rpc/'+name,who,args);assert.equal(r.http,200,JSON.stringify(r.data));return r.data}
const snapshot=()=>rpc('get_profile_snapshot')
const operation=(revision,changes,id=randomUUID())=>({version:1,operationId:id,expectedRevision:revision,changes})
const apply=op=>rpc('apply_profile_operation',{p_operation:op})
const undo=(original,revision,id=randomUUID())=>rpc('undo_profile_operation',{p_operation_id:id,p_original_operation_id:original,p_expected_revision:revision})
try{
 let ready=false;for(let i=0;i<40;i++){try{ready=(await fetch('http://127.0.0.1:55833/')).ok}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100))}assert.ok(ready)
 await check('anonymous callers cannot access journal, snapshot, status, or internal helpers',async()=>{
  for(const name of ['get_profile_snapshot','get_profile_operation','apply_profile_operation','undo_profile_operation']){
   const args=name==='get_profile_snapshot'?{}:name==='get_profile_operation'?{p_operation_id:randomUUID()}:name==='apply_profile_operation'?{p_operation:operation(0,[{kind:'profile.patch',patch:{headline:'Denied'}}])}:{p_operation_id:randomUUID(),p_original_operation_id:randomUUID(),p_expected_revision:0}
   assert.ok([401,403].includes((await request('/rpc/'+name,'anon',args)).http))
  }
  assert.equal(sql("SELECT bool_or(has_function_privilege('authenticated',p.oid,'EXECUTE')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname IN ('profile_write','profile_row','profile_lock','apply_profile_change')"),'f')
  assert.equal((await request('/rpc/get_product_details','anon',{p_product_id:randomUUID()})).http,200)
 })
 let first,before,firstResult
 await check('an operation commits canonical deltas and replays before the stale revision check',async()=>{
  before=await snapshot();first=operation(before.revision,[{kind:'profile.patch',patch:{headline:'Journal first headline'}},{kind:'link.add',values:{link_name:'Synthetic link',link_url:'https://example.test/first'}}])
  firstResult=await apply(first);assert.equal(firstResult.status,'applied');assert.equal(firstResult.revision,before.revision+1);assert.equal(firstResult.changes.length,2)
  assert.deepEqual(await apply(first),firstResult)
  assert.deepEqual(await apply({changes:first.changes,expectedRevision:first.expectedRevision,operationId:first.operationId,version:1}),firstResult)
  assert.deepEqual(await rpc('get_profile_operation',{p_operation_id:first.operationId}),firstResult)
  assert.equal((await snapshot()).links.filter(x=>x.link_name==='Synthetic link').length,1)
  const changed=await apply({...first,changes:[{kind:'profile.patch',patch:{headline:'Different payload'}}]});assert.equal(changed.code,'OPERATION_ID_REUSED')
  assert.deepEqual(await rpc('get_profile_operation',{p_operation_id:first.operationId}),firstResult)
 })
 await check('different tabs using one revision cannot silently overwrite each other',async()=>{
  const rev=(await snapshot()).revision
  const attempts=await Promise.all([apply(operation(rev,[{kind:'profile.patch',patch:{bio:'First concurrent biography'}}])),apply(operation(rev,[{kind:'profile.patch',patch:{bio:'Second concurrent biography'}}]))])
  assert.equal(attempts.filter(x=>x.status==='applied').length,1);assert.equal(attempts.filter(x=>x.code==='REVISION_CONFLICT').length,1)
  assert.equal((await snapshot()).revision,rev+1)
 })
 await check('account provisioning and profile operations use one consistent advisory lock order',async()=>{
  const rev=(await snapshot()).revision
  const process=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-At'])
  let stderr='',timer
  const barrier=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Account lock barrier timed out')),5000);process.stdout.on('data',data=>{if(String(data).includes('account-lock-held')){clearTimeout(timer);resolve()}});process.on('error',reject)})
  const completed=new Promise((resolve,reject)=>{process.stderr.on('data',data=>{stderr+=data});process.on('error',reject);process.on('close',code=>code===0?resolve():reject(Error(stderr)))})
  process.stdin.end(`BEGIN; SET LOCAL statement_timeout='4s'; SET LOCAL request.jwt.claim.sub=${literal(ids.owner)}; SELECT pg_advisory_xact_lock(hashtextextended(${literal(ids.owner)},719)); SELECT 'account-lock-held'; SELECT pg_sleep(0.35); SELECT private.ensure_account_for(${literal(ids.owner)}); COMMIT;`)
  try{await barrier;const result=await apply(operation(rev,[{kind:'profile.patch',patch:{bio:'Lock-order proof'}}]));assert.equal(result.status,'applied');await completed}finally{clearTimeout(timer);process.kill()}
  const current=(await snapshot()).revision
  const concurrent=await Promise.all([rpc('ensure_current_account'),apply(operation(current,[{kind:'profile.patch',patch:{bio:'Concurrent account proof'}}])),rpc('ensure_current_account')])
  assert.equal(concurrent[1].status,'applied')
 })
 await check('Undo compensates only touched state while preserving later unrelated edits and is replay-safe',async()=>{
  const current=await snapshot(),bio=current.profile.bio,undoId=randomUUID()
  const undone=await undo(first.operationId,current.revision,undoId);assert.equal(undone.status,'applied')
  const after=await snapshot();assert.equal(after.profile.headline,before.profile.headline);assert.equal(after.profile.bio,bio);assert.equal(after.links.some(x=>x.id===firstResult.changes[1].id),false)
  assert.deepEqual(await undo(first.operationId,current.revision,undoId),undone)
  assert.equal((await undo(first.operationId,after.revision)).code,'ALREADY_UNDONE')
 })
 await check('invalid batched changes roll back every write and persist a truthful rejected result',async()=>{
  const prior=await snapshot(),op=operation(prior.revision,[{kind:'link.add',values:{link_name:'Must roll back',link_url:'https://example.test/rollback'}},{kind:'profile.patch',patch:{is_premium:true}}])
  const rejected=await apply(op);assert.equal(rejected.status,'rejected');assert.equal(rejected.revision,prior.revision);assert.deepEqual(rejected.changes,[])
  const after=await snapshot();assert.equal(after.links.length,prior.links.length);assert.equal(after.revision,prior.revision)
  assert.deepEqual(await rpc('get_profile_operation',{p_operation_id:op.operationId}),rejected)
 })
 await check('DB validates exact keys, owned IDs, URLs, nested arrays, bounds and reserved payment fields',async()=>{
  const rev=(await snapshot()).revision
  const invalid=[
   {kind:'profile.patch',patch:{headline:'x'.repeat(121)}},
   {kind:'profile.patch',patch:{user_id:ids.other}},
   {kind:'link.add',values:{link_name:'Unsafe',link_url:'javascript:alert(1)'}},
   {kind:'link.add',values:{link_name:'Unsafe',link_url:'https://trusted.test\\@evil.test'}},
   {kind:'link.add',values:{link_name:'Unsafe',link_url:'https://u:p@example.test'}},
   {kind:'link.add',values:{link_name:'Unsafe',link_url:'https://example.test:99999'}},
   {kind:'experience.add',values:{company_name:'Company',job_title:'Title',start_year:4000}},
   {kind:'contact.add',values:{method:'Invalid',value:'value'}},
   {kind:'product.add',values:{name:'No raw',paypal_html:'<script/>'}},
   {kind:'product.add',values:{name:'No config',payment_config:null}},
   {kind:'product.add',values:{name:'No malformed nested data',testimonials:[{name:'Name',text:'Text',script:'bad'}]}},
   {kind:'product.add',values:{name:'Too many benefits',benefits:Array(51).fill('Benefit')}},
   {kind:'link.patch',id:randomUUID(),patch:{link_name:'Missing target'}},
   {kind:'profile.patch',patch:{headline:'Unknown outer key'},extra:true},
  ]
  for(const change of invalid){const result=await apply(operation(rev,[change]));assert.equal(result.status,'rejected',JSON.stringify(change));assert.equal(result.revision,rev)}
  const unknown=await request('/rpc/apply_profile_operation','owner',{p_operation:{...operation(rev,[{kind:'profile.patch',patch:{headline:'Outer'}}]),actorId:ids.other}});assert.equal(unknown.http,400)
  const other=await rpc('get_profile_snapshot',{},'other')
  const added=await rpc('apply_profile_operation',{p_operation:operation(other.revision,[{kind:'link.add',values:{link_name:'Other owner link',link_url:''}}])},'other')
  assert.equal((await apply(operation(rev,[{kind:'link.patch',id:added.changes[0].id,patch:{link_name:'Cross owner'}}]))).status,'rejected')
  assert.equal((await rpc('get_profile_operation',{p_operation_id:first.operationId},'other')).status,'not_found')
 })
 let untouchedTarget
 await check('manual writes share the journal revision and changed targets refuse Undo',async()=>{
  const previous=await snapshot();untouchedTarget=operation(previous.revision,[{kind:'profile.patch',patch:{headline:'Before manual edit'}}]);assert.equal((await apply(untouchedTarget)).status,'applied')
  const response=await request('/profiles?user_id=eq.'+ids.owner,'owner',{headline:'Later manual edit'},'PATCH')
  if(gateway){assert.equal(response.http,403);assert.equal((await apply(operation(previous.revision+1,[{kind:'profile.patch',patch:{headline:'Later manual edit'}}]))).status,'applied')}else assert.equal(response.http,204)
  const after=await snapshot();assert.equal(after.revision,previous.revision+2)
  const result=await undo(untouchedTarget.operationId,after.revision);assert.equal(result.code,'UNDO_TARGET_CHANGED');assert.equal((await snapshot()).profile.headline,'Later manual edit')
  if(!gateway)assert.equal(sql(`SELECT count(*)>0 FROM private.profile_operations WHERE user_id=${literal(ids.owner)} AND operation_kind='external'`),'t')
 })
 await check('a failed multi-effect Undo rolls back earlier compensation',async()=>{
  const rev=(await snapshot()).revision,op=operation(rev,[{kind:'link.add',values:{link_name:'Undo guarded add',link_url:''}},{kind:'profile.patch',patch:{full_name:'Keep this committed name'}}])
  const applied=await apply(op),id=applied.changes[0].id;assert.equal(applied.status,'applied')
  if(gateway)assert.equal((await apply(operation(applied.revision,[{kind:'link.patch',id,patch:{link_name:'Newer link edit'}}]))).status,'applied')
  else assert.equal((await request('/links?id=eq.'+id,'owner',{link_name:'Newer link edit'},'PATCH')).http,204)
  const result=await undo(op.operationId,(await snapshot()).revision);assert.equal(result.code,'UNDO_TARGET_CHANGED')
  const after=await snapshot();assert.equal(after.profile.full_name,'Keep this committed name');assert.ok(after.links.some(x=>x.id===id&&x.link_name==='Newer link edit'))
 })
 await check('all collection adds and patches return DB canonical rows with generated ownership and defaults',async()=>{
  const changes=[{kind:'contact.add',values:{method:'Email',value:'synthetic@example.test'}},{kind:'experience.add',values:{company_name:'Synthetic company',job_title:'Synthetic title',start_year:2020,end_year:null}},{kind:'qualification.add',values:{institution:'Synthetic school',qualification_name:'Synthetic degree',end_year:2021}},{kind:'project.add',values:{project_name:'Synthetic project',contribution:'Built',project_url:'https://example.test/project'}},{kind:'product.add',values:{name:'Synthetic journal product',price:'£12',benefits:['First benefit'],testimonials:[{name:'Synthetic person',text:'Synthetic review'}]}}]
  const result=await apply(operation((await snapshot()).revision,changes));assert.equal(result.status,'applied');assert.equal(result.changes.length,5)
  for(const delta of result.changes){assert.equal(delta.row.id,delta.id);assert.equal(delta.row.user_id,ids.owner);assert.ok(delta.row.created_at)}
  assert.equal(result.changes.find(x=>x.entity==='products').row.sales_page_published,false)
  const product=result.changes.find(x=>x.entity==='products');
  const paymentArgs={p_user_id:ids.owner,p_product_id:product.id,p_operation_id:randomUUID(),p_expected_revision:result.revision,p_html:'<form action="https://www.paypal.com/ncp/payment/ABC123" method="post"></form>',p_config:{version:1,kind:'payment-form',action:'https://www.paypal.com/ncp/payment/ABC123',fields:[],label:'Pay with PayPal'}}
  assert.ok([401,403].includes((await request('/rpc/save_product_payment_operation','owner',paymentArgs)).http))
  const paid=await rpc('save_product_payment_operation',paymentArgs,'service');assert.equal(paid.status,'applied');assert.equal(paid.revision,result.revision+1)
  let receipt=paid
  if(!gateway){
   const beforeReceipt=JSON.parse(sql(`SELECT to_jsonb(o) FROM private.profile_operations o WHERE user_id=${literal(ids.owner)} AND operation_id=${literal(paid.operationId)}`))
   assert.ok(JSON.stringify(beforeReceipt.effects).includes('paypal_html'))
   const beforeProduct=sql(`SELECT to_jsonb(p) FROM public.products p WHERE id=${literal(product.id)}`)
   const beforeOther=sql(`SELECT to_jsonb(o) FROM private.profile_operations o WHERE user_id=${literal(ids.owner)} AND operation_id=${literal(first.operationId)}`)
   migration('nsso_payment_receipt_minimization')
   const afterReceipt=JSON.parse(sql(`SELECT to_jsonb(o) FROM private.profile_operations o WHERE user_id=${literal(ids.owner)} AND operation_id=${literal(paid.operationId)}`))
   for(const key of ['request_hash','operation_id','status','revision','expected_revision','created_at'])assert.equal(afterReceipt[key],beforeReceipt[key])
   assert.deepEqual(afterReceipt.effects,[]);assert.deepEqual(afterReceipt.result,{...paid,changes:[]})
   assert.equal(sql(`SELECT to_jsonb(p) FROM public.products p WHERE id=${literal(product.id)}`),beforeProduct)
   assert.equal(sql(`SELECT to_jsonb(o) FROM private.profile_operations o WHERE user_id=${literal(ids.owner)} AND operation_id=${literal(first.operationId)}`),beforeOther)
   receipt=afterReceipt.result
  }
  assert.deepEqual(receipt.changes,[])
  assert.deepEqual(await rpc('save_product_payment_operation',paymentArgs,'service'),receipt)
  assert.deepEqual(await rpc('get_profile_operation',{p_operation_id:paid.operationId}),receipt)
  assert.equal(/paypal_html|payment_config|ABC123/.test(JSON.stringify(receipt)),false)
  assert.equal(sql(`SELECT effects='[]'::jsonb FROM private.profile_operations WHERE user_id=${literal(ids.owner)} AND operation_id=${literal(paid.operationId)}`),'t')
  assert.equal((await undo(paid.operationId,paid.revision)).code,'NOT_UNDOABLE')
  assert.equal((await undo(result.operationId,paid.revision)).code,'UNDO_TARGET_CHANGED')
 })
 await check('reorders require an exact unique owner set and persist atomically',async()=>{
  const prior=await snapshot();let idsInOrder=prior.links.map(x=>x.id).reverse()
  const applied=await apply(operation(prior.revision,[{kind:'collection.reorder',collection:'links',order:idsInOrder}]));assert.equal(applied.status,'applied')
  assert.deepEqual((await snapshot()).links.map(x=>x.id),idsInOrder)
  for(const order of [[],[...idsInOrder,idsInOrder[0]],[randomUUID(),...idsInOrder.slice(1)]])assert.equal((await apply(operation(applied.revision,[{kind:'collection.reorder',collection:'links',order}]))).status,'rejected')
  assert.equal((await undo(applied.operationId,applied.revision)).status,'applied')
  assert.deepEqual((await snapshot()).links.map(x=>x.id),prior.links.map(x=>x.id))
 })
 await check('all existing contact methods and merged partial year validation remain compatible',async()=>{
  const methods=['Email','Phone','WhatsApp','Telegram','Signal','WeChat','Line','Discord','X','Instagram','LinkedIn','YouTube','TikTok','Twitch','Facebook','Snapchat','Pinterest','Reddit','GitHub','GitLab','Medium','Substack','Patreon','Ko-fi','Buy Me a Coffee','PayPal','Cash App','Venmo','Zelle','Location','Other']
  for(let i=0;i<methods.length;i+=20){const added=await apply(operation((await snapshot()).revision,methods.slice(i,i+20).map(method=>({kind:'contact.add',values:{method,value:''}}))));assert.equal(added.status,'applied')}
  const added=await apply(operation((await snapshot()).revision,[{kind:'experience.add',values:{company_name:'Date validation',job_title:'Test',start_year:2020,end_year:2021}}]));assert.equal(added.status,'applied')
  const id=added.changes[0].id
  const invalid=await apply(operation(added.revision,[{kind:'experience.patch',id,patch:{start_year:2022}}]));assert.equal(invalid.status,'rejected')
  const after=await snapshot();assert.equal(after.experiences.find(x=>x.id===id).start_year,2020)
  assert.equal((await apply(operation(after.revision,[{kind:'experience.patch',id,patch:{end_year:2023}}]))).status,'applied')
 })
 await check('remove and Undo restore persisted identity and content without whole-profile overwrite',async()=>{
  const prior=await snapshot(),link=prior.links[0]
  const removed=await apply(operation(prior.revision,[{kind:'link.remove',id:link.id}]));assert.equal(removed.status,'applied');assert.equal(removed.changes[0].row,null)
  const unrelated=await apply(operation(removed.revision,[{kind:'profile.patch',patch:{bio:'Preserve this newer biography'}}]));assert.equal(unrelated.status,'applied')
  assert.equal((await undo(removed.operationId,unrelated.revision)).status,'applied')
  const after=await snapshot();assert.deepEqual(after.links.find(x=>x.id===link.id),link);assert.equal(after.profile.bio,'Preserve this newer biography')
 })
 await check('new operation quotas bound direct RPC writes while committed retries remain recoverable',async()=>{
  const current=await snapshot(),count=sql(`SELECT count(*) FROM private.profile_operations WHERE user_id=${literal(ids.owner)}`)
  const fixture=(n,age)=>sql(`INSERT INTO private.profile_operations(user_id,operation_id,request_hash,operation_kind,status,revision,effects,result,created_at) SELECT ${literal(ids.owner)},gen_random_uuid(),'quota-fixture','apply','rejected',${current.revision},'[]','{}',now()-interval '${age}' FROM generate_series(1,${n})`)
  const deniedOp=operation(current.revision,[{kind:'profile.patch',patch:{headline:'Must be rate limited'}}])
  fixture(240,'0 seconds')
  assert.equal((await apply(deniedOp)).code,'RATE_LIMITED')
  assert.equal((await undo(first.operationId,current.revision)).code,'RATE_LIMITED')
  assert.deepEqual(await apply(first),firstResult)
  assert.equal((await rpc('get_profile_operation',{p_operation_id:deniedOp.operationId})).status,'not_found')
  assert.equal(Number(sql(`SELECT count(*) FROM private.profile_operations WHERE user_id=${literal(ids.owner)}`)),Number(count)+240)
  sql("DELETE FROM private.profile_operations WHERE request_hash='quota-fixture'")
  fixture(6000,'2 hours')
  assert.equal((await apply(deniedOp)).code,'RATE_LIMITED')
  sql("DELETE FROM private.profile_operations WHERE request_hash='quota-fixture'")
  assert.equal((await snapshot()).revision,current.revision)
 })
 await check('retrieval uses bounded server-only queries and fixed search paths with synthetic vectors',async()=>{
  const vector='['+[1,...Array(767).fill(0)].join(',')+']'
  sql(`INSERT INTO public.agent_knowledge(content,metadata,embedding) VALUES('Synthetic retrieval proof','{"source":"synthetic-only"}',${literal(vector)}::public.vector)`)
  const args={query_embedding:vector,query_text:'synthetic retrieval',match_threshold:0.5,match_count:2,filter_files:['synthetic-only']}
  for(const who of ['anon','owner'])assert.ok([401,403].includes((await request('/rpc/intelligent_search',who,args)).http))
  for(const name of ['intelligent_search','hybrid_search']){const found=await rpc(name,args,'service');assert.equal(found.length,1);assert.equal(found[0].content,'Synthetic retrieval proof')}
  assert.equal((await rpc('match_documents',{query_embedding:vector,match_threshold:0.5,match_count:2,filter_files:['synthetic-only']},'service')).length,1)
  assert.ok((await rpc('match_documents',{query_embedding:vector,match_threshold:0.5,match_count:2},'service')).some(row=>row.content==='Synthetic retrieval proof'))
  for(const changed of [{match_count:21},{match_count:0},{query_embedding:'[1,0]'},{query_text:'x'.repeat(4097)},{candidate_count:101},{candidate_count:1,match_count:2},{match_threshold:2},{filter_files:Array(51).fill('synthetic-only')}])assert.equal((await request('/rpc/intelligent_search','service',{...args,...changed})).http,400)
  assert.equal(sql("SELECT bool_and(p.proconfig IS NOT NULL AND array_to_string(p.proconfig,',') LIKE '%search_path=%') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('intelligent_search','hybrid_search','match_documents','update_content_tsvector')"),'t')
 })
 if(runtimeFiles.length===1)await check('runtime quotas are service-only and concurrency cannot exceed subject/shared limits',async()=>{
  assert.ok([401,403].includes((await request('/rpc/consume_nsso_request_limit','anon',{p_scope:'film_write',p_subject_hash:'a'.repeat(64)})).http))
  assert.ok([401,403].includes((await request('/rpc/consume_nsso_request_limit','owner',{p_scope:'film_write',p_subject_hash:'a'.repeat(64)})).http))
  const remaining=60000-Date.now()%60000;if(remaining<5000)await new Promise(resolve=>setTimeout(resolve,remaining+100))
  const same=await Promise.all(Array.from({length:25},()=>rpc('consume_nsso_request_limit',{p_scope:'film_write',p_subject_hash:'a'.repeat(64)},'service')))
  assert.equal(same.filter(x=>x.allowed).length,12)
  const shared=await Promise.all(Array.from({length:30},(_,i)=>rpc('consume_nsso_request_limit',{p_scope:'film_write',p_subject_hash:(i+100).toString(16).padStart(64,'0')},'service')))
  assert.equal(shared.filter(x=>x.allowed).length,18)
  assert.equal(sql("SELECT requests FROM private.request_limits WHERE scope='film_write/minute' AND subject_hash='site' AND window_start=date_trunc('minute',now())"),'30')
  sql("INSERT INTO private.request_limits VALUES('lookup/day','"+'f'.repeat(64)+"',date_trunc('day',now()),1000)")
  assert.equal((await rpc('consume_nsso_request_limit',{p_scope:'lookup',p_subject_hash:'f'.repeat(64)},'service')).allowed,false)
  assert.equal(sql("SELECT count(*) FROM private.request_limits WHERE scope='lookup/minute'"),'0')
  assert.equal((await request('/rpc/consume_nsso_request_limit','service',{p_scope:'unknown',p_subject_hash:'a'.repeat(64)})).http,400)
  assert.equal((await request('/rpc/consume_nsso_request_limit','service',{p_scope:'chat',p_subject_hash:'raw-ip-not-a-hash'})).http,400)
  assert.equal(sql("SELECT count(*)>0 FROM private.runtime_signals WHERE code='rate_denied'"),'t')
 })
 if(runtimeFiles.length===1)await check('security health is service-only and detects a weakened local privacy grant',async()=>{
  for(const who of ['anon','owner'])assert.ok([401,403].includes((await request('/rpc/nsso_security_health',who,{})).http))
  assert.deepEqual(await rpc('nsso_security_health',{},'service'),{healthy:true})
  try{sql('GRANT UPDATE ON public.users TO anon');assert.deepEqual(await rpc('nsso_security_health',{},'service'),{healthy:false})}finally{sql('REVOKE UPDATE ON public.users FROM anon')}
  assert.deepEqual(await rpc('nsso_security_health',{},'service'),{healthy:true})
  const limits=await Promise.all(Array.from({length:15},()=>rpc('consume_nsso_request_limit',{p_scope:'upload_actor',p_subject_hash:'b'.repeat(64)},'service')))
  assert.equal(limits.filter(x=>x.allowed).length,12)
 })
 console.log(`Completed ${results.length} local profile journal checks.`)
}finally{execFileSync('docker',['stop',restName],{encoding:'utf8'})}
