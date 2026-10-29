import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const source = new URL('../src/',import.meta.url);
const hooks = registerHooks({resolve(specifier,context,next){
    if(specifier==='@/lib/server/runtime-route')return{url:'data:text/javascript,export const withRuntimeGuard = handler => handler;',shortCircuit:true};
    if(specifier==='server-only')return{url:'data:text/javascript,export {};',shortCircuit:true};
    if(specifier==='next/server')return next('next/server.js',context);
    if(specifier==='@/lib/supabase/server')return{url:`data:text/javascript,${encodeURIComponent('export const createClient=async()=>globalThis.__profileSession;')}`,shortCircuit:true};
    if(specifier.startsWith('@/'))return next(new URL(`${specifier.slice(2)}.ts`,source).href,context);
    if(specifier.startsWith('.')&&context.parentURL?.startsWith(source.href)){const url=new URL(`${specifier}.ts`,context.parentURL);if(existsSync(fileURLToPath(url)))return next(url.href,context);}
    return next(specifier,context);
}});
const {isProfileChange,isProfileOperation,normalizeProfileChange}=await import('../src/lib/profile-mutations.ts');
const {normalizeToolCall,parseActionList}=await import('../src/lib/deity/actionParser.ts');
const {ProfileMutationClient}=await import('../src/lib/profile-mutation-client.ts');
const operations=await import('../src/app/api/profile/operations/route.ts');
const {POST:undo}=await import('../src/app/api/profile/operations/undo/route.ts');
hooks.deregister();
const actor='11111111-1111-4111-8111-111111111111',id='22222222-2222-4222-8222-222222222222';
const patch={kind:'profile.patch',patch:{bio:'A reviewed bio'}};
const operation=(changes=[patch])=>({version:1,operationId:crypto.randomUUID(),expectedRevision:0,changes});
const applied=body=>({status:'applied',operationId:body.operationId,revision:body.expectedRevision+1,changes:[{entity:'profile',id:actor,row:{bio:'A reviewed bio'}}]});

test('strict operation schema rejects model authority, unknown fields, malformed IDs, unsafe destinations and invalid dates',()=>{
    assert.equal(isProfileOperation(operation()),true);
    assert.equal(isProfileOperation({...operation(),user_id:actor}),false);
    for(const change of [
        {kind:'profile.patch',patch:{user_type:'admin'}},
        {kind:'product.patch',id,patch:{payment_config:{recipient:'attacker'}}},
        {kind:'link.patch',id:'foreign malformed ID',patch:{link_name:'x'}},
        {kind:'link.patch',id,patch:{}},
        {kind:'link.add',values:{link_name:'Website',link_url:'javascript:alert(1)'}},
        {kind:'experience.add',values:{company_name:'Fixture',job_title:'Builder',start_year:2026,end_year:2025}},
        {kind:'qualification.add',values:{institution:'Fixture',qualification_name:'Degree',start_year:'2026'}},
        {kind:'collection.reorder',collection:'links',order:[id,id]},
        {kind:'collection.reorder',collection:'products',order:[]},
        {kind:'profile.patch',patch:{bio:'x'.repeat(32769)}},
    ])assert.equal(isProfileChange(change),false,JSON.stringify(change).slice(0,160));
    assert.equal(isProfileChange({kind:'profile.patch',patch:{bio:'',headline:null}}),true);
    assert.equal(isProfileChange({kind:'link.add',values:{link_name:'',link_url:''}}),true,'Blank manual rows remain editable drafts');
    for(const position of ['top','bottom']) {
        const change={kind:'link.add',values:{link_name:'',link_url:''},position};
        assert.equal(isProfileChange(change),true);
        assert.deepEqual(normalizeProfileChange(change),change);
    }
    for(const position of [null,'middle',0,{},undefined])assert.equal(isProfileChange({kind:'link.add',values:{link_name:'',link_url:''},position}),false);
    assert.equal(isProfileChange({kind:'link.patch',id,patch:{link_name:'Updated'},position:'top'}),false);
    assert.equal(isProfileChange({kind:'product.add',values:{name:'Named offering',display_order:-999}}),false);
    assert.equal(isProfileChange({kind:'contact.patch',id,patch:{method:'LinkedIn'}}),true);
    assert.deepEqual(normalizeProfileChange({kind:'link.patch',id,patch:{link_url:' https://EXAMPLE.test/portfolio '}}),{kind:'link.patch',id,patch:{link_url:'https://example.test/portfolio'}});
});

test('owner product operations accept and normalize the second destination under the same URL boundary as the primary',()=>{
    const url='  HTTPS://WWW.COURSERA.ORG:443/learn/fixture?source=nsso  ';
    for(const kind of ['product.add','product.patch']) {
        const change=kind==='product.add'
            ? {kind,values:{name:'Synthetic course',secondary_purchase_link:url}}
            : {kind,id,patch:{secondary_purchase_link:url}};
        assert.equal(isProfileChange(change),true);
        const normalized=normalizeProfileChange(change);
        assert.equal((normalized.values||normalized.patch).secondary_purchase_link,'https://www.coursera.org/learn/fixture?source=nsso');
        for(const empty of ['',null]) {
            const draft=kind==='product.add'?{kind,values:{name:'Synthetic course',secondary_purchase_link:empty}}:{kind,id,patch:{secondary_purchase_link:empty}};
            assert.equal(isProfileChange(draft),true,'An optional destination can be cleared without deleting the offering');
            assert.equal((normalizeProfileChange(draft).values||normalizeProfileChange(draft).patch).secondary_purchase_link,empty);
        }
    }
    for(const field of ['purchase_link','secondary_purchase_link']) for(const unsafe of [
        'javascript:alert(1)','data:text/html,fixture','//evil.example/course','/relative',
        'https://user:password@example.test/course','https://example.test/a\\b',
        'https://example.test/a\nb','https://example.test/'+ 'x'.repeat(4096),{},123,
    ]) {
        assert.equal(isProfileChange({kind:'product.patch',id,patch:{[field]:unsafe}}),false,field+': '+String(unsafe));
        assert.equal(isProfileChange({kind:'product.add',values:{name:'Synthetic course',[field]:unsafe}}),false,field+': '+String(unsafe));
    }
    assert.equal(isProfileChange({kind:'product.patch',id,patch:{purchase_link:'https://www.udemy.com/course/fixture',secondary_purchase_link:'javascript:alert(1)'}}),false);
});

test('tool normalization persists both link fields and turns wording into a reviewable field patch without invented metadata',()=>{
    assert.deepEqual(normalizeToolCall('update_link',{linkId:id,name:'Portfolio',url:'https://example.test'}).change,{kind:'link.patch',id,patch:{link_name:'Portfolio',link_url:'https://example.test'}});
    assert.deepEqual(normalizeToolCall('suggest_wording',{target:'bio',improved:''}).change,{kind:'profile.patch',patch:{bio:''}});
    assert.equal(normalizeToolCall('delete_database',{}),null);
    assert.equal(normalizeToolCall('add_project',{project_name:'Fixture',project_description:'Description',technologies:['Pretend saved']}),null);
    assert.equal(normalizeToolCall('add_experience',{company:'Fixture',title:'Builder',startYear:'2020-2025'}),null);
    assert.equal(parseActionList([{version:1,label:'Publish',change:{kind:'product.patch',id,patch:{sales_page_published:true}}}]),null,'AI proposals have a narrower allowlist than owner forms');
});

test('duplicate Apply shares one in-flight request, same ID with changed payload is rejected, and queued edits use each committed revision',async()=>{
    const requests=[];let release;
    const gate=new Promise(resolve=>{release=resolve;});
    const send=async(_url,init)=>{const body=JSON.parse(init.body);requests.push(body);if(requests.length===1)await gate;return Response.json(applied(body));};
    const client=new ProfileMutationClient(0,send,actor),op=crypto.randomUUID();
    const first=client.apply([patch],op),same=client.apply([patch],op);
    assert.equal((await client.apply([{kind:'profile.patch',patch:{bio:'Different'}}],op)).code,'OPERATION_ID_REUSED');
    const next=client.apply([{kind:'profile.patch',patch:{headline:'Next'}}]);
    release();assert.equal((await first).status,'applied');assert.equal((await same).status,'applied');assert.equal((await next).status,'applied');
    assert.equal(requests.length,2);assert.deepEqual(requests.map(request=>request.expectedRevision),[0,1]);
});

test('a lost response reconciles the committed operation without a duplicate insert',async()=>{
    let writes=0;let committed;
    const send=async(_url,init)=>{
        if(init?.method==='POST'){writes++;committed=applied(JSON.parse(init.body));throw new Error('Dropped after commit');}
        return Response.json(committed);
    };
    const result=await new ProfileMutationClient(0,send,actor).apply([patch]);
    assert.equal(result.status,'applied');assert.equal(writes,1);
});

test('unknown outcomes keep the exact original operation envelope for retry, even after newer revision knowledge',async()=>{
    const posts=[];let first=true;
    const send=async(_url,init)=>{
        if(init?.method!=='POST')return Response.json({status:'not_found',operationId:posts[0].operationId,revision:9});
        posts.push(JSON.parse(init.body));if(first){first=false;throw new Error('Unknown transport');}return Response.json(applied(posts[0]));
    };
    const client=new ProfileMutationClient(0,send,actor),op=crypto.randomUUID();
    assert.equal((await client.apply([patch],op)).status,'outcomeUnknown');
    assert.equal((await client.apply([patch],op)).status,'applied');
    assert.deepEqual(posts[1],posts[0]);
});

test('disposed clients cannot dispatch queued edits after the active account changes',async()=>{
    const client=new ProfileMutationClient(0,()=>assert.fail('Disposed account must not send'),actor);
    client.dispose();assert.equal((await client.apply([patch])).code,'ACCOUNT_CHANGED');
});

let user,rpcCalls,rpcError;
beforeEach(()=>{
    user={id:actor};rpcCalls=[];rpcError=null;
    globalThis.__profileSession={auth:{getUser:async()=>({data:{user},error:null})},rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:name==='apply_profile_operation'?applied(args.p_operation):name==='undo_profile_operation'?{status:'applied',operationId:args.p_operation_id,revision:2,changes:[{entity:'profile',id:actor,row:{bio:'Before'}}]}:{status:'not_found',operationId:args.p_operation_id,revision:0},error:rpcError};}};
});
const request=body=>new Request('https://nsso.test/api/profile/operations',{method:'POST',headers:{'content-type':'application/json',origin:'https://nsso.test','x-nsso-account':actor},body:JSON.stringify(body)});
test('route verifies auth and intended active account before body, then invokes only owner-derived RPCs',async()=>{
    const noBody=()=>new Proxy(request(operation()),{get(target,key){if(key==='body')assert.fail('Unauthorized body read');return Reflect.get(target,key,target);}});
    user=null;assert.equal((await operations.POST(noBody())).status,401);assert.deepEqual(rpcCalls,[]);
    user={id};assert.equal((await operations.POST(noBody())).status,409);assert.deepEqual(rpcCalls,[]);
    user={id:actor};const body=operation();assert.equal((await operations.POST(request(body))).status,200);
    assert.deepEqual(rpcCalls,[{name:'apply_profile_operation',args:{p_operation:body}}]);
});
test('invalid/oversized/cross-origin operations are denied without RPCs; database failure never claims applied or leaks details',async()=>{
    assert.equal((await operations.POST(request({...operation(),actor:id}))).status,422);
    assert.equal((await operations.POST(request(operation([{kind:'profile.patch',patch:{bio:'x'.repeat(300000)}}])))).status,413);
    assert.equal((await operations.POST(new Request('https://nsso.test/api/profile/operations',{method:'POST',headers:{origin:'https://outside.test'},body:'{}'}))).status,403);
    assert.deepEqual(rpcCalls,[]);rpcError={message:'private database fixture detail'};
    const failed=await operations.POST(request(operation()));assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/private database fixture detail/);
});
test('status and Undo remain actor-scoped and accept no supplied compensation or arbitrary owner',async()=>{
    const operationId=crypto.randomUUID(),originalOperationId=crypto.randomUUID();
    let response=await operations.GET(new Request(`https://nsso.test/api/profile/operations?operationId=${operationId}`,{headers:{'x-nsso-account':actor}}));
    assert.equal(response.status,200);assert.equal((await response.json()).status,'not_found');
    response=await undo(request({version:1,operationId,originalOperationId,expectedRevision:1}));assert.equal(response.status,200);
    assert.deepEqual(rpcCalls.at(-1),{name:'undo_profile_operation',args:{p_operation_id:operationId,p_original_operation_id:originalOperationId,p_expected_revision:1}});
    assert.equal((await undo(request({version:1,operationId,originalOperationId,expectedRevision:1,before:{bio:'forged'}}))).status,422);
});
