/** Synthetic-only supported Auth deletion + profile concurrency regression.
 * The caller supplies a dedicated local security stack. No production URL,
 * catalog owner mutation, FK weakening or trigger-disable fallback is accepted.
 */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import sharp from 'sharp'

export async function verifyAuthCascades({config,container,sql}) {
 const url=new URL(config.API_URL)
 assert.ok(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))
 assert.match(container,/^supabase_db_nsso-security-[a-z0-9-]+$/)
 const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
 const options=token=>({auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:'Bearer '+token}}}:{})})
 const service=createClient(config.API_URL,config.SERVICE_ROLE_KEY,options())
 const ok=result=>{assert.equal(result.error,null,result.error?.message);return result.data}
 const actors=[],objects=[];let failure;const checks=[]
 const op=(revision,changes)=>({version:1,operationId:randomUUID(),expectedRevision:revision,changes})
 async function actor(){
  const email='cascade-'+randomUUID()+'@nsso-auth-cascade.invalid',password='Local-Synthetic-Only-471!'
  const user=ok(await service.auth.admin.createUser({email,password,email_confirm:true})).user
  const auth=createClient(config.API_URL,config.ANON_KEY,options()),login=ok(await auth.auth.signInWithPassword({email,password}))
  const value={id:user.id,client:createClient(config.API_URL,config.ANON_KEY,options(login.session.access_token)),deleted:false};actors.push(value);return value
 }
 function absent(id){
  const owned=['account_settings','app_permissions','profile_revisions','profile_operations','media_assets'].map(t=>`(SELECT count(*) FROM private.${t} WHERE user_id=${literal(id)})`)
  const publicRows=['profiles','links','contacts','experiences','qualifications','projects','products'].map(t=>`(SELECT count(*) FROM public.${t} WHERE user_id=${literal(id)})`)
  assert.equal(sql(`SELECT (SELECT count(*) FROM auth.users WHERE id=${literal(id)})+(SELECT count(*) FROM public.users WHERE id=${literal(id)})+${[...owned,...publicRows].join('+')}`),'0')
 }
 async function remove(value){ok(await service.auth.admin.deleteUser(value.id));value.deleted=true;absent(value.id)}
 try{
  const a=await actor(),snapshot=ok(await a.client.rpc('get_profile_snapshot'))
  const created=ok(await a.client.rpc('apply_profile_operation',{p_operation:op(snapshot.revision,[
   {kind:'profile.patch',patch:{full_name:'Synthetic deletion fixture'}},
   {kind:'link.add',values:{link_name:'Synthetic link',link_url:'https://example.test'}},
   {kind:'contact.add',values:{method:'Email',value:'synthetic@example.invalid'}},
   {kind:'experience.add',values:{company_name:'Synthetic company',job_title:'Synthetic role'}},
   {kind:'qualification.add',values:{institution:'Synthetic school',qualification_name:'Synthetic award'}},
   {kind:'project.add',values:{project_name:'Synthetic project',contribution:'Synthetic'}},
   {kind:'product.add',values:{name:'Synthetic product'}}
  ])}));assert.equal(created.status,'applied')
  const link=created.changes.find(x=>x.entity==='links')
  const removed=ok(await a.client.rpc('apply_profile_operation',{p_operation:op(created.revision,[{kind:'link.remove',id:link.id}])}));assert.equal(removed.status,'applied')
  const undone=ok(await a.client.rpc('undo_profile_operation',{p_operation_id:randomUUID(),p_original_operation_id:removed.operationId,p_expected_revision:removed.revision}));assert.equal(undone.status,'applied')
  assert.ok(ok(await a.client.rpc('get_profile_snapshot')).links.some(x=>x.id===link.id))
  const jpeg=await sharp({create:{width:2,height:2,channels:3,background:'#334455'}}).jpeg().toBuffer(),name=a.id+'/avatar/'+randomUUID()+'.jpg'
  ok(await service.storage.from('avatars').upload(name,jpeg,{contentType:'image/jpeg',upsert:false}));objects.push(name)
  ok(await service.rpc('register_profile_media',{p_actor_id:a.id,p_bucket_id:'avatars',p_object_name:name,p_content_type:'image/jpeg',p_bytes:jpeg.length}))
  sql(`INSERT INTO private.app_permissions(user_id,permission) VALUES(${literal(a.id)},'razinflix:manage')`)
  assert.equal(sql(`SELECT count(*) FROM private.media_assets WHERE user_id=${literal(a.id)}`),'1')
  assert.ok(Number(sql(`SELECT count(*) FROM private.profile_operations WHERE user_id=${literal(a.id)}`))>=3)
  await remove(a);checks.push('supported Auth deletion cascades all public/private journal/media rows while normal remove and Undo remain durable')

  const b=await actor(),before=ok(await b.client.rpc('get_profile_snapshot')),operation=op(before.revision,[{kind:'link.add',values:{link_name:'Concurrent committed link',link_url:''}}])
  const child=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'])
  let output='',errors='',timer
  const barrier=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Operation parent-lock barrier timed out')),5000);child.stdout.on('data',data=>{output+=data;if(output.includes('parent-lock-held')){clearTimeout(timer);resolve()}});child.on('error',reject)})
  const completed=new Promise((resolve,reject)=>{child.stderr.on('data',data=>{errors+=data});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(errors)))})
  child.stdin.end(`BEGIN; SET LOCAL statement_timeout='4s'; SET LOCAL request.jwt.claim.sub=${literal(b.id)}; SELECT private.profile_lock(${literal(b.id)}); SELECT 'parent-lock-held'; SELECT pg_sleep(0.5); SELECT public.apply_profile_operation(${literal(JSON.stringify(operation))}::jsonb); COMMIT;`)
  try{await barrier;await Promise.all([completed,remove(b)]);assert.match(output,/"status": "applied"/)}finally{clearTimeout(timer);child.kill()}
  absent(b.id);checks.push('operation-first Auth KEY SHARE then719/730 permits committed operation and supported concurrent Auth deletion without deadlock')

  const c=await actor(),prior=ok(await c.client.rpc('get_profile_snapshot'))
  // Test-only trigger forces Auth DELETE to own its row first. It is never
  // shipped and does not bypass any final policy, FK or journal trigger.
  sql(`CREATE FUNCTION private.nsso_ci_delete_pause() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN PERFORM pg_catalog.pg_advisory_xact_lock(733,734); PERFORM pg_catalog.pg_sleep(0.8); RETURN OLD; END $$; CREATE TRIGGER aa_nsso_ci_delete_pause BEFORE DELETE ON auth.users FOR EACH ROW WHEN (OLD.id=${literal(c.id)}::uuid) EXECUTE FUNCTION private.nsso_ci_delete_pause()`)
  let deletion
  try{
   deletion=remove(c);deletion.catch(()=>{})
   let locked=false
   for(let i=0;i<50;i++){locked=sql("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=733 AND objid=734 AND objsubid=2 AND granted)")==='t';if(locked)break;await new Promise(r=>setTimeout(r,30))}
   assert.ok(locked,'Delete-first row-lock barrier not reached')
   const attempted=await c.client.rpc('apply_profile_operation',{p_operation:op(prior.revision,[{kind:'profile.patch',patch:{bio:'Must not resurrect deleted owner'}}])})
   await deletion;assert.equal(attempted.error?.code,'42501');absent(c.id)
  }finally{try{await deletion}finally{sql('DROP TRIGGER aa_nsso_ci_delete_pause ON auth.users; DROP FUNCTION private.nsso_ci_delete_pause()')}}
  checks.push('delete-first supported Auth API rejects waiting stale operation without orphan resurrection, deadlock or FK recreation')
 }catch(error){failure=error}
 const cleanup=[]
 for(const name of objects){const result=await service.storage.from('avatars').remove([name]);if(result.error)cleanup.push(result.error)}
 for(const value of actors)if(!value.deleted){try{await remove(value)}catch(error){cleanup.push(error)}}
 if(failure||cleanup.length)throw new AggregateError([...(failure?[failure]:[]),...cleanup],'Synthetic Auth cascade proof failed; cleanup failures are never ignored')
 return checks
}
