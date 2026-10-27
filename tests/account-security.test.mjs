import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../src/', import.meta.url);
const previousEnv = { ...process.env };
const emptyModule = `data:text/javascript,${encodeURIComponent('export {};')}`;
const sessionModule = `data:text/javascript,${encodeURIComponent('export const createClient = async () => globalThis.__accountSession;')}`;
const serviceModule = `data:text/javascript,${encodeURIComponent('export const createClient = () => globalThis.__accountService;')}`;
const hooks = registerHooks({ resolve(specifier,context,next) {
    // Route-specific authorization is isolated here; runtime accounting has its own integration suite.
    if (specifier === '@/lib/server/runtime-route') return {url:'data:text/javascript,export const withRuntimeGuard = handler => handler;',shortCircuit:true};
    if (specifier === 'next/server') return next('next/server.js',context);
    if (specifier === 'server-only') return {url:emptyModule,shortCircuit:true};
    if (specifier === '@/lib/supabase/server') return {url:sessionModule,shortCircuit:true};
    if (specifier === '@supabase/supabase-js') return {url:serviceModule,shortCircuit:true};
    if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`,source).href,context);
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(`${specifier}.ts`,context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href,context);
    }
    return next(specifier,context);
} });
const { GET: me } = await import(new URL('app/api/me/route.ts',source));
const { POST: settings } = await import(new URL('app/api/me/settings/route.ts',source));
const { GET: listAccounts, POST: changePermission } = await import(new URL('app/api/admin/users/route.ts',source));
const { POST: connect } = await import(new URL('app/api/my-nsso/connect/route.ts',source));
const { GET: connections } = await import(new URL('app/api/my-nsso/connections/route.ts',source));
const { PATCH: patchConnection, DELETE: deleteConnection } = await import(new URL('app/api/my-nsso/connections/[id]/route.ts',source));
const { POST: processFeed } = await import(new URL('app/api/cron/process-feed/route.ts',source));
hooks.deregister();

const actorId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const secretFixture = 'private-diagnostic-fixture-never-echo';
let actor, authError, account, bootstrap, accountError, rpcError, permitted, permissionError, adminRows, calls, connected, permissionTarget, targetError;
beforeEach(() => {
    Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture-only-not-a-secret'});
    actor = {id:actorId,email:'raminhoodeh@gmail.com',email_confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{user_type:'admin'},factors:[{id:'fixture-factor',status:'verified'}]};
    authError = null; permitted = true; permissionError = null; accountError = null; rpcError = null; adminRows = []; calls = []; connected = new Set();
    account = {id:actorId,email:'untrusted-copy@example.test',username:'fixture',is_premium:false,user_type:'admin',permissions:[]};
    bootstrap = {...account};
    permissionTarget = {id:targetId,email:'troy@nsso.me',email_confirmed_at:'2026-01-01T00:00:00Z'};
    targetError = null;
    globalThis.__accountSession = {
        auth:{getUser:async () => ({data:{user:actor},error:authError}),mfa:{getAuthenticatorAssuranceLevel:async () => ({data:{currentLevel:'aal2'},error:null})}},
        from:() => assert.fail('Account endpoints must use bounded RPC contracts, never direct account or reciprocal row writes'),
        rpc(name,args) {
            calls.push(['user-rpc',name,args]);
            if (name === 'get_current_account') return {data:account,error:accountError};
            if (name === 'ensure_current_account') return {data:bootstrap,error:rpcError};
            if (name === 'update_account_settings') return {data:args.p_patch,error:rpcError};
            if (name === 'connect_my_nsso') {
                if (rpcError) return {data:null,error:rpcError};
                const isNewConnection = !connected.has(args.p_connected_user_id);
                connected.add(args.p_connected_user_id);
                return {data:{success:true,isNewConnection,scannedUser:{username:'target-fixture'}},error:null};
            }
            assert.fail(`Unexpected user RPC: ${name}`);
        },
    };
    globalThis.__accountService = {
        auth:{admin:{getUserById:async id => { calls.push(['auth-admin','getUserById',id]); return {data:{user:permissionTarget},error:targetError}; }}},
        from:() => assert.fail('Admin endpoints must not expose unrestricted table queries'),
        rpc(name,args) {
            calls.push(['service-rpc',name,args]);
            if (name === 'has_app_permission') return {data:permitted,error:permissionError};
            if (name === 'admin_list_accounts') return {data:adminRows,error:rpcError};
            if (name === 'admin_set_permission') return {data:null,error:rpcError};
            if (name === 'process_daily_feed_aggregation') return {data:null,error:rpcError};
            assert.fail(`Unexpected service RPC: ${name}`);
        },
    };
});
after(() => {process.env = previousEnv;});
const request = (body,path='/api/me/settings',headers={}) => new Request(`https://nsso.test${path}`,{
    method:'POST',headers:{'content-type':'application/json',origin:'https://nsso.test',...headers},body:JSON.stringify(body),
});
const rpcCalls = name => calls.filter(call => call[1] === name);
const neverRead = path => new Proxy(request({},path),{get(target,key) {if(key === 'body') assert.fail('Denied body must not be consumed');return Reflect.get(target,key,target);}});
const privateResponse = response => assert.equal(response.headers.get('cache-control'),'private, no-store');

for (const [name,handler,path] of [['settings',settings,'/api/me/settings'],['admin mutation',changePermission,'/api/admin/users'],['connection',connect,'/api/my-nsso/connect'],['feed preparation',processFeed,'/api/cron/process-feed']]) {
    test(`${name} rejects anonymous callers before reading their body or invoking an RPC`,async () => {
        actor = null;
        const response = await handler(neverRead(path));
        assert.equal(response.status,401); privateResponse(response); assert.deepEqual(calls,[]);
    });
    test(`${name} rejects cross-origin mutation before account or database work`,async () => {
        const response = await handler(request({},path,{origin:'https://outside.test'}));
        assert.equal(response.status,403); privateResponse(response); assert.deepEqual(calls,[]);
    });
}

test('current account uses only the verified subject and vetted capability list, without a service credential',async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    account.permissions = ['unknown:permission'];
    let response = await me(); privateResponse(response);
    assert.equal(response.status,200);
    let body = await response.json();
    assert.equal(body.user.email,actor.email);
    assert.equal(body.user.user_type,'standard');
    assert.equal(body.user.is_premium,true);
    assert.deepEqual(body.permissions,[]);
    assert.deepEqual(calls,[['user-rpc','get_current_account',undefined]]);
    account.permissions = ['nsso:admin','razinflix:manage','unknown:permission'];
    response = await me(); body = await response.json();
    assert.equal(body.user.user_type,'admin');
    assert.deepEqual(body.permissions,['nsso:admin','razinflix:manage']);
    assert.deepEqual(body.user.permissions,body.permissions);
});

test('current account strips administrator capability from both response copies unless the verified Auth email is eligible',async () => {
    account.permissions = ['nsso:admin','razinflix:manage'];
    for (const identity of [
        {email:'outside@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'},
        {email:'troy@nsso.me',email_confirmed_at:undefined},
        {email:'troy@nsso.me',email_confirmed_at:'',confirmed_at:'2026-01-01T00:00:00Z',phone_confirmed_at:'2026-01-01T00:00:00Z'},
    ]) {
        actor = {...actor,...identity,user_metadata:{email:'raminhoodeh@gmail.com',email_confirmed_at:'2026-01-01T00:00:00Z',user_type:'admin'}};
        const response = await me();
        assert.equal(response.status,200);
        const body = await response.json();
        assert.equal(body.user.user_type,'standard');
        assert.deepEqual(body.permissions,['razinflix:manage']);
        assert.deepEqual(body.user.permissions,['razinflix:manage']);
    }
    actor.email = ' TROY@NSSO.ME '; actor.email_confirmed_at = '2026-01-01T00:00:00Z';
    const body = await (await me()).json();
    assert.equal(body.user.user_type,'admin');
    assert.deepEqual(body.user.permissions,['nsso:admin','razinflix:manage']);
});

test('current-account authentication and mismatched subjects fail without exposing another account',async () => {
    actor = null;
    assert.equal((await me()).status,401);
    assert.deepEqual(calls,[]);
    actor = {id:actorId,email:'verified@example.test'};
    account = {...account,id:targetId,bio:secretFixture};
    const response = await me(); privateResponse(response);
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
});

test('optional public account discovery returns an empty success without querying private data', async () => {
    actor = null;
    const response = await me(new Request('https://nsso.test/api/me', { headers: { 'X-NSSO-Optional-Account': '1' } }));
    assert.equal(response.status, 200); privateResponse(response);
    assert.deepEqual(await response.json(), { user: null, permissions: [] });
    assert.deepEqual(calls, []);
    authError = { status: 503, message: 'Synthetic auth outage' };
    assert.equal((await me(new Request('https://nsso.test/api/me', { headers: { 'X-NSSO-Optional-Account': '1' } }))).status, 503);
});

test('missing current accounts use the idempotent bootstrap contract and failures never look signed in',async () => {
    account = null;
    let response = await me();
    assert.equal(response.status,200);
    assert.equal(rpcCalls('ensure_current_account').length,1);
    rpcError = {message:secretFixture};
    response = await me();
    assert.equal(response.status,503);
    assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
    calls.length = 0; accountError = {message:secretFixture};
    assert.equal((await me()).status,503);
    assert.equal(rpcCalls('ensure_current_account').length,0,'An unavailable RPC is not evidence that an account is missing');
});

test('settings accept only bounded private preferences and never trust role or actor input',async () => {
    let response = await settings(request({deity_fast_mode:true,paypal_me_slug:'fixture-seller'}));
    assert.equal(response.status,200); privateResponse(response);
    assert.deepEqual(rpcCalls('update_account_settings')[0][2],{p_patch:{deity_fast_mode:true,paypal_me_slug:'fixture-seller'}});
    for (const patch of [{},{user_type:'admin'},{user_id:targetId},{is_premium:true},{deity_fast_mode:'yes'},{paypal_me_slug:'https://outside.test'},{deity_fast_mode:true,permissions:['nsso:admin']}]) {
        calls.length = 0;
        response = await settings(request(patch));
        assert.equal(response.status,400,JSON.stringify(patch));
        assert.equal(rpcCalls('update_account_settings').length,0);
    }
    response = await settings(request({paypal_me_slug:null}));
    assert.equal(response.status,200,'A seller can deliberately clear the optional payout preference');
});

test('settings reject oversized and wrong-content-type bodies before persistence and sanitize provider errors',async () => {
    assert.equal((await settings(request({padding:'x'.repeat(3000)}))).status,413);
    assert.equal((await settings(request({deity_fast_mode:true},'/api/me/settings',{'content-type':'text/plain'}))).status,415);
    assert.equal(rpcCalls('update_account_settings').length,0);
    rpcError = {message:secretFixture};
    const response = await settings(request({deity_fast_mode:true}));
    assert.equal(response.status,503); privateResponse(response);
    assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
});

test('admin listing requires protected membership even when editable user metadata claims administrator',async () => {
    permitted = false;
    const response = await listAccounts(new Request('https://nsso.test/api/admin/users'));
    assert.equal(response.status,403); privateResponse(response);
    assert.equal(rpcCalls('admin_list_accounts').length,0);
    assert.deepEqual(rpcCalls('has_app_permission')[0][2],{p_user_id:actorId,p_permission:'nsso:admin'});
});

test('admin APIs reject wrong or unverified emails even with a protected grant, aal2 and metadata spoofing',async () => {
    for (const identity of [
        {email:'other@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'},
        {email:'raminhoodeh@gmail.com',email_confirmed_at:undefined},
    ]) {
        calls.length = 0;
        actor = {...actor,...identity,user_metadata:{email:'troy@nsso.me',user_type:'admin',email_confirmed_at:'2026-01-01T00:00:00Z'}};
        assert.equal((await listAccounts(new Request('https://nsso.test/api/admin/users'))).status,403);
        assert.equal((await changePermission(neverRead('/api/admin/users'))).status,403);
        assert.deepEqual(calls,[],'Reject ineligible identity before permission lookup, request body or admin data');
    }
});

test('both approved verified emails still require their separately protected administrator membership',async () => {
    for (const email of ['raminhoodeh@gmail.com','TROY@NSSO.ME']) {
        actor.email = email;
        permitted = false;
        assert.equal((await listAccounts(new Request('https://nsso.test/api/admin/users'))).status,403);
        permitted = true;
        assert.equal((await listAccounts(new Request('https://nsso.test/api/admin/users'))).status,200);
    }
});

test('admin listing validates pagination and forwards the verified actor with a fixed page bound',async () => {
    for (const offset of ['-1','0.5','Infinity','100001']) assert.equal((await listAccounts(new Request(`https://nsso.test/api/admin/users?offset=${offset}`))).status,400);
    assert.equal(rpcCalls('admin_list_accounts').length,0);
    adminRows = Array.from({length:100},(_,i) => ({id:`fixture-${i}`}));
    const response = await listAccounts(new Request('https://nsso.test/api/admin/users?offset=200'));
    assert.equal(response.status,200); privateResponse(response);
    assert.equal((await response.json()).nextOffset,300);
    assert.deepEqual(rpcCalls('admin_list_accounts')[0][2],{p_actor_id:actorId,p_offset:200,p_limit:100});
});

test('admin permission mutation cannot select its actor or write arbitrary columns',async () => {
    let response = await changePermission(request({userId:targetId,permission:'razinflix:manage',granted:true,actorId:targetId},'/api/admin/users'));
    assert.equal(response.status,200); privateResponse(response);
    assert.deepEqual(rpcCalls('admin_set_permission')[0][2],{p_actor_id:actorId,p_user_id:targetId,p_permission:'razinflix:manage',p_granted:true});
    for (const body of [{userId:targetId,permission:'anything:else',granted:true},{userId:'bad',permission:'nsso:admin',granted:true},{userId:targetId,permission:'nsso:admin',granted:'true'}]) {
        calls.length = 0;
        assert.equal((await changePermission(request(body,'/api/admin/users'))).status,400);
        assert.equal(rpcCalls('admin_set_permission').length,0);
    }
});

test('administrator grants verify the target Auth email while RazinFlix grants retain their independent scope',async () => {
    const body = {userId:targetId,permission:'nsso:admin',granted:true,email:'raminhoodeh@gmail.com'};
    permissionTarget.email = 'outside@example.test';
    let response = await changePermission(request(body,'/api/admin/users'));
    assert.equal(response.status,403);
    assert.equal(rpcCalls('admin_set_permission').length,0);
    permissionTarget.email = 'troy@nsso.me'; permissionTarget.email_confirmed_at = undefined;
    response = await changePermission(request(body,'/api/admin/users'));
    assert.equal(response.status,403);
    assert.equal(rpcCalls('admin_set_permission').length,0);
    permissionTarget.email_confirmed_at = '2026-01-01T00:00:00Z';
    response = await changePermission(request(body,'/api/admin/users'));
    assert.equal(response.status,200);
    assert.equal(rpcCalls('admin_set_permission').length,1);
    calls.length = 0; permissionTarget.email = 'outside@example.test';
    response = await changePermission(request({...body,permission:'razinflix:manage'},'/api/admin/users'));
    assert.equal(response.status,200);
    assert.equal(calls.some(call => call[0] === 'auth-admin'),false);
    assert.equal(rpcCalls('admin_set_permission').length,1);
});

test('target verification failures and mismatched Auth subjects never grant administrator capability',async () => {
    const body = {userId:targetId,permission:'nsso:admin',granted:true};
    targetError = {message:secretFixture};
    let response = await changePermission(request(body,'/api/admin/users'));
    assert.equal(response.status,503); assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
    assert.equal(rpcCalls('admin_set_permission').length,0);
    targetError = null; permissionTarget.id = actorId;
    response = await changePermission(request(body,'/api/admin/users'));
    assert.equal(response.status,403);
    assert.equal(rpcCalls('admin_set_permission').length,0);
});

test('membership and last-admin failures remain fail-closed with safe errors',async () => {
    const body = {userId:targetId,permission:'nsso:admin',granted:false};
    permissionError = {message:secretFixture};
    let response = await changePermission(request(body,'/api/admin/users'));
    assert.equal(response.status,503); assert.equal(rpcCalls('admin_set_permission').length,0);
    permissionError = null;
    for (const [code,status] of [['42501',403],['P0001',409],['23514',409],['XX000',503]]) {
        rpcError = {code,message:secretFixture};
        response = await changePermission(request(body,'/api/admin/users'));
        assert.equal(response.status,status); privateResponse(response);
        assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
    }
});

test('connection handler uses one caller-derived RPC and returns authoritative created/existing results',async () => {
    const body = {scannedUserId:targetId,location:'Fixture café',user_id:targetId,notes:secretFixture};
    let response = await connect(request(body,'/api/my-nsso/connect'));
    assert.equal(response.status,200); privateResponse(response);
    assert.equal((await response.json()).isNewConnection,true);
    response = await connect(request(body,'/api/my-nsso/connect'));
    assert.equal((await response.json()).isNewConnection,false);
    assert.deepEqual(rpcCalls('connect_my_nsso').map(call => call[2]),[
        {p_connected_user_id:targetId,p_location_name:'Fixture café'},
        {p_connected_user_id:targetId,p_location_name:'Fixture café'},
    ]);
    assert.doesNotMatch(JSON.stringify(calls),new RegExp(secretFixture));
});

test('connection validation and transaction failures preserve clear safe outcomes',async () => {
    for (const body of [{scannedUserId:actorId},{scannedUserId:'bad'},{scannedUserId:targetId,location:'x'.repeat(301)}]) assert.equal((await connect(request(body,'/api/my-nsso/connect'))).status,400);
    assert.equal(rpcCalls('connect_my_nsso').length,0);
    for (const [code,status] of [['P0002',404],['23503',400],['XX000',503]]) {
        rpcError = {code,message:secretFixture};
        const response = await connect(request({scannedUserId:targetId},'/api/my-nsso/connect'));
        assert.equal(response.status,status); privateResponse(response);
        assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
    }
});

test('feed preparation never reads a supplied subject and invokes only the verified actor through the service RPC',async () => {
    const req = new Proxy(request({target_user_id:targetId,user_id:targetId,notes:secretFixture},`/api/cron/process-feed?target_user_id=${targetId}`),{
        get(target,key) {if (key === 'body' || key === 'json' || key === 'text') assert.fail('Feed preparation has no request-body contract');return Reflect.get(target,key,target);},
    });
    const response = await processFeed(req);
    assert.equal(response.status,200); privateResponse(response);
    assert.deepEqual(await response.json(),{success:true,message:'Feed updates prepared.'});
    assert.deepEqual(calls,[['service-rpc','process_daily_feed_aggregation',{target_user_id:actorId}]]);
    assert.doesNotMatch(JSON.stringify(calls),new RegExp(secretFixture));
});

test('feed preparation rejects unverified sessions and safely reports database or transport failures',async () => {
    authError = {message:secretFixture};
    let response = await processFeed(neverRead('/api/cron/process-feed'));
    assert.equal(response.status,401); privateResponse(response); assert.deepEqual(calls,[]);
    authError = null; rpcError = {message:secretFixture};
    response = await processFeed(neverRead('/api/cron/process-feed'));
    assert.equal(response.status,503); privateResponse(response);
    assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
    globalThis.__accountService.rpc = async () => {throw new Error(secretFixture);};
    response = await processFeed(neverRead('/api/cron/process-feed'));
    assert.equal(response.status,503); privateResponse(response);
    assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
});

 test('privileged operations require a fresh verified factor and aal2 while ordinary account reads stay available', async () => {
    globalThis.__accountSession.auth.mfa.getAuthenticatorAssuranceLevel = async () => ({data:{currentLevel:'aal1'},error:null});
    const denied = await listAccounts(new Request('https://nsso.test/api/admin/users'));
    assert.equal(denied.status,403); assert.equal((await denied.json()).code,'mfa_required');
    assert.equal(rpcCalls('admin_list_accounts').length,0);
    assert.equal((await me()).status,200);
    globalThis.__accountSession.auth.mfa.getAuthenticatorAssuranceLevel = async () => ({data:{currentLevel:'aal2'},error:null});
    actor.factors = [];
    assert.equal((await listAccounts(new Request('https://nsso.test/api/admin/users'))).status,403);
    assert.equal(rpcCalls('admin_list_accounts').length,0);
 });
 test('Auth outages keep account reads unavailable rather than reporting a logout', async () => {
    authError = {status:0,name:'AuthRetryableFetchError',message:secretFixture};
    const response = await me(); assert.equal(response.status,503); assert.equal((await response.text()).includes(secretFixture),false);
 });


test('network Auth outages are retryable503 responses with private caching and no body/database mutation', async () => {
    authError = {status:0,message:secretFixture}; actor = null;
    const params = {params:Promise.resolve({id:targetId})};
    for (const endpoint of [
        () => connect(neverRead('/api/my-nsso/connect')),
        () => connections(new Request('https://nsso.test/api/my-nsso/connections')),
        () => patchConnection(neverRead('/api/my-nsso/connections/'+targetId),params),
        () => deleteConnection(new Request('https://nsso.test/api/my-nsso/connections/'+targetId,{method:'DELETE'}),params),
    ]) {
        const response = await endpoint(); assert.equal(response.status,503); privateResponse(response);
        assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
    }
    assert.deepEqual(calls,[]);
});


test('Auth429 becomes temporary account unavailability before any account or privileged work', async () => {
    authError = {status:429,message:secretFixture};
    for (const endpoint of [() => me(), () => listAccounts(new Request('https://nsso.test/api/admin/users'))]) {
        const response = await endpoint(); assert.equal(response.status,503); privateResponse(response);
        assert.doesNotMatch(await response.text(),new RegExp(secretFixture));
    }
    assert.deepEqual(calls,[]);
});

test('network Auth429 never reads a mutation body or treats a valid actor as logged out', async () => {
    authError = {status:429,message:secretFixture};
    const params = {params:Promise.resolve({id:targetId})};
    for (const endpoint of [
        () => connect(neverRead('/api/my-nsso/connect')),
        () => connections(new Request('https://nsso.test/api/my-nsso/connections')),
        () => patchConnection(neverRead('/api/my-nsso/connections/'+targetId),params),
        () => deleteConnection(new Request('https://nsso.test/api/my-nsso/connections/'+targetId,{method:'DELETE'}),params),
    ]) { const response = await endpoint(); assert.equal(response.status,503); privateResponse(response); }
    assert.deepEqual(calls,[]);
});
