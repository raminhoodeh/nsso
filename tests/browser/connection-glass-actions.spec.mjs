import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
let bundle;
test.beforeAll(async () => {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'connection-action-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/navigation|@\/components\/ui\/Toast)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: path === 'next/navigation'
                ? 'export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:path=>window.fixtureNavigation.push(path)});'
                : 'export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});' }));
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';
            import QR from './src/components/logic/QRScanHandler';
            import Connect from './src/components/ui/AddToMyNssoButton';
            window.fixtureNavigation=[];window.fixtureToasts=[];
            const root=createRoot(document.getElementById('root'));
            window.fixtureRender=kind=>root.render(kind==='qr'?<QR scannedUserId="scanned-fixture" currentUser={{id:'viewer-fixture'}}/>:<Connect profileUserId="scanned-fixture" isLoggedIn={kind!=='guest'} initialIsConnected={false}/>);
            window.fixtureUnmount=()=>root.render(null);
        ` },
    });
    bundle = result.outputFiles[0].text;
});

async function fixture(page, kind) {
    const requests = [];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' });
        if (url.pathname === '/api/my-nsso/connect') {
            requests.push({ method: route.request().method(), body: route.request().postDataJSON() });
            await pending;
            return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, isNewConnection: true }) });
        }
        throw new Error('Unexpected request in synthetic connection fixture: ' + url.href);
    });
    await page.goto('https://nsso.test/fixture?source=qr');
    await page.addScriptTag({ content: bundle });
    await page.evaluate(kind => window.fixtureRender(kind), kind);
    return { requests, release };
}

test('QR glass submit keeps native keyboard submission, pending protection and explicit consent', async ({ page }) => {
    const state = await fixture(page, 'qr');
    const location = page.getByLabel('Where did you meet? (optional)');
    await location.fill('  Synthetic event  ');
    const submit = page.getByRole('button', { name: 'Add to My nsso', exact: true });
    await expect(submit).toHaveAttribute('type', 'submit');
    await location.press('Enter');
    await expect(page.getByRole('button', { name: 'Adding…', exact: true })).toBeDisabled();
    await expect.poll(() => state.requests.length).toBe(1);
    expect(state.requests[0]).toEqual({ method: 'POST', body: { scannedUserId: 'scanned-fixture', location: 'Synthetic event' } });
    state.release();
    await expect(page.getByRole('complementary', { name: 'Save scanned profile' })).toHaveCount(0);
    expect(await page.evaluate(() => window.fixtureToasts)).toEqual([{ message: 'Added to My nsso', type: 'success' }]);
    await page.evaluate(() => window.fixtureUnmount());
});

test('QR secondary glass action dismisses without submitting a connection', async ({ page }) => {
    const state = await fixture(page, 'qr');
    await page.getByRole('button', { name: 'Not now', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Save scanned profile' })).toHaveCount(0);
    expect(state.requests).toEqual([]);
    state.release();
    await page.evaluate(() => window.fixtureUnmount());
});

test('public connect glass action preserves sign-in routing and one pending write', async ({ page }) => {
    const state = await fixture(page, 'guest');
    await page.getByRole('button', { name: 'Add to my nsso', exact: true }).click();
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual(['/sign-in?next=%2Ffixture%3Fsource%3Dqr']);
    expect(state.requests).toEqual([]);
    await page.evaluate(() => window.fixtureRender('member'));
    await page.getByRole('button', { name: 'Add to my nsso', exact: true }).click();
    const pending = page.getByRole('button', { name: 'Adding...', exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    await expect.poll(() => state.requests.length).toBe(1);
    expect(state.requests[0]).toEqual({ method: 'POST', body: { scannedUserId: 'scanned-fixture', location: 'Online Profile' } });
    state.release();
    await expect(page.getByRole('button', { name: 'Added', exact: true })).toBeDisabled();
    expect(state.requests).toHaveLength(1);
    await page.evaluate(() => window.fixtureUnmount());
});
