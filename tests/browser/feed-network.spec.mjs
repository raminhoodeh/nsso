import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const actor = '11111111-1111-4111-8111-111111111111';
const postId = '22222222-2222-4222-8222-222222222222';
const alice = '33333333-3333-4333-8333-333333333333';
const blair = '44444444-4444-4444-8444-444444444444';
let bundle;
test.beforeAll(async () => {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'feed-network-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:image|link)|@\/components\/providers\/(?:UserProvider|ProfileProvider|UIProvider)|@\/components\/ui\/Toast|@\/app\/dashboard\/components\/DashboardGlassCard|\.\/NetworkingTimeline)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/image' ? 'export default function Image({fill,unoptimized,...props}){return <img {...props}/>;}' :
                path === 'next/link' ? 'export default function Link(props){return <a {...props}/>;}' :
                path.endsWith('UserProvider') ? `export const useUser=()=>({user:{id:'${actor}',username:'fixture'}});` :
                path.endsWith('ProfileProvider') ? `export const useProfile=()=>({profile:{full_name:'Fixture Creator'}});` :
                path.endsWith('UIProvider') ? 'const noop=()=>{};export const useUI=()=>({setBackgroundDimmed:noop});' :
                path.endsWith('Toast') ? 'export const useToast=()=>({showToast:(text)=>window.fixtureToasts.push(text)});' :
                path.endsWith('NetworkingTimeline') ? 'export default function Timeline({connections,onOpenNotes}){return <div>{connections.map(c=><button key={c.id} onClick={()=>onOpenNotes(c)}>Timeline notes for {c.fullName}</button>)}</div>;}' :
                'export default function Card({children,className}){return <div className={className}>{children}</div>;}'
            }));
        }}],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';
            import FeedItemCard from './src/app/dashboard/components/FeedItemCard';
            import CreatePostCard from './src/app/dashboard/components/CreatePostCard';
            import MyNssoTab from './src/app/dashboard/components/MyNssoTab';
            const connections=[{id:'${alice}',connectedUserId:'alice',username:'alice',fullName:'Alice Fixture',headline:null,profilePicUrl:null,dateMet:'2026-10-01',location:window.fixtureExistingLocation || '',notes:'Alice saved notes'},{id:'${blair}',connectedUserId:'blair',username:'blair',fullName:'Blair Fixture',headline:null,profilePicUrl:null,dateMet:'2026-10-02',location:'',notes:'Blair saved notes'}];
            window.fixtureToasts=[];window.fixtureCreated=[];
            const post={id:'${postId}',user_id:'${actor}',type:'manual',content:'Original fixture post',metadata:{},created_at:'2026-10-01T12:00:00Z',user:{username:'fixture',profile:{full_name:'Fixture Creator',profile_pic_url:null}},likes:[],_count:{feed_comments:0}};
            createRoot(document.getElementById('root')).render(<React.StrictMode><section data-testid="composer"><CreatePostCard onPostCreated={post=>window.fixtureCreated.push(post)}/></section><section data-testid="feed"><FeedItemCard post={post} currentUserId="${actor}"/></section><section data-testid="network"><MyNssoTab initialData={window.fixtureNoNetworkSeed ? undefined : {connections}}/></section></React.StrictMode>);
        ` },
    });
    bundle = result.outputFiles[0].text;
});
async function fixture(page, { noNetworkSeed = false, existingLocation = '', networkStatus = 200 } = {}) {
    const state = { networkStatus, likeStatus: 200, commentStatus: 200, postStatus: 200, deleteStatus: 200, patchStatus: 200, commentsStatus: 200, requests: [], comments: [], memberships: [alice, blair], reciprocalMemberships: ['their-record-of-me'], hold: null };
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' });
        state.requests.push({ path: url.pathname, method, body: request.postData() });
        const json = (status, data) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
        if (url.pathname.endsWith('/like')) {
            if (state.hold?.kind === 'like') await state.hold.promise;
            return json(state.likeStatus, state.likeStatus === 200 ? { success: true } : { error: 'PRIVATE_UPSTREAM_ERROR_DO_NOT_RENDER' });
        }
        if (url.pathname.endsWith('/comments')) {
            if (method === 'GET') return json(state.commentsStatus, state.commentsStatus === 200 ? state.comments : { error: 'PRIVATE_UPSTREAM_ERROR_DO_NOT_RENDER' });
            if (state.hold?.kind === 'comment') await state.hold.promise;
            const comment = { id: 'new-comment', content: request.postDataJSON().content, created_at: '2026-10-26T12:00:00Z', user: { username: 'fixture', full_name: 'Fixture Creator' } };
            if (state.commentStatus === 200) state.comments.push(comment);
            return json(state.commentStatus, state.commentStatus === 200 ? comment : { error: 'PRIVATE_UPSTREAM_ERROR_DO_NOT_RENDER' });
        }
        if (url.pathname === '/api/news-feed') {
            if (state.hold?.kind === 'post') await state.hold.promise;
            return json(state.postStatus, state.postStatus === 200 ? { id: 'saved-post', content: request.postDataJSON().content } : { error: 'PRIVATE_UPSTREAM_ERROR_DO_NOT_RENDER' });
        }
        if (url.pathname === '/api/my-nsso/connections') { if (state.hold?.kind === 'network') await state.hold.promise; return json(state.networkStatus, state.networkStatus === 200 ? { connections: [] } : { error: 'PRIVATE_UPSTREAM_ERROR_DO_NOT_RENDER' }); }
        if (url.pathname.startsWith('/api/my-nsso/connections/')) {
            if (method === 'PATCH') { if (state.hold?.kind === 'location') await state.hold.promise; return json(state.patchStatus, { success: state.patchStatus === 200 }); }
            expect(method).toBe('DELETE');
            if (state.deleteStatus === 200) state.memberships = state.memberships.filter(id => id !== url.pathname.split('/').at(-1));
            return json(state.deleteStatus, state.deleteStatus === 200 ? { success: true } : { error: 'PRIVATE_UPSTREAM_ERROR_DO_NOT_RENDER' });
        }
        throw new Error('Unexpected fixture request ' + method + ' ' + url.href);
    });
    await page.goto('https://nsso.test/fixture');
    await page.evaluate(({ noNetworkSeed, existingLocation }) => { window.fixtureNoNetworkSeed = noNetworkSeed; window.fixtureExistingLocation = existingLocation; }, { noNetworkSeed, existingLocation });
    await page.addScriptTag({ content: bundle });
    await expect(page.getByTestId('feed')).toContainText('Original fixture post');
    return state;
}
function hold(state, kind) {
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    state.hold = { kind, promise };
    return () => { state.hold = null; release(); };
}
for (const status of [429, 503]) test(`like HTTP ${status} reverts the optimistic state and permits a truthful retry`, async ({ page }) => {
    const state = await fixture(page);state.likeStatus = status;
    const feed = page.getByTestId('feed'), release = hold(state, 'like');
    await feed.getByRole('button', { name: 'Like post', exact: true }).click();
    const pending = feed.getByRole('button', { name: 'Unlike post', exact: true });
    await expect(pending).toBeDisabled();await expect(pending).toHaveAttribute('aria-pressed', 'true');
    await expect(pending).toContainText('1');
    release();
    await expect(feed.getByRole('button', { name: 'Like post', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(feed.getByRole('alert')).toContainText(status === 429 ? 'Too many requests' : 'could not be saved');
    await expect(feed.getByRole('button', { name: 'Like post', exact: true })).toContainText('Love');
    expect(state.requests.filter(r => r.path.endsWith('/like'))).toHaveLength(1);
    state.likeStatus = 200;await feed.getByRole('button', { name: 'Like post', exact: true }).click();
    await expect(feed.getByRole('button', { name: 'Unlike post', exact: true })).toBeEnabled();
    await expect(feed.getByRole('alert')).toHaveCount(0);
    await expect(feed).not.toContainText('PRIVATE_UPSTREAM_ERROR');
});

test('comment 400/429/503 failures retain the draft and count; a successful response preserves newer typing', async ({ page }) => {
    const state = await fixture(page), feed = page.getByTestId('feed');
    await feed.getByRole('button', { name: 'Comment', exact: true }).click();
    const input = feed.getByRole('textbox', { name: 'Comment', exact: true });
    await input.fill('My retained comment');
    for (const status of [400, 429, 503]) {
        state.commentStatus = status;await feed.getByRole('button', { name: 'Post', exact: true }).click();
        await expect(feed.getByRole('alert')).toContainText(status === 400 ? '4,000' : status === 429 ? 'Too many requests' : 'draft is still here');
        await expect(input).toHaveValue('My retained comment');
        await expect(feed.getByRole('button', { name: 'Comment', exact: true })).toBeVisible();
    }
    state.commentStatus = 200;const release = hold(state, 'comment');
    await feed.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(feed.getByRole('button', { name: 'Post', exact: true })).toBeDisabled();
    await input.fill('A newer unsent comment');release();
    await expect(input).toHaveValue('A newer unsent comment');
    await expect(feed.getByText('My retained comment', { exact: true })).toBeVisible();
    expect(state.comments).toHaveLength(1);
    await expect(feed).not.toContainText('PRIVATE_UPSTREAM_ERROR');
});

test('post 400/429/503 failures keep the expanded draft; successful posting keeps newer unsent text', async ({ page }) => {
    const state = await fixture(page), composer = page.getByTestId('composer');
    await composer.getByRole('button', { name: 'Share a project idea or update...' }).click();
    const input = composer.getByRole('textbox', { name: 'Your post' });
    await input.fill('My retained post');
    for (const status of [400, 429, 503]) {
        state.postStatus = status;await composer.getByRole('button', { name: 'Post', exact: true }).click();
        await expect(composer.getByRole('alert')).toContainText(status === 400 ? '4,000' : status === 429 ? 'Too many requests' : 'draft is still here');
        await expect(input).toHaveValue('My retained post');
        expect(await page.evaluate(() => window.fixtureCreated)).toHaveLength(0);
    }
    state.postStatus = 200;const release = hold(state, 'post');
    await composer.getByRole('button', { name: 'Post', exact: true }).click();
    await expect(composer.getByRole('button', { name: 'Posting...', exact: true })).toBeDisabled();
    await input.fill('A newer unsent post');release();
    await expect(composer.getByRole('button', { name: 'Post', exact: true })).toBeEnabled();
    await expect(input).toHaveValue('A newer unsent post');
    expect(await page.evaluate(() => window.fixtureCreated.map(p => p.content))).toEqual(['My retained post']);
    await expect(composer).not.toContainText('PRIVATE_UPSTREAM_ERROR');
});

test('comment loading failure is visible and can retry without hiding the composer', async ({ page }) => {
    const state = await fixture(page), feed = page.getByTestId('feed');state.commentsStatus = 503;
    await feed.getByRole('button', { name: 'Comment', exact: true }).click();
    await expect(feed.getByRole('alert')).toContainText('Comments could not be loaded');
    await expect(feed.getByRole('textbox', { name: 'Comment', exact: true })).toBeVisible();
    state.commentsStatus = 200;await feed.getByRole('button', { name: 'Retry loading comments' }).click();
    await expect(feed.getByRole('alert')).toHaveCount(0);
});

test('removal requires local confirmation, retains notes on failure, and removes only this membership after success', async ({ page }) => {
    const state = await fixture(page), network = page.getByTestId('network');
    await network.getByRole('button', { name: 'Edit notes for Alice Fixture', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Notes for Alice Fixture', exact: true });
    const notes = dialog.getByRole('textbox', { name: 'Connection notes' });
    await notes.fill('Unsaved private notes');
    await dialog.getByRole('button', { name: 'Remove from My nsso', exact: true }).click();
    await expect(dialog).toContainText('Their record of you stays unchanged.');
    await expect(dialog).toContainText('including any unsaved notes');
    expect(state.requests.filter(r => r.method === 'DELETE')).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Keep connection' }).click();
    await expect(notes).toHaveValue('Unsaved private notes');
    expect(state.requests.filter(r => r.method === 'DELETE')).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Remove from My nsso', exact: true }).click();
    state.deleteStatus = 503;await dialog.getByRole('button', { name: 'Confirm removal' }).click();
    await expect(dialog.getByRole('alert')).toContainText('could not be removed');
    await expect(notes).toHaveValue('Unsaved private notes');
    expect(state.memberships).toEqual([alice, blair]);
    state.deleteStatus = 200;await dialog.getByRole('button', { name: 'Confirm removal' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(network.getByRole('button', { name: 'Edit notes for Alice Fixture', exact: true })).toHaveCount(0);
    await expect(network.getByRole('button', { name: 'Edit notes for Blair Fixture', exact: true })).toBeVisible();
    expect(state.memberships).toEqual([blair]);expect(state.reciprocalMemberships).toEqual(['their-record-of-me']);
    expect(state.requests.filter(r => r.method === 'DELETE').every(r => r.path === '/api/my-nsso/connections/' + alice)).toBe(true);
});

test('notes state resets by connection and failed saves keep the current draft', async ({ page }) => {
    const state = await fixture(page), network = page.getByTestId('network');
    await network.getByRole('button', { name: 'Edit notes for Alice Fixture', exact: true }).click();
    await page.getByRole('textbox', { name: 'Connection notes' }).fill('Alice unsaved');
    await page.getByRole('button', { name: 'Close notes dialog' }).click();
    await network.getByRole('button', { name: 'Timeline notes for Blair Fixture', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Notes for Blair Fixture', exact: true });
    await expect(dialog.getByRole('textbox', { name: 'Connection notes' })).toHaveValue('Blair saved notes');
    await dialog.getByRole('textbox', { name: 'Connection notes' }).fill('Blair retained draft');
    state.patchStatus = 503;await dialog.getByRole('button', { name: 'Save Notes', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('draft is still here');
    await expect(dialog.getByRole('textbox', { name: 'Connection notes' })).toHaveValue('Blair retained draft');
    await expect(dialog.getByRole('button', { name: 'Save Notes', exact: true })).toBeEnabled();
    state.patchStatus = 200;await dialog.getByRole('button', { name: 'Save Notes', exact: true }).click();
    await expect(dialog).toHaveCount(0);
});


test('network loading failure is visible and retries without inventing an empty successful network', async ({ page }) => {
    const state = await fixture(page, { noNetworkSeed: true, networkStatus: 503 });
    const network = page.getByTestId('network');
    await expect(network.getByRole('alert')).toContainText('Your connections could not be loaded');
    await expect(network).not.toContainText('PRIVATE_UPSTREAM_ERROR');
    state.networkStatus = 200;
    await network.getByRole('button', { name: 'Retry connections', exact: true }).click();
    await expect(network.getByRole('alert')).toHaveCount(0);
    await expect(network).toContainText('No connections found.');
});

test('an existing meeting location is keyboard editable; duplicate Enter/blur cannot double-save', async ({ page }) => {
    const state = await fixture(page, { existingLocation: 'Original conference' });
    const network = page.getByTestId('network');
    await network.getByRole('button', { name: 'Edit location for Alice Fixture', exact: true }).click();
    const input = network.getByRole('textbox', { name: 'Location for Alice Fixture', exact: true });
    await expect(input).toHaveValue('Original conference');
    await input.fill('Corrected meeting place');
    const release = hold(state, 'location');
    await input.press('Enter');
    await expect(input).toBeDisabled();
    await expect(network.getByRole('button', { name: 'Edit location for Blair Fixture', exact: true })).toBeDisabled();
    await page.getByRole('heading', { name: 'My nsso Network', exact: true }).click();
    expect(state.requests.filter(r => r.method === 'PATCH')).toHaveLength(1);
    release();
    await expect(network.getByRole('button', { name: 'Edit location for Alice Fixture', exact: true })).toHaveText('Corrected meeting place');
    expect(state.requests.filter(r => r.method === 'PATCH').map(r => JSON.parse(r.body))).toEqual([{ location: 'Corrected meeting place' }]);
});


test('a stalled connection reload reaches a bounded retry state and ignores its late response', async ({ page }) => {
    await page.clock.install();
    const state = await fixture(page, { noNetworkSeed: true, networkStatus: 503 });
    const network = page.getByTestId('network');
    await expect(network.getByRole('alert')).toBeVisible();
    const release = hold(state, 'network'); state.networkStatus = 200;
    await network.getByRole('button', { name: 'Retry connections', exact: true }).click();
    await expect.poll(() => state.requests.filter(r => r.path === '/api/my-nsso/connections').length).toBe(2);
    await page.clock.fastForward(8100);
    await expect(network.getByRole('alert')).toContainText('Your connections could not be loaded');
    release();
    await expect(network.getByRole('alert')).toBeVisible();
    await network.getByRole('button', { name: 'Retry connections', exact: true }).click();
    await expect(network.getByRole('alert')).toHaveCount(0);
});
