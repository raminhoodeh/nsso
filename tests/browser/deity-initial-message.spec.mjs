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
                path.endsWith('UserProvider') ? `const user={id:'fixture-account',username:'fixture'}; export const useUser=()=>({user,loading:false});`
                : path.endsWith('ProfileProvider') ? `const noop=async()=>false;const value={updateField:noop,addLink:noop,updateLink:noop,removeLink:noop,reorderLinks:noop,addExperience:noop,addProject:noop,addQualification:noop,addProduct:noop,undo:noop,canUndo:false,fastMode:false,setFastMode:noop};export const useProfile=()=>value;`
                : path.endsWith('Toast') ? `const showToast=()=>{};export const useToast=()=>({showToast});`
                : `const client={auth:{getSession:async()=>({data:{session:null}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{full_name:'Fixture Creator',bio:'Fixture bio'}})})};export const createClient=()=>client;`, loader: 'js' }));
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';
            import Chat from './src/components/agent/AgentChatInterface';
            const root=createRoot(document.getElementById('root'));
            window.renderInitial=initialMessage=>root.render(<React.StrictMode><Chat initialMessage={initialMessage}/></React.StrictMode>);
        ` },
    });
    bundle = result.outputFiles[0].text;
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
