import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
let bundle;
test.beforeAll(async () => {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'isolated-chat-context', setup(build) {
            build.onResolve({ filter: /^@\/(?:components\/providers\/(?:UserProvider|ProfileProvider)|components\/ui\/Toast|lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'chat-fixture' }));
            build.onLoad({ filter: /.*/, namespace: 'chat-fixture' }, ({ path }) => ({ contents:
                path.endsWith('UserProvider') ? `import {useSyncExternalStore} from 'react';
                    let value=window.fixtureBootstrapPending?{user:null,loading:true}:{user:{id:'fixture-account',username:'fixture'},loading:false};window.fixtureSessionOwner=value.user?.id;const listeners=new Set();
                    const subscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};
                    window.setFixtureIdentity=(user,loading)=>{value={user,loading};window.fixtureSessionOwner=user?.id;listeners.forEach(listener=>listener())};
                    window.setFixtureUser=user=>window.setFixtureIdentity(user,false);
                    export const useUser=()=>useSyncExternalStore(subscribe,()=>value);`
                : path.endsWith('ProfileProvider') ? `window.fixtureApplyCount=0;const noop=async()=>false;const value={updateField:noop,addLink:noop,updateLink:noop,removeLink:noop,reorderLinks:noop,addExperience:noop,addProject:noop,addQualification:noop,addProduct:noop,undo:noop,canUndo:false,fastMode:false,setFastMode:noop,revision:0,getRevision:()=>0,refreshProfile:async()=>{},applyOperation:async()=>{window.fixtureApplyCount++;return{status:'rejected',operationId:'fixture',revision:0,changes:[]}}};export const useProfile=()=>value;`
                : path.endsWith('Toast') ? `const showToast=()=>{};export const useToast=()=>({showToast});`
                : `window.fixtureIntroReads=[];
                    const client={auth:{getSession:async()=>({data:{session:Object.hasOwn(window,'fixtureSession')?window.fixtureSession:window.fixtureSessionOwner?{access_token:'fixture-only-token',user:{id:window.fixtureSessionOwner}}:null},error:window.fixtureSessionError??null})},from:()=>{
                        let owner;return{select(){return this},eq(_field,id){owner=id;return this},single:()=>window.fixtureDelayIntro
                            ? new Promise((resolve,reject)=>window.fixtureIntroReads.push({owner,resolve:profile=>resolve({data:profile}),reject}))
                            : Promise.resolve({data:{full_name:'Fixture Creator',bio:'Fixture bio'}})}
                    }};export const createClient=()=>client;`, loader: 'js', resolveDir: root }));
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';
            import Chat from './src/components/agent/AgentChatInterface';
            const root=createRoot(document.getElementById('root'));
            window.renderChat=props=>root.render(<React.StrictMode><Chat {...props}/></React.StrictMode>);
            window.renderInitial=initialMessage=>root.render(<React.StrictMode><Chat initialMessage={initialMessage}/></React.StrictMode>);
            window.renderShortcuts=shortcutRequests=>root.render(<React.StrictMode><Chat shortcutRequests={shortcutRequests}/></React.StrictMode>);
            window.unmountFixture=()=>root.render(null);
            const realFetch=window.fetch.bind(window);
            window.fixtureChatRequests=[];
            window.fixtureStreamAborts=0;
            window.fetch=(url,options)=>{
                if(window.fixtureStream && url==='/api/deity/chat'){
                    window.fixtureChatRequests.push(JSON.parse(options.body));
                    return Promise.resolve(new Response(new ReadableStream({start(controller){
                        window.fixtureStreamController=controller;
                        options.signal.addEventListener('abort',()=>{window.fixtureStreamAborts++;controller.error(new DOMException('Aborted','AbortError'))},{once:true});
                    }}),{headers:{'Content-Type':'text/plain'}}));
                }
                return realFetch(url,options);
            };
            window.fixtureChunk=text=>window.fixtureStreamController.enqueue(new TextEncoder().encode(text));
            window.fixtureFinish=()=>window.fixtureStreamController.close();
        ` },
    });
    bundle = result.outputFiles[0].text;
});

const runtimeErrors = new WeakMap();
test.beforeEach(({ page }) => {
    const errors = [];
    runtimeErrors.set(page, errors);
    page.on('pageerror', error => errors.push(error.message));
});
test.afterEach(({ page }) => { expect(runtimeErrors.get(page)).toEqual([]); });

async function openDelayedIntro(page, { stream = false, failChat = false, reply = 'Fixture response.', requests = [], bootstrap = false, props = {} } = {}) {
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
        if (url.pathname === '/api/deity/chat') {
            requests.push(route.request().postDataJSON().message);
            return failChat ? route.abort('failed') : route.fulfill({ contentType: 'text/plain', body: reply });
        }
        if (/\.(png|jpg)$/.test(url.pathname)) return route.fulfill({ status: 204 });
        throw new Error(`Unexpected network request in isolated chat fixture: ${url.href}`);
    });
    await page.goto('https://nsso.test/fixture');
    await page.evaluate(({ stream, bootstrap }) => { window.fixtureDelayIntro = true; window.fixtureStream = stream; window.fixtureBootstrapPending = bootstrap; }, { stream, bootstrap });
    await page.addScriptTag({ content: bundle });
    await page.evaluate(props => window.renderChat(props), props);
    if (bootstrap) {
        await expect(page.getByRole('status')).toHaveText('Loading Deity account…');
        await expect(page.getByRole('textbox', { name: 'Message Deity' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Send message', exact: true })).toHaveCount(0);
        return;
    }
    await expect(page.getByRole('textbox', { name: 'Message Deity' })).toBeEditable();
    // The development React bundle intentionally replays effects in StrictMode.
    // Keep both promises pending so tests can release stale/current reads apart.
    await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(2);
}

async function resolveIntro(page, indices, fullName = 'Current Creator') {
    await page.evaluate(({ indices, fullName }) => {
        indices.forEach(index => window.fixtureIntroReads[index].resolve({ full_name: fullName, bio: 'Fixture bio' }));
    }, { indices, fullName });
}

test('a terminal native-link proposal after a category tip renders one Review action without auto-saving', async ({ page }) => {
    const actions = [{ version: 1, label: 'Update link', change: { kind: 'link.patch', id: '22222222-2222-4222-8222-222222222222', patch: { link_name: 'Fixture renamed link' } } }];
    const prose = "I don't have extra context, but I can prepare that link change.\n\n💡 Tip: I noticed you were asking about AI Tools. Try selecting that category below for better search results!";
    await openDelayedIntro(page, { reply: prose + '\n__DEITY_ACTIONS__\n' + JSON.stringify(actions) + '\n' });
    await page.getByRole('textbox', { name: 'Message Deity' }).fill('Rename my fixture AI link.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    const apply = page.getByRole('button', { name: 'Apply suggested profile change', exact: true });
    await expect(apply).toHaveCount(1);
    await expect(page.getByRole('article', { name: 'Deity message' })).toContainText('Try selecting that category');
    await apply.locator('..').getByText('Review proposed values', { exact: true }).click();
    await expect(apply.locator('..').locator('dt')).toHaveText('link name');
    await expect(apply.locator('..').locator('dd')).toHaveText('Fixture renamed link');
    expect(await page.evaluate(() => window.fixtureApplyCount)).toBe(0);
    await page.getByRole('button', { name: 'Reject suggested profile change', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Rejected' })).toHaveCount(1);
    expect(await page.evaluate(() => window.fixtureApplyCount)).toBe(0);
});

test('an invalid-tool-only response displays explicit no-change feedback, with no proposal or automatic retry', async ({ page }) => {
    const requests = [];
    const feedback = 'Deity could not prepare a valid profile change. Nothing was changed. Please try again.';
    await openDelayedIntro(page, { reply: feedback, requests });
    await page.getByRole('textbox', { name: 'Message Deity' }).fill('Rename my fixture link.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Deity message' })).toHaveText(feedback);
    await expect(page.getByRole('button', { name: 'Apply suggested profile change', exact: true })).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Deity is responding', exact: true })).toHaveCount(0);
    expect(requests).toEqual(['Rename my fixture link.']);
    expect(await page.evaluate(() => window.fixtureApplyCount)).toBe(0);
});

for (const sessionState of ['missing', 'other-owner', 'auth-error']) {
    test(`a signed-in chat with ${sessionState} session fails closed before sending private history`, async ({ page }) => {
        const requests = [];
        await openDelayedIntro(page, { requests });
        await page.evaluate(state => {
            if (state === 'missing') window.fixtureSession = null;
            if (state === 'other-owner') window.fixtureSession = { access_token: 'fixture-only-other-token', user: { id: 'other-account' } };
            if (state === 'auth-error') window.fixtureSessionError = { status: 503 };
        }, sessionState);
        await page.getByRole('textbox', { name: 'Message Deity' }).fill('Prepare my profile change for review.');
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        await expect(page.getByRole('article', { name: 'Deity message' })).toContainText('Nothing was changed. Please sign in again');
        await expect(page.getByRole('button', { name: 'Apply suggested profile change', exact: true })).toHaveCount(0);
        await expect(page.getByRole('status', { name: 'Deity is responding', exact: true })).toHaveCount(0);
        expect(requests).toEqual([]);
        expect(await page.evaluate(() => window.fixtureApplyCount)).toBe(0);
    });
}

test('a verified browser session carries an owner consistency assertion, never an actor for persistence', async ({ page }) => {
    const requests = [];
    await openDelayedIntro(page, { stream: true, requests });
    await page.getByRole('textbox', { name: 'Message Deity' }).fill('Prepare my link change for review.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.fixtureChatRequests.length)).toBe(1);
    expect(await page.evaluate(() => window.fixtureChatRequests[0].expectedAccountId)).toBe('fixture-account');
    expect(await page.evaluate(() => window.fixtureApplyCount)).toBe(0);
    await page.evaluate(() => { window.fixtureChunk('No change requested by this fixture.'); window.fixtureFinish(); });
});

test('identity bootstrap has an accessible non-editable state, then keeps the first account draft', async ({ page }) => {
    await openDelayedIntro(page, { bootstrap: true });
    expect(await page.evaluate(() => window.fixtureIntroReads.length)).toBe(0);
    await page.evaluate(() => window.setFixtureUser({ id: 'fixture-account', username: 'fixture' }));
    await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(2);
    const composer = page.getByRole('textbox', { name: 'Message Deity' });
    await expect(composer).toBeEditable();
    await composer.fill('My first account draft\nMust stay intact.');
    await resolveIntro(page, [0, 1]);
    await expect(composer).toHaveValue('My first account draft\nMust stay intact.');
    // A refresh with a known identity is not a new account/bootstrap.
    await page.evaluate(() => window.setFixtureIdentity({ id: 'fixture-account', username: 'fixture' }, true));
    await expect(composer).toHaveValue('My first account draft\nMust stay intact.');
    await page.evaluate(() => window.setFixtureUser({ id: 'fixture-account', username: 'fixture' }));
    await expect(composer).toHaveValue('My first account draft\nMust stay intact.');
});

for (const kind of ['shortcut', 'initialMessage']) {
    test(`a bootstrap ${kind} waits for the resolved identity instead of becoming guest-owned`, async ({ page }) => {
        const requests = [];
        const props = kind === 'shortcut' ? { shortcutRequests: [{ id: 'bootstrap-request', message: 'Help the resolved account.' }] } : { initialMessage: 'Help the resolved account.' };
        await openDelayedIntro(page, { bootstrap: true, requests, props });
        expect(requests).toEqual([]);
        await page.evaluate(() => window.setFixtureUser({ id: 'fixture-account', username: 'fixture' }));
        await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(2);
        await resolveIntro(page, [0, 1]);
        await expect(page.getByRole('article', { name: 'Your message' })).toHaveText('Help the resolved account.');
        await expect(page.getByText('Fixture response.', { exact: true })).toHaveCount(1);
        expect(requests).toEqual(['Help the resolved account.']);
    });
}

test('unowned prompts during an established account transition fail closed but explicitly owned new events survive', async ({ page }) => {
    const requests = [];
    await openDelayedIntro(page, { requests });
    await resolveIntro(page, [0, 1]);
    await expect(page.getByText(/Love your profile Current/)).toHaveCount(1);
    await page.evaluate(() => window.setFixtureIdentity(null, true));
    await expect(page.getByRole('status')).toHaveText('Loading Deity account…');
    await page.evaluate(() => window.renderChat({ initialMessage: 'An unowned transition initial prompt.', shortcutRequests: [
        { id: 'unowned-transition', message: 'An unowned transition shortcut.' },
        { id: 'owned-transition', message: 'An explicitly owned second-account shortcut.', ownerId: 'second-account' },
    ] }));
    await page.evaluate(() => window.setFixtureUser({ id: 'second-account', username: 'second' }));
    await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(4);
    await resolveIntro(page, [2, 3], 'Second Creator');
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveText('An explicitly owned second-account shortcut.');
    await expect(page.getByText('Fixture response.', { exact: true })).toHaveCount(1);
    expect(requests).toEqual(['An explicitly owned second-account shortcut.']);
    await page.evaluate(() => window.renderInitial('A deliberate second-account initial prompt.'));
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(2);
    await expect(page.getByText('Fixture response.', { exact: true })).toHaveCount(2);
    expect(requests).toEqual(['An explicitly owned second-account shortcut.', 'A deliberate second-account initial prompt.']);
});

test('retained consumed and queued shortcuts cannot cross identities, while fresh owner-scoped events still work', async ({ page }) => {
    const retained = [
        { id: 'old-consumed', message: 'First account private request.', ownerId: 'fixture-account' },
        { id: 'old-queued', message: 'An explicitly requested update.', ownerId: 'fixture-account' },
    ];
    await openDelayedIntro(page, { stream: true, props: { shortcutRequests: retained } });
    await resolveIntro(page, [0, 1]);
    await expect.poll(() => page.evaluate(() => window.fixtureChatRequests.length)).toBe(1);
    await page.evaluate(() => window.fixtureChunk('First account pending response.'));
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveText(retained[0].message);
    await page.evaluate(() => window.setFixtureIdentity(null, true));
    await expect(page.getByRole('status')).toHaveText('Loading Deity account…');
    await expect.poll(() => page.evaluate(() => window.fixtureStreamAborts)).toBe(1);
    await page.evaluate(() => window.setFixtureUser({ id: 'second-account', username: 'second' }));
    await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(4);
    await resolveIntro(page, [2, 3], 'Second Creator');
    await expect(page.getByText(/Love your profile Second/)).toHaveCount(1);
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(0);
    expect(await page.evaluate(() => window.fixtureChatRequests.length)).toBe(1);
    const secondRequests = [...retained,
        { id: 'late-old-owner', message: 'A stale event from the old owner.', ownerId: 'fixture-account' },
        { id: 'new-second', message: retained[1].message, ownerId: 'second-account' },
    ];
    await page.evaluate(shortcutRequests => window.renderChat({ shortcutRequests }), secondRequests);
    await expect.poll(() => page.evaluate(() => window.fixtureChatRequests.length)).toBe(2);
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveText(retained[1].message);
    await page.evaluate(() => { window.fixtureChunk('Second account response.'); window.fixtureFinish(); });
    await expect(page.getByRole('status', { name: 'Deity is responding', exact: true })).toHaveCount(0);
    await page.evaluate(() => window.setFixtureUser(null));
    await expect(page.getByText(/Hey creator/)).toHaveCount(1);
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(0);
    await page.evaluate(() => window.setFixtureUser({ id: 'fixture-account', username: 'fixture' }));
    await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(6);
    await resolveIntro(page, [4, 5], 'Returned Creator');
    await expect(page.getByText(/Love your profile Returned/)).toHaveCount(1);
    expect(await page.evaluate(() => window.fixtureChatRequests.length)).toBe(2);
    await page.evaluate(shortcutRequests => window.renderChat({ shortcutRequests }), [...secondRequests, { id: 'new-returned', message: 'A fresh request after returning.', ownerId: 'fixture-account' }]);
    await expect.poll(() => page.evaluate(() => window.fixtureChatRequests.length)).toBe(3);
    await page.evaluate(() => { window.fixtureChunk('Returned account response.'); window.fixtureFinish(); });
    await expect(page.getByRole('status', { name: 'Deity is responding', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => window.fixtureChatRequests.map(request => request.message))).toEqual([retained[0].message, retained[1].message, 'A fresh request after returning.']);
});

for (const consumed of [false, true]) {
    test(`a retained ${consumed ? 'consumed' : 'queued'} initialMessage never replays after an identity transition`, async ({ page }) => {
        await openDelayedIntro(page, { stream: true, props: { initialMessage: 'First account initial request.' } });
        if (consumed) {
            await resolveIntro(page, [0, 1]);
            await expect.poll(() => page.evaluate(() => window.fixtureChatRequests.length)).toBe(1);
            await page.evaluate(() => window.fixtureChunk('First account response.'));
        }
        await page.evaluate(() => window.setFixtureUser({ id: 'second-account', username: 'second' }));
        await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(4);
        await resolveIntro(page, [0, 1], 'Stale Creator');
        await resolveIntro(page, [2, 3], 'Second Creator');
        await expect(page.getByText(/Love your profile Second/)).toHaveCount(1);
        await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(0);
        expect(await page.evaluate(() => window.fixtureChatRequests.length)).toBe(consumed ? 1 : 0);
        await page.evaluate(() => window.renderInitial('A fresh second account request.'));
        await expect(page.getByRole('article', { name: 'Your message' })).toHaveText('A fresh second account request.');
        await expect.poll(() => page.evaluate(() => window.fixtureChatRequests.length)).toBe(consumed ? 2 : 1);
        await page.evaluate(() => { window.fixtureChunk('Second account response.'); window.fixtureFinish(); });
        await expect(page.getByRole('status', { name: 'Deity is responding', exact: true })).toHaveCount(0);
        await page.evaluate(() => window.setFixtureUser(null));
        await expect(page.getByText(/Hey creator/)).toHaveCount(1);
        await page.evaluate(() => window.setFixtureUser({ id: 'fixture-account', username: 'fixture' }));
        await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(6);
        await resolveIntro(page, [4, 5], 'Returned Creator');
        await expect(page.getByText(/Love your profile Returned/)).toHaveCount(1);
        await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(0);
        expect(await page.evaluate(() => window.fixtureChatRequests.map(request => request.message))).toEqual(consumed ? ['First account initial request.', 'A fresh second account request.'] : ['A fresh second account request.']);
    });
}

test('typing during the intro read preserves the complete unsent draft and inserts one welcome', async ({ page }) => {
    await openDelayedIntro(page);
    const composer = page.getByRole('textbox', { name: 'Message Deity' });
    await composer.fill('My work\nMy passions\nMy goals');
    await resolveIntro(page, [1]);
    await expect(page.getByRole('article', { name: 'Deity message' }).filter({ hasText: 'Love your profile Current' })).toHaveCount(1);
    await resolveIntro(page, [0], 'Stale Creator');
    await expect(page.getByRole('article', { name: 'Deity message' })).toHaveCount(2);
    await expect(page.getByText(/Love your profile Stale/)).toHaveCount(0);
    await expect(composer).toHaveValue('My work\nMy passions\nMy goals');
});

for (const failChat of [false, true]) {
    test(`a late intro cannot replace a user message or ${failChat ? 'network error' : 'completed reply'}`, async ({ page }) => {
        const requests = [];
        await openDelayedIntro(page, { failChat, requests });
        const composer = page.getByRole('textbox', { name: 'Message Deity' });
        await composer.fill('Keep this early message.');
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        const reply = failChat ? 'Deity could not finish that response. Please try again.' : 'Fixture response.';
        await expect(page.getByRole('article', { name: 'Deity message' })).toHaveText(reply);
        await composer.fill('Keep the next draft too.');
        await resolveIntro(page, [0, 1]);
        await expect(page.getByRole('article', { name: 'Your message' })).toHaveText('Keep this early message.');
        await expect(page.getByRole('article', { name: 'Deity message' })).toHaveText(reply);
        await expect(composer).toHaveValue('Keep the next draft too.');
        await expect(page.getByText(/Love your profile/)).toHaveCount(0);
        expect(requests).toEqual(['Keep this early message.']);
    });
}

test('a late intro preserves an active stream and its eventual reviewable proposal', async ({ page }) => {
    await openDelayedIntro(page, { stream: true });
    await page.getByRole('textbox', { name: 'Message Deity' }).fill('Suggest a clearer headline.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(window.fixtureStreamController))).toBe(true);
    await page.evaluate(() => window.fixtureChunk('A clearer '));
    await expect(page.getByRole('article', { name: 'Deity message' })).toHaveText('A clearer ');
    await resolveIntro(page, [0, 1]);
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveText('Suggest a clearer headline.');
    await expect(page.getByRole('article', { name: 'Deity message' })).toHaveText('A clearer ');
    await page.evaluate(() => {
        window.fixtureChunk('headline.\n__DEITY_ACTIONS__\n' + JSON.stringify([{ version: 1, label: 'Update headline', change: { kind: 'profile.patch', patch: { headline: 'Fixture clearer headline' } } }]));
        window.fixtureFinish();
    });
    await expect(page.getByRole('article', { name: 'Deity message' })).toHaveText('A clearer headline.');
    await expect(page.getByRole('button', { name: 'Apply suggested profile change', exact: true })).toHaveCount(1);
    await expect(page.getByRole('status', { name: 'Deity is responding', exact: true })).toHaveCount(0);
    await expect(page.getByText(/Love your profile/)).toHaveCount(0);
    expect(await page.evaluate(() => window.fixtureChatRequests.map(request => request.message))).toEqual(['Suggest a clearer headline.']);
});

test('StrictMode ignores a stale intro completion and consumes a queued shortcut only once', async ({ page }) => {
    const requests = [];
    await openDelayedIntro(page, { requests });
    await page.evaluate(() => window.renderShortcuts([{ id: 'queued', message: 'A queued shortcut.' }]));
    await resolveIntro(page, [0], 'Stale Creator');
    await expect(page.getByRole('article')).toHaveCount(0);
    expect(requests).toEqual([]);
    await resolveIntro(page, [1]);
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveText('A queued shortcut.');
    await expect(page.getByText('Fixture response.', { exact: true })).toHaveCount(1);
    await page.evaluate(() => window.renderShortcuts([{ id: 'queued', message: 'A queued shortcut.' }]));
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(1);
    await expect(page.getByText(/Love your profile Current/)).toHaveCount(1);
    expect(requests).toEqual(['A queued shortcut.']);
});

test('unmount invalidates pending intro and category replies before reopening a clean chat', async ({ page }) => {
    await page.clock.install();
    await openDelayedIntro(page);
    await page.getByRole('button', { name: 'What you can ask me about' }).click();
    await page.getByRole('button', { name: 'Career', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(1);
    await page.evaluate(() => window.unmountFixture());
    await expect(page.getByRole('textbox', { name: 'Message Deity' })).toHaveCount(0);
    await page.evaluate(() => window.renderShortcuts([]));
    await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(4);
    await resolveIntro(page, [0, 1], 'Old Creator');
    await page.clock.fastForward(650);
    await expect(page.getByRole('article')).toHaveCount(0);
    await resolveIntro(page, [2, 3], 'Reopened Creator');
    await expect(page.getByRole('article', { name: 'Deity message' })).toHaveCount(2);
    await expect(page.getByText(/Love your profile Reopened/)).toHaveCount(1);
    await expect(page.getByText(/Here are some things you could ask/)).toHaveCount(0);
});

test('switching accounts aborts the old stream and rejects its pending intro without leaking a draft', async ({ page }) => {
    await openDelayedIntro(page, { stream: true });
    const composer = page.getByRole('textbox', { name: 'Message Deity' });
    await composer.fill('First account private question.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(window.fixtureStreamController))).toBe(true);
    await page.evaluate(() => window.fixtureChunk('First account private answer.'));
    await expect(page.getByRole('article', { name: 'Deity message' })).toHaveText('First account private answer.');
    await composer.fill('First account unsent draft.');
    await page.evaluate(() => window.setFixtureUser({ id: 'second-account', username: 'second' }));
    await expect.poll(() => page.evaluate(() => window.fixtureIntroReads.length)).toBe(4);
    await expect.poll(() => page.evaluate(() => window.fixtureStreamAborts)).toBe(1);
    await expect(composer).toHaveValue('');
    await expect(page.getByRole('article')).toHaveCount(0);
    await resolveIntro(page, [0, 1], 'Old Creator');
    await expect(page.getByRole('article')).toHaveCount(0);
    await resolveIntro(page, [2, 3], 'Second Creator');
    await expect(page.getByRole('article', { name: 'Deity message' })).toHaveCount(2);
    await expect(page.getByText(/Love your profile Second/)).toHaveCount(1);
    await expect(page.getByText(/First account|Old Creator/)).toHaveCount(0);
    await expect(page.getByRole('status', { name: 'Deity is responding', exact: true })).toHaveCount(0);
});

test('identical shortcut events enqueue once each and the multiline composer preserves line breaks', async ({ page }) => {
    const requests = [];
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
        if (url.pathname === '/api/deity/chat') {
            requests.push(route.request().postDataJSON().message);
            return route.fulfill({ contentType: 'text/plain', body: 'Fixture response.' });
        }
        return route.fulfill({ status: 204 });
    });
    await page.goto('https://nsso.test/fixture');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => window.renderShortcuts([{ id: 'first', message: 'Help with my bio.' }, { id: 'second', message: 'Help with my bio.' }]));
    await expect.poll(() => requests.length).toBe(2);
    await page.evaluate(() => window.renderShortcuts([{ id: 'first', message: 'Help with my bio.' }, { id: 'second', message: 'Help with my bio.' }]));
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(2);
    const composer = page.getByRole('textbox', { name: 'Message Deity' });
    await expect(composer).toHaveJSProperty('tagName', 'TEXTAREA');
    await composer.fill('First paragraph\nSecond paragraph');
    await expect(composer).toHaveValue('First paragraph\nSecond paragraph');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect.poll(() => requests.at(-1)).toBe('First paragraph\nSecond paragraph');
    expect(requests.filter(message => message === 'Help with my bio.')).toHaveLength(2);
});

test('database information opens on demand, traps focus and has a visible dismiss action', async ({ page }) => {
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
    await page.goto('https://nsso.test/fixture');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => window.renderShortcuts([]));
    await page.getByRole('button', { name: 'What you can ask me about' }).click();
    const trigger = page.getByRole('button', { name: 'nsso DATABASE', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: 'About the nsso database' });
    await expect(dialog).toBeVisible();
    const dismiss = dialog.getByRole('button', { name: 'Close database information' });
    await expect(dismiss).toBeFocused();
    await dismiss.click();
    await expect(dialog).toHaveCount(0);
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
});

test('initial prompts send once after initialization and do not replay on streaming or placeholder rerenders', async ({ page }) => {
    const requests = [];
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
        if (url.pathname === '/api/deity/chat') {
            requests.push(route.request().postDataJSON().message);
            return route.fulfill({ contentType: 'text/plain', body: 'Fixture response.' });
        }
        if (/\.(png|jpg)$/.test(url.pathname)) return route.fulfill({ status: 204 });
        throw new Error(`Unexpected network request in isolated chat fixture: ${url.href}`);
    });
    await page.clock.install();
    await page.goto('https://nsso.test/fixture');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(() => window.renderInitial('Help me write my bio.'));
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveText('Help me write my bio.');
    await expect(page.getByText('Fixture response.')).toBeVisible();
    await page.clock.fastForward(6500);
    await page.evaluate(() => window.renderInitial('Help me write my bio.'));
    expect(requests).toEqual(['Help me write my bio.']);
    await page.evaluate(() => window.renderInitial('Help me write my headline.'));
    await expect(page.getByRole('article', { name: 'Your message' })).toHaveCount(2);
    await expect(page.getByText('Fixture response.', { exact: true })).toHaveCount(2);
    expect(requests).toEqual(['Help me write my bio.', 'Help me write my headline.']);
});
