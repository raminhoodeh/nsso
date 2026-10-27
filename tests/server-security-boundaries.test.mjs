import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

globalThis.AsyncLocalStorage ??= AsyncLocalStorage;
const source = new URL('../src/', import.meta.url);
const originalEnv = { ...process.env };
const noop = `data:text/javascript,${encodeURIComponent('export {};')}`;
const sessionMock = `data:text/javascript,${encodeURIComponent('export const createClient = async () => globalThis.__securitySession;')}`;
const serviceMock = `data:text/javascript,${encodeURIComponent('export const createClient = () => { globalThis.__securityCalls.push(["privileged-client"]); return globalThis.__securityDatabase; };')}`;
const ssrMock = `data:text/javascript,${encodeURIComponent('export const createServerClient = (_url, _key, options) => ({ auth: { getUser: async () => { options.cookies.setAll([{name:"refreshed-session",value:"test-only-cookie",options:{httpOnly:true,path:"/"}}]); return globalThis.__securitySession.auth.getUser(); } } });')}`;
const enrichmentMock = `data:text/javascript,${encodeURIComponent(`
export class FilmEnrichmentError extends Error { constructor(code,message,status,details){super(message);Object.assign(this,{code,status,details});} }
export const normalizeTitle = value => value.toLowerCase();
export const buildSearchTitleVariants = value => [value];
export const matchingAliases = film => new Set([film.title.toLowerCase()]);
export const fallbackRazinflixCategory = () => 'Japanese Anime';
export const resolveTmdbFilmWithFallback = async () => {globalThis.__securityCalls.push(['provider','tmdb']);return globalThis.__securityFilm;};
export const verifyPosterUrl = async () => {globalThis.__securityCalls.push(['provider','poster']);};
export const resolveTrailer = async () => {globalThis.__securityCalls.push(['provider','trailer']);return {trailer:{key:'abcdefghijk',source:'tmdb',title:'Trailer',confidence:'high'},diagnostics:[]};};
`)}`;
const hooks = registerHooks({ resolve(specifier, context, next) {
    if (specifier === '@/lib/server/runtime-route') return { url: 'data:text/javascript,export const withRuntimeGuard = handler => handler;', shortCircuit: true };
    if (specifier === 'server-only') return { url: noop, shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    if (specifier === '@/lib/supabase/server') return { url: sessionMock, shortCircuit: true };
    if (specifier === '@supabase/supabase-js') return { url: serviceMock, shortCircuit: true };
    if (specifier === '@supabase/ssr') return { url: ssrMock, shortCircuit: true };
    if (specifier === '@/lib/razinflix/enrichment') return { url: enrichmentMock, shortCircuit: true };
    if (specifier.startsWith('@/')) return next(new URL(`${specifier.slice(2)}.ts`, source).href, context);
    if (specifier.startsWith('.') && context.parentURL?.startsWith(source.href)) {
        const url = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
    }
    return next(specifier, context);
} });
const { POST: add } = await import(new URL('app/api/razinflix/add/route.ts', source));
const { POST: update } = await import(new URL('app/api/razinflix/update/route.ts', source));
const { POST: remove } = await import(new URL('app/api/razinflix/delete/route.ts', source));
const { POST: linkCheck } = await import(new URL('app/api/deity/validate-link/route.ts', source));
const { GET: callback } = await import(new URL('app/auth/callback/route.ts', source));
const { updateSession } = await import(new URL('lib/supabase/middleware.ts', source));
const { safeInternalPath } = await import(new URL('lib/server/auth-redirect.ts', source));
const { assessLinkHealth } = await import(new URL('lib/deity/linkVerifier.ts', source));
const { config: proxyConfig } = await import(new URL('proxy.ts', source));
const { GET: earnings } = await import(new URL('app/api/earnings/stats/route.ts', source));
const { extractActions } = await import(new URL('lib/deity/actionParser.ts', source));
const { NextRequest } = await import('next/server.js');
const { unstable_doesMiddlewareMatch: doesMatch } = await import('next/experimental/testing/server.js');
hooks.deregister();

let calls, user, allowed, account, setupError, mutationError;
beforeEach(() => {
    Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only-not-a-secret' });
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    calls = globalThis.__securityCalls = [];
    user = { id: '11111111-1111-4111-8111-111111111111', factors: [{id:'fixture-factor',status:'verified'}] }; allowed = true; account = { id: user.id }; setupError = null; mutationError = null;
    globalThis.__securitySession = {
        auth: {
            getUser: async () => ({ data: { user }, error: null }),
            mfa: { getAuthenticatorAssuranceLevel: async () => ({data:{currentLevel:'aal2'},error:null}) },
            exchangeCodeForSession: async () => ({ data: { user }, error: null }),
        },
        rpc: name => { calls.push(['session-rpc',name]); return { data: account, error: setupError, single: async () => ({ data: { referral_code:'fixture',active_referrals:2,expected_earnings:100,paypal_me_slug:'fixture' },error:null }) }; },
        from: () => assert.fail('Callback must not perform non-atomic direct table bootstrap'),
    };
    globalThis.__securityFilm = { title: 'Fixture Film', year: '2026', posterUrl: 'https://image.tmdb.org/fixture.jpg',
        overview: 'Fixture verified synopsis.', directors: ['Fixture Director'], rating: '8', tmdbId: 42, originalTitle: 'Fixture Film', genres: [], originCountries: ['JP'] };
    globalThis.__securityDatabase = {
        rpc: async (name,args) => { calls.push(['permission',name,args]); return { data: allowed, error: null }; },
        from(table) {
            calls.push(['from',table]);
            let saved = {};
            const query = {
                update(payload) { saved = payload; calls.push(['update',payload]); return query; },
                insert(payload) { saved = payload; calls.push(['insert',payload]); return query; },
                delete() { calls.push(['delete']); return query; },
                eq(key,value) { calls.push(['eq',key,value]); return query; },
                select(columns) { calls.push(['select',columns]); return query; },
                single: async () => ({ data: { id: 12, title: 'Fixture Film', ...saved }, error: mutationError }),
                maybeSingle: async () => ({ data: { id: 12 }, error: mutationError }),
                then(resolve,reject) { return Promise.resolve({ data: [], error: mutationError }).then(resolve,reject); },
            };
            return query;
        },
        storage: { from(bucket) { return {
            upload: async (path,bytes) => { calls.push(['upload',bucket,path,bytes.length]); return { error: null }; },
            getPublicUrl: path => ({ data: { publicUrl: `https://fixture.invalid/${path}` } }),
        }; } },
    };
});
after(() => { process.env = originalEnv; });
const request = body => new Request('https://nsso.test/api/razinflix/delete', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://nsso.test' }, body: JSON.stringify(body) });
const noBodyRead = () => new Proxy(request({ id: 12 }), { get(target,property) { if (property === 'body') assert.fail('Denied request body must not be read'); return Reflect.get(target,property,target); } });
const mutations = () => calls.filter(([name]) => ['from','provider','upload','insert','update','delete'].includes(name));

for (const [name, handler] of [['add',add],['update',update],['delete',remove]]) {
    test(`${name}: anonymous and unrelated actors are denied before body, provider, storage or mutation work`, async () => {
        user = null;
        assert.equal((await handler(noBodyRead())).status,401);
        assert.deepEqual(calls,[]);
        user = { id: 'unrelated-actor' }; allowed = false;
        assert.equal((await handler(noBodyRead())).status,403);
        assert.deepEqual(mutations(),[]);
        assert.deepEqual(calls.find(([name]) => name === 'permission')[2], {p_user_id:'unrelated-actor',p_permission:'razinflix:manage'});
    });
}

test('permission failures and cross-origin requests fail closed', async () => {
    globalThis.__securityDatabase.rpc = async () => ({ data: null, error: { message: 'fixture private detail' } });
    assert.equal((await remove(request({id:12}))).status,503);
    assert.deepEqual(mutations(),[]);
    const response = await remove(new Request('https://nsso.test/api/razinflix/delete', {method:'POST',headers:{origin:'https://outside.test'},body:'{}'}));
    assert.equal(response.status,403);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('authorized delete performs only the requested catalog mutation and sanitizes database errors', async () => {
    assert.equal((await remove(request({id:12}))).status,200);
    assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'id' && call[2] === 12));
    mutationError = { message: 'fixture sensitive database detail' };
    const response = await remove(request({id:12}));
    assert.equal(response.status,500);
    assert.doesNotMatch(await response.text(),/sensitive database detail/);
});

test('authorized film addition preserves verified metadata fallback after authorization', async () => {
    const response = await add(request({title:'Fixture Film'}));
    assert.equal(response.status,200);
    assert.equal((await response.json()).description,'Fixture verified synopsis.');
    assert.ok(calls.findIndex(call => call[0] === 'permission') < calls.findIndex(call => call[0] === 'provider'));
    assert.ok(calls.some(call => call[0] === 'insert'));
});

function filmForm(poster) {
    const form = new FormData(); form.set('id','12'); form.set('title','Changed Film');
    if (poster) form.set('poster',poster);
    return new Request('https://nsso.test/api/razinflix/update', {method:'POST',body:form});
}
test('authorized updates persist bounded film fields and reject disguised poster content', async () => {
    assert.equal((await update(filmForm())).status,200);
    assert.deepEqual(calls.find(call => call[0] === 'update')[1],{title:'Changed Film'});
    calls.length = 0;
    assert.equal((await update(filmForm(new File(['<svg onload="bad()"/>'],'poster.png',{type:'image/png'})))).status,400);
    assert.ok(!calls.some(call => ['upload','update'].includes(call[0])));
});

test('JSON and multipart limits apply to actual bytes before privileged mutation', async () => {
    assert.equal((await remove(request({id:12,padding:'x'.repeat(20_000)}))).status,413);
    const form = new Request('https://nsso.test/api/razinflix/update', { method:'POST', headers:{'content-type':'multipart/form-data; boundary=fixture'}, body:new Uint8Array(2*1024*1024+40_000) });
    assert.equal((await update(form)).status,413);
    assert.deepEqual(mutations(),[]);
});

test('auth callback uses atomic provisioning and never redirects to another origin', async () => {
    for (const next of ['/dashboard?tab=profile','//outside.test','/\\outside.test','https://outside.test']) {
        const response = await callback(new Request(`https://nsso.test/auth/callback?code=fixture&next=${encodeURIComponent(next)}`));
        const location = new URL(response.headers.get('location'));
        assert.equal(location.origin,'https://nsso.test');
        assert.equal(location.pathname,'/dashboard');
        assert.equal(response.headers.get('cache-control'),'private, no-store');
    }
    assert.equal(calls.filter(call => call[1] === 'ensure_current_account').length,4);
    setupError = { message: 'fixture private setup detail' };
    const response = await callback(new Request('https://nsso.test/auth/callback?code=fixture'));
    assert.equal(new URL(response.headers.get('location')).searchParams.get('error'),'account_setup');
});

test('internal destinations retain query strings while malformed and normalized external forms fall back', () => {
    assert.equal(safeInternalPath('/dashboard?tab=profile#bio','https://nsso.test'),'/dashboard?tab=profile#bio');
    for (const value of ['https://outside.test','//outside.test','/\\outside.test','/\u0009/outside.test']) assert.equal(safeInternalPath(value,'https://nsso.test'),'/dashboard');
});

test('middleware preserves refreshed cookies on sign-in and denied-admin redirects', async () => {
    user = null;
    let response = await updateSession(new NextRequest('https://nsso.test/dashboard?tab=profile'));
    assert.equal(response.cookies.get('refreshed-session').value,'test-only-cookie');
    assert.equal(new URL(response.headers.get('location')).searchParams.get('next'),'/dashboard?tab=profile');
    user = {id:'ordinary-user',email:'raminhoodeh@gmail.com',email_confirmed_at:'2026-01-01T00:00:00Z'}; allowed = false;
    response = await updateSession(new NextRequest('https://nsso.test/admin'));
    assert.equal(new URL(response.headers.get('location')).pathname,'/dashboard');
    assert.equal(response.cookies.get('refreshed-session').value,'test-only-cookie');
    assert.deepEqual(calls.find(call => call[0] === 'permission')[2],{p_user_id:'ordinary-user',p_permission:'nsso:admin'});
});

test('admin page routes require an approved verified Auth email as well as protected membership', async () => {
    for (const identity of [
        {email:'outside@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'},
        {email:'raminhoodeh@gmail.com'},
        {email:'troy@nsso.me',phone_confirmed_at:'2026-01-01T00:00:00Z',confirmed_at:'2026-01-01T00:00:00Z'},
    ]) {
        calls.length = 0; allowed = true;
        user = {id:'fixture-admin',...identity,user_metadata:{email:'raminhoodeh@gmail.com',email_confirmed_at:'2026-01-01T00:00:00Z',user_type:'admin'}};
        const response = await updateSession(new NextRequest('https://nsso.test/admin'));
        assert.equal(new URL(response.headers.get('location')).pathname,'/dashboard');
        assert.equal(response.cookies.get('refreshed-session').value,'test-only-cookie');
        assert.equal(calls.some(call => call[0] === 'permission'),false);
    }
    for (const email of ['raminhoodeh@gmail.com','TROY@NSSO.ME']) {
        calls.length = 0; user = {id:'fixture-admin',email,email_confirmed_at:'2026-01-01T00:00:00Z'};
        const response = await updateSession(new NextRequest('https://nsso.test/admin/users'));
        assert.equal(response.headers.get('location'),null);
        assert.equal(calls.find(call => call[0] === 'permission')[2].p_permission,'nsso:admin');
    }
});

test('retired link endpoint and format assessment perform no network requests and make no health claims', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => assert.fail('URL assessment must not contact arbitrary hosts');
    try {
        assert.equal((await linkCheck(request({url:'http://127.0.0.1/private'}))).status,410);
        for (const url of ['https://example.test','http://127.0.0.1/private','https://slow.example.test']) assert.equal(assessLinkHealth(url),'unverified');
        for (const url of ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.test','/relative']) assert.equal(assessLinkHealth(url),'unsafe');
    } finally { globalThis.fetch = originalFetch; }
});


test('known public video and PDF assets bypass proxy while every protected operation still matches', () => {
    for (const path of ['/homepage-video.mp4','/nsso-homepage-profile-demo.mp4','/nsso-vision-ukYfrg0ZNbA.mp4','/deck.pdf','/deck.pdf?download=1']) {
        assert.equal(doesMatch({ config:proxyConfig,url:`https://nsso.test${path}` }),false,path);
    }
    for (const path of ['/admin','/dashboard','/preview','/api/admin/users','/api/razinflix/update','/dashboard/export.pdf','/admin/private.mp4']) {
        assert.equal(doesMatch({ config:proxyConfig,url:`https://nsso.test${path}` }),true,path);
    }
});

test('earnings responses are private and uncacheable for signed-in and anonymous actors', async () => {
    let response = await earnings();
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal((await response.json()).expectedEarnings,0);
    user = null;
    response = await earnings();
    assert.equal(response.status,401);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('malformed model actions never copy generated text or parser errors into logs', () => {
    const originalError = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args);
    try {
        assert.deepEqual(extractActions('```json\n{private-fixture-value}\n```'),[]);
        assert.ok(logged.length <= 1);
        assert.doesNotMatch(JSON.stringify(logged),/private-fixture-value|SyntaxError/);
        if (logged.length) assert.match(JSON.stringify(logged),/INVALID_ACTION_JSON/);
    } finally { console.error = originalError; }
});

test('Auth outage preserves refreshed cookies and private cache on protected pages', async () => {
    globalThis.__securitySession.auth.getUser = async () => ({data:{user:null},error:{status:0,name:'AuthRetryableFetchError'}});
    const response = await updateSession(new NextRequest('https://nsso.test/dashboard'));
    assert.equal(response.status,503);
    assert.match(response.headers.get('set-cookie'),/refreshed-session=test-only-cookie/);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.equal((await response.text()).includes('AuthRetryableFetchError'),false);
});


test('Auth429 on a protected page preserves refreshed cookies and shows a retry instead of sign-in', async () => {
    globalThis.__securitySession.auth.getUser = async () => ({data:{user:null},error:{status:429,message:'PRIVATE_AUTH_THROTTLE'}});
    const response = await updateSession(new NextRequest('https://nsso.test/dashboard'));
    assert.equal(response.status,503); assert.equal(response.headers.get('location'),null);
    assert.match(response.headers.get('set-cookie'),/refreshed-session=test-only-cookie/);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    assert.doesNotMatch(await response.text(),/PRIVATE_AUTH_THROTTLE/);
});
