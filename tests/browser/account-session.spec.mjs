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
            builder.onLoad({ filter: /.*/, namespace: 'fixture-backend' }, () => ({ contents: 'export const createClient = () => window.fixtureDatabase;', loader: 'js' }));
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';
            import { createRoot } from 'react-dom/client';
            import { UserProvider, useUser } from './src/components/providers/UserProvider';
            import { ProfileProvider, useProfile } from './src/components/providers/ProfileProvider';

            window.fixtureActor = 'actor-a';
            window.fixtureMode = 'ok';
            window.pendingAccounts = [];
            window.pendingProfiles = [];
            window.deferNextAccount = false;
            window.deferProfileOwner = null;
            window.fixtureWrites = [];
            const account = owner => ({ id: owner, username: owner, user_type: owner === 'actor-a' ? 'admin' : 'standard',
                is_premium: true, deity_fast_mode: false, permissions: owner === 'actor-a' ? ['nsso:admin','razinflix:manage'] : [] });
            const tables = (table, owner) => table === 'profiles'
                ? { user_id: owner, full_name: owner, bio: owner + ' saved bio', headline: owner + ' headline' }
                : [{ id: owner + '-' + table, user_id: owner, name: owner + ' private ' + table }];
            window.fetch = async (url, init) => {
                if (url !== '/api/me') throw new Error('Unexpected fixture fetch: ' + url);
                const owner = window.fixtureActor;
                if (window.fixtureMode === 'outage') return Response.json({error:'Fixture unavailable'}, {status:503});
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
                auth: { onAuthStateChange(listener) { window.fixtureAuthListener = listener; return {data:{subscription:{unsubscribe(){}}}}; } },
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
                    if (name === 'get_own_products') return reply(tables('products',owner),owner);
                    if (name === 'get_current_account') return reply(account(owner),owner);
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
                    <label>Draft bio<input aria-label="Draft bio" value={profile.profile?.bio || ''}
                        onChange={event => { void profile.updateField('bio', event.target.value, false); }}/></label>
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

async function fixture(page) {
    await page.route('**/*', route => {
        if (route.request().url() === 'https://nsso.test/session-fixture') return route.fulfill({ contentType: 'text/html', body: '<main id="root"></main>' });
        throw new Error(`Unexpected external request in isolated account fixture: ${route.request().url()}`);
    });
    await page.goto('https://nsso.test/session-fixture');
    await page.addScriptTag({content:bundle});
    await expect(page.getByTestId('actor')).toHaveText('actor-a');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-a saved bio');
    await expect(page.getByTestId('profile-loading')).toHaveText('false');
}

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
    await page.evaluate(() => window.changeFixtureActor('actor-b'));
    await expect(page.getByTestId('actor')).toHaveText('actor-b');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-b saved bio');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeDisabled();
    await expect(page.getByTestId('snapshot')).not.toContainText('actor-a');
    await expect(page.getByTestId('permissions')).toHaveText('[]');
});

test('a same-account 503 preserves the real draft and Undo, removes capabilities and exposes successful retry', async ({page}) => {
    await fixture(page);
    await page.getByRole('textbox',{name:'Draft bio'}).fill('actor-a unsaved private draft');
    await page.evaluate(() => {window.fixtureMode='outage';});
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
    await page.evaluate(() => window.changeFixtureActor('actor-b'));
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-b saved bio');
    await page.evaluate(() => window.releaseFixtureProfiles());
    await expect(page.getByTestId('snapshot')).not.toContainText('actor-a');
    await expect(page.getByRole('textbox',{name:'Draft bio'})).toHaveValue('actor-b saved bio');
    await expect(page.getByRole('button',{name:'Undo draft'})).toBeDisabled();
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
