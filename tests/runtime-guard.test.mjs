import test,{beforeEach,after} from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const source=new URL('../src/',import.meta.url),previous={...process.env}
const hooks=registerHooks({resolve(specifier,context,next){
 if(specifier==='server-only')return{url:'data:text/javascript,export{}',shortCircuit:true}
 if(specifier==='@/lib/server/permissions')return{url:'data:text/javascript,'+encodeURIComponent(`export function assertSameOrigin(request){if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw {status:403}};export function createPrivilegedClient(context){return {rpc:async(name,args)=>{globalThis.__limitCalls.push({name,args,context});return globalThis.__limitResult}}}`),shortCircuit:true}
 if(specifier.startsWith('@/'))return next(new URL(specifier.slice(2)+'.ts',source).href,context)
 if(specifier.startsWith('.')&&context.parentURL?.startsWith(source.href)){const url=new URL(specifier+'.ts',context.parentURL);if(existsSync(fileURLToPath(url)))return next(url.href,context)}
 return next(specifier,context)
}})
const{guardRuntimeRequest,runtimeScope}=await import('../src/lib/server/runtime-guard.ts');hooks.deregister()
beforeEach(()=>{Object.assign(process.env,{NSSO_CHAT_IP_HASH_SECRET:'synthetic-local-hash-secret-at-least32',VERCEL:'1'});globalThis.__limitCalls=[];globalThis.__limitResult={data:{allowed:true},error:null}})
after(()=>{process.env=previous})
const request=(path='/api/places/photo',method='GET',extra={})=>new Request('https://nsso.test'+path,{method,headers:{'x-vercel-forwarded-for':'192.0.2.20',...extra}})
test('only selected expensive or mutation paths consume distributed counters',async()=>{
 assert.equal(runtimeScope('/ramin','GET'),null);assert.equal(runtimeScope('/api/me','GET'),null);assert.equal(runtimeScope('/api/profile/media','POST'),'upload')
 assert.equal(await guardRuntimeRequest(request()),null)
 assert.equal(globalThis.__limitCalls.length,1);assert.match(globalThis.__limitCalls[0].args.p_subject_hash,/^[a-f0-9]{64}$/)
 assert.equal(JSON.stringify(globalThis.__limitCalls).includes('192.0.2.20'),false)
})
test('cross-origin and oversized requests are refused before quota or provider work',async()=>{
 assert.equal((await guardRuntimeRequest(request('/api/profile/operations','POST',{origin:'https://outside.test'}))).status,403)
 assert.equal((await guardRuntimeRequest(request('/api/profile/operations','POST',{'content-length':'9999999'}))).status,413)
 assert.equal(globalThis.__limitCalls.length,0)
})
test('public trailer probes share the bounded film-media quota before contacting YouTube', async () => {
 assert.equal(runtimeScope('/api/razinflix/trailer/Be7_u8jzHzU','GET'),'film_media')
 assert.equal(await guardRuntimeRequest(request('/api/razinflix/trailer/Be7_u8jzHzU')),null)
 assert.equal(globalThis.__limitCalls[0].args.p_scope,'film_media')
 globalThis.__limitResult={data:{allowed:false},error:null}
 assert.equal((await guardRuntimeRequest(request('/api/razinflix/trailer/Be7_u8jzHzU'))).status,429)
})
test('quota denial and unavailable accounting fail closed with private helpful responses',async()=>{
 globalThis.__limitResult={data:{allowed:false},error:null};let response=await guardRuntimeRequest(request());assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'60')
 globalThis.__limitResult={data:null,error:{message:'private-fixture-error'}};response=await guardRuntimeRequest(request());assert.equal(response.status,503);assert.equal((await response.text()).includes('private-fixture'),false);assert.equal(response.headers.get('cache-control'),'private, no-store')
 delete process.env.NSSO_CHAT_IP_HASH_SECRET;assert.equal((await guardRuntimeRequest(request())).status,503)
})
test('limiter dependency error and malformed result correlate503 diagnostics without leaking details or retrying',async t=>{
 const logs=[];t.mock.method(console,'warn',(...args)=>logs.push(args))
 for(const result of [{data:null,error:{message:'PRIVATE_DEPENDENCY_BODY'},status:503},{data:{allowed:'PRIVATE_DEPENDENCY_BODY'},error:null,status:200}]){
  globalThis.__limitCalls=[];globalThis.__limitResult=result;logs.length=0
  const response=await guardRuntimeRequest(request('/api/profile/operations','POST'))
  assert.equal(response.status,503);assert.equal(globalThis.__limitCalls.length,1)
  const id=response.headers.get('x-request-id')
  assert.equal(globalThis.__limitCalls[0].context.requestId,id)
  const details=logs.find(([,item])=>item.code==='privileged_dependency_failed')?.[1]
  assert.equal(details.requestId,id);assert.equal(details.operation,'runtime_limiter')
  assert.equal(details.failure,result.error?'rpc_error':'malformed_result')
  assert.equal(details.upstreamStatus,result.status)
  assert.equal(JSON.stringify(logs).includes('PRIVATE_DEPENDENCY_BODY'),false)
  assert.equal((await response.text()).includes('PRIVATE_DEPENDENCY_BODY'),false)
 }
})
