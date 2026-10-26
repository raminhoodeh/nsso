import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
let bundle;
test.beforeAll(async () => {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'isolated-session-backend', setup(builder) {
            builder.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: 'fixture-client', namespace: 'fixture-backend' }));
            builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'fixture-navigation', namespace: 'fixture-backend' }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture-backend' }, args => ({ contents: args.path === 'fixture-navigation'
                ? 'export const useRouter = () => window.fixtureRouter;'
                : 'export const createClient = () => window.fixtureDatabase;', loader: 'js' }));
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';
            import { createRoot } from 'react-dom/client';
            import { UserProvider, useUser } from './src/components/providers/UserProvider';
            import { ProfileProvider, useProfile } from './src/components/providers/ProfileProvider';

            window.fixtureActor = 'actor-a';
            window.fixtureRefreshes = 0;
            window.fixtureRouter = { refresh() { window.fixtureRefreshes++; } };
            window.fixtureMode = window.fixtureInitialAccountMode || 'ok';
            window.pendingAccounts = [];
            window.pendingProfiles = [];
            window.deferNextAccount = false;
            window.deferProfileOwner = window.fixtureHangInitialProfile ? 'actor-a' : null;
            window.fixtureReadSignals = [];
            window.fixtureWrites = [];
            window.fixtureSnapshots = {};
            window.fixtureHistory = {};
            window.holdOperations = false;
            const account = owner => ({ id: owner, username: owner, user_type: owner === 'actor-a' ? 'admin' : 'standard',
                is_premium: true, deity_fast_mode: false, permissions: owner === 'actor-a' ? ['nsso:admin','razinflix:manage'] : [] });
            const tables = (table, owner) => table === 'profiles'
                ? { user_id: owner, full_name: owner, bio: owner + ' saved bio', headline: owner + ' headline' }
                : [{ id: owner + '-' + table, user_id: owner, name: owner + ' private ' + table }];
            const snapshot = owner => window.fixtureSnapshots[owner] ||= {revision:0,profile:tables('profiles',owner),links:tables('links',owner),contacts:tables('contacts',owner),experiences:tables('experiences',owner),qualifications:tables('qualifications',owner),projects:tables('projects',owner),products:tables('products',owner)};
            window.fetch = async (url, init) => {
                if (url.startsWith('/api/profile/operations')) {
                    const owner=window.fixtureActor, body=JSON.parse(init.body);
                    if (window.holdOperations) return new Promise(()=>{});
                    const current=snapshot(owner), previous=structuredClone(current.profile);
                    if (url.endsWith('/undo')) current.profile=window.fixtureHistory[body.originalOperationId];
                    else for(const change of body.changes) current.profile={...current.profile,...change.patch};
                    window.fixtureHistory[body.operationId]=previous;current.revision++;
                    window.fixtureWrites.push({owner,body});
                    return Response.json({status:'applied',operationId:body.operationId,revision:current.revision,changes:[{entity:'profile',id:owner,row:current.profile}]});
                }
                if (url !== '/api/me') throw new Error('Unexpected fixture fetch: ' + url);
                const owner = window.fixtureActor;
                // Actual /api/me handler maps Auth429 to503 (account-security.test.mjs).
                if (['outage','auth-rate-limited'].includes(window.fixtureMode)) return Response.json({error:'Fixture unavailable'}, {status:503});
                if (window.fixtureMode === 'unauthorized' || !owner) return Response.json({error:'Fixture signed out'}, {status:401});
                const body = { user: account(owner), permissions: account(owner).permissions };
                // Deliberately ignore the old request's AbortSignal to prove the generation
                // guard protects against transports that complete after cancellation.
                if (window.deferNextAccount) {
                    window.deferNextAccount = false;
                    return new Promise(resolve => window.pendingAccounts.push(() => resolve(Response.json(body))));
                }
                return Response.json(body);
            };
            function reply(data, owner) {
                if (window.deferProfileOwner === owner) return new Promise(resolve => window.pendingProfiles.push(() => resolve({data,error:null})));
                return Promise.resolve({data,error:null});
            }
            window.fixtureDatabase = {
                auth: { onAuthStateChange(listener) {
                    window.fixtureAuthListener = listener;
                    queueMicrotask(() => listener('INITIAL_SESSION', {user:{id:window.fixtureActor}}));
                    return {data:{subscription:{unsubscribe(){}}}};
                } },
                from(table) {
                    let owner = window.fixtureActor;
                    let patch;
                    const query = {
                        select() { return query; }, order() { return query; },
                        eq(column,value) { if (column === 'user_id') owner = value; return query; },
                        update(value) { patch = value; return query; },
                        single() { return query; },
                        then(resolve,reject) {
                            if (patch) window.fixtureWrites.push({owner,table,patch});
                            return reply(tables(table,owner),owner).then(resolve,reject);
                        },
                    };
                    return query;
                },
                rpc(name,args) {
                    const owner = window.fixtureActor;
                    const read = data => ({abortSignal(signal){window.fixtureReadSignals.push(signal);return reply(data,owner);}});
                    if (name === 'get_profile_snapshot') return read(structuredClone(snapshot(owner)));
                    if (name === 'get_own_products') return reply(tables('products',owner),owner);
                    if (name === 'get_current_account') return read(account(owner));
                    if (name === 'update_account_settings') { window.fixtureWrites.push({owner,patch:args.p_patch}); return Promise.resolve({data:args.p_patch,error:null}); }
                    throw new Error('Unexpected fixture RPC: ' + name);
                },
            };
            window.changeFixtureActor = owner => {
                window.fixtureActor = owner;
                window.fixtureAuthListener(owner ? 'SIGNED_IN' : 'SIGNED_OUT', owner ? {user:{id:owner}} : null);
            };
            window.releaseFixtureAccounts = () => window.pendingAccounts.splice(0).forEach(release => release());
            window.releaseFixtureProfiles = () => { window.deferProfileOwner = null; window.pendingProfiles.splice(0).forEach(release => release()); };

            function Probe() {
                const user = useUser();
                const profile = useProfile();
                return <section>
                    <output data-testid="actor">{user.user?.id || 'signed-out'}</output>
                    <output data-testid="permissions">{JSON.stringify(user.user?.permissions || [])}</output>
                    <output data-testid="profile-loading">{String(profile.loading)}</output>
                    <output data-testid="fast-mode">{String(profile.fastMode)}</output>
                    <output data-testid="profile-status">{profile.loadError}</output>
                    <output data-testid="mutation-status">{profile.mutationState.status}</output>
                    <label>Draft bio<input aria-label="Draft bio" value={profile.profile?.bio || ''}
                        onChange={event => { void profile.patchProfile({bio:event.target.value}); }}/></label>
                    <button onClick={() => {void profile.patchProfile({headline:'Saved checkpoint'},true);}}>Save checkpoint</button>
                    <button disabled={!profile.canUndo} onClick={() => {void profile.undo();}}>Undo draft</button>
                    <button onClick={() => {void profile.setFastMode(!profile.fastMode);}}>Toggle Fast Mode</button>
                    <button onClick={() => {void user.refreshUser();}}>Refresh account</button>
                    <button onClick={() => {void profile.refreshProfile();}}>Refresh profile</button>
                    <pre data-testid="snapshot">{JSON.stringify({profile:profile.profile,links:profile.links,contacts:profile.contacts,
                        projects:profile.projects,products:profile.products,experiences:profile.experiences,qualifications:profile.qualifications})}</pre>
                </section>;
            }
            createRoot(document.getElementById('root')).render(<UserProvider><ProfileProvider><Probe/></ProfileProvider></UserProvider>);
        ` },
    });
    bundle = result.outputFiles[0].text;
});

async function fixture(page, { hangInitialProfile = false, initialAccountMode = 'ok' } = {}) {
    await page.route('**/*', route => {
        if (route.request().url() === 'https://nsso.test/session-fixture') return route.fulfill({ contentType: 'text/html', body: '<main id="root"></main>' });
        throw new Error(`Unexpected external request in isolated account fixture: ${route.request().url()}`);
    });
    await page.goto('https://nsso.test/session-fixture');
    await page.evaluate(({hang,mode}) => { window.fixtureHangInitialProfile = hang; window.fixtureInitialAccountMode = mode; }, {hang:hangInitialProfile,mode:initialAccountMode});
    await page.addScriptTag({content:bundle});
    if (initialAccountMode === 'outage') return;
    await expect(page.getByTestId('actor')).toHaveText('actor-a');
    if (hangInitialProfile) return;
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-a saved bio');
    await expect(page.getByTestId('profile-loading')).toHaveText('false');
    expect(await page.evaluate(() => window.fixtureRefreshes)).toBe(0);
}

test('an initial current-account outage shows Retry without a user and recovers the private profile', async ({page}) => {
    await fixture(page, {initialAccountMode:'outage'});
    await expect(page.getByTestId('actor')).toHaveText('signed-out');
    await expect(page.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
    await expect(page.getByTestId('permissions')).toHaveText('[]');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('');
    await page.evaluate(() => {window.fixtureMode='ok';});
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await expect(page.getByTestId('actor')).toHaveText('actor-a');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-a saved bio');
    await expect(page.getByRole('button',{name:'Retry',exact:true})).toHaveCount(0);
});

test('logout and account switching clear the real profile draft, collections, Undo and Fast Mode', async ({page}) => {
    await fixture(page);
    await page.getByRole('textbox',{name:'Draft bio'}).fill('actor-a unsaved private draft');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeEnabled();
    await page.getByRole('button',{name:'Toggle Fast Mode'}).click();
    await expect(page.getByTestId('fast-mode')).toHaveText('true');
    await page.evaluate(() => window.changeFixtureActor(null));
    await expect(page.getByTestId('actor')).toHaveText('signed-out');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeDisabled();
    await expect(page.getByTestId('fast-mode')).toHaveText('false');
    await expect(page.getByTestId('snapshot')).not.toContainText('actor-a');
    expect(await page.evaluate(() => window.fixtureRefreshes)).toBe(1);
    await page.evaluate(() => window.changeFixtureActor('actor-b'));
    await expect(page.getByTestId('actor')).toHaveText('actor-b');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-b saved bio');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeDisabled();
    await expect(page.getByTestId('snapshot')).not.toContainText('actor-a');
    await expect(page.getByTestId('permissions')).toHaveText('[]');
    expect(await page.evaluate(() => window.fixtureRefreshes)).toBe(2);
});

for (const mode of ['outage','auth-rate-limited']) test(`same-account ${mode}503 preserves the real draft and Undo, removes capabilities and exposes successful retry`, async ({page}) => {
    await fixture(page);
    await page.getByRole('button',{name:'Save checkpoint'}).click();
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeEnabled();
    await page.evaluate(() => {window.holdOperations=true;});
    await page.getByRole('textbox',{name:'Draft bio'}).fill('actor-a unsaved private draft');
    await page.evaluate(mode => {window.fixtureMode=mode;}, mode);
    await page.getByRole('button',{name:'Refresh account'}).click();
    await expect(page.locator('div[role="status"]')).toContainText('Your current draft is kept.');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-a unsaved private draft');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeEnabled();
    await expect(page.getByTestId('actor')).toHaveText('actor-a');
    await expect(page.getByTestId('permissions')).toHaveText('[]');
    await page.evaluate(() => {window.fixtureMode='ok';});
    await page.getByRole('button',{name:'Retry',exact:true}).click();
    await expect(page.locator('div[role="status"]')).toHaveCount(0);
    await expect(page.getByTestId('permissions')).toContainText('nsso:admin');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-a unsaved private draft');
    expect(await page.evaluate(() => window.fixtureRefreshes)).toBe(0);
});

test('same-subject sign-in and token events preserve drafts without refreshing server routes', async ({page}) => {
    await fixture(page);
    await page.evaluate(() => {window.holdOperations=true;});
    await page.getByRole('textbox',{name:'Draft bio'}).fill('actor-a unsaved private draft');
    await page.evaluate(() => {
        window.fixtureAuthListener('SIGNED_IN', {user:{id:'actor-a'}});
        window.fixtureAuthListener('TOKEN_REFRESHED', {user:{id:'actor-a'}});
    });
    await expect(page.getByTestId('actor')).toHaveText('actor-a');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-a unsaved private draft');
    expect(await page.evaluate(() => window.fixtureRefreshes)).toBe(0);
    await page.evaluate(() => window.changeFixtureActor('actor-b'));
    await expect(page.getByTestId('actor')).toHaveText('actor-b');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-b saved bio');
    expect(await page.evaluate(() => window.fixtureRefreshes)).toBe(1);
});

test('late account A responses cannot replace account B even when the fixture transport ignores abort', async ({page}) => {
    await fixture(page);
    await page.evaluate(() => {window.deferNextAccount=true;});
    await page.getByRole('button',{name:'Refresh account'}).click();
    await page.waitForFunction(() => window.pendingAccounts.length === 1);
    await page.evaluate(() => window.changeFixtureActor('actor-b'));
    await expect(page.getByTestId('actor')).toHaveText('actor-b');
    await page.evaluate(() => window.releaseFixtureAccounts());
    await expect(page.getByTestId('actor')).toHaveText('actor-b');
    await expect(page.getByTestId('permissions')).toHaveText('[]');
    await expect(page.getByTestId('snapshot')).not.toContainText('actor-a');
});

test('late account A profile collections cannot populate account B after the keyed provider unmounts', async ({page}) => {
    await fixture(page);
    await page.evaluate(() => {window.deferProfileOwner='actor-a';});
    await page.getByRole('button',{name:'Refresh profile'}).click();
    await page.waitForFunction(() => window.pendingProfiles.length > 0);
    await page.evaluate(() => { window.fixtureHeldReadSignals = window.fixtureReadSignals.slice(-2); });
    await page.evaluate(() => window.changeFixtureActor('actor-b'));
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-b saved bio');
    await page.evaluate(() => window.releaseFixtureProfiles());
    await expect(page.getByTestId('snapshot')).not.toContainText('actor-a');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-b saved bio');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeDisabled();
    expect(await page.evaluate(() => window.fixtureHeldReadSignals.every(signal => signal.aborted))).toBe(true);
});

test('a never-settling initial profile read ends loading, ignores its late reply and allows explicit recovery', async ({page}) => {
    await page.clock.install();
    await fixture(page, {hangInitialProfile:true});
    await page.waitForFunction(() => window.pendingProfiles.length >= 2);
    await page.clock.fastForward(8_001);
    await expect(page.getByTestId('profile-loading')).toHaveText('false');
    await expect(page.getByTestId('profile-status')).toContainText('Your draft has been kept.');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('');
    expect(await page.evaluate(() => window.fixtureReadSignals.every(signal => signal.aborted))).toBe(true);
    await page.evaluate(() => window.releaseFixtureProfiles());
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('');
    await page.getByRole('button',{name:'Refresh profile',exact:true}).click();
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-a saved bio');
    await expect(page.getByTestId('profile-status')).toHaveText('');
    expect(await page.evaluate(() => window.fixtureWrites)).toEqual([]);
});

test('a hanging refresh preserves the pending editing draft, mutation status and Undo history', async ({page}) => {
    await fixture(page);
    await page.getByRole('button',{name:'Save checkpoint'}).click();
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeEnabled();
    await page.clock.install();
    await page.evaluate(() => { window.holdOperations=true;window.deferProfileOwner='actor-a'; });
    await page.getByRole('textbox',{name:'Draft bio'}).fill('Keep my editing draft');
    await page.getByRole('button',{name:'Refresh profile',exact:true}).click();
    await page.waitForFunction(() => window.pendingProfiles.length >= 2);
    await page.clock.fastForward(8_001);
    await expect(page.getByTestId('profile-status')).toContainText('Your draft has been kept.');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('Keep my editing draft');
    await expect(page.getByTestId('mutation-status')).toHaveText('saving');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeEnabled();
    await page.evaluate(() => window.releaseFixtureProfiles());
    await page.getByRole('button',{name:'Refresh profile',exact:true}).click();
    await expect(page.getByTestId('profile-status')).toHaveText('');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('Keep my editing draft');
    await expect(page.getByTestId('mutation-status')).toHaveText('saving');
});

test('an explicit 401 still clears private state rather than preserving it as a network outage', async ({page}) => {
    await fixture(page);
    await page.getByRole('textbox',{name:'Draft bio'}).fill('actor-a unsaved private draft');
    await page.evaluate(() => {window.fixtureMode='unauthorized';});
    await page.getByRole('button',{name:'Refresh account'}).click();
    await expect(page.getByTestId('actor')).toHaveText('signed-out');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('');
    await expect(page.getByTestId('snapshot')).not.toContainText('actor-a');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeDisabled();
});
