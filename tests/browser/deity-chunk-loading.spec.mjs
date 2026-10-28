import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let files, chatChunk, css

test.beforeAll(async () => {
    const source = ['src/components/agent/NSSOAgent.tsx', 'src/components/agent/AgentChatInterface.tsx', 'src/components/ui/light-panel.ts'].map(file => readFileSync(root + file, 'utf8')).join('\n')
    const candidates = [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;min-height:2000px;background:#30495b;font-family:Arial}#fixture-opener{position:fixed;top:120px;left:16px;min-height:44px;padding:12px;background:white}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, metafile: true, splitting: true, outdir: root + 'private/deity-chunk-fixture', entryNames: 'fixture', chunkNames: '[name]-[hash]', platform: 'browser', format: 'esm', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"', 'process.env.__NEXT_EXPERIMENTAL_REACT_BROWSER_BAILOUT': 'false' },
        plugins: [{ name: 'deity-chunk-boundaries', setup(builder) {
            // Use Next's real App Router dynamic runtime, retaining a real
            // split import whose HTTP response the test can leave unresolved.
            builder.onResolve({ filter: /^next\/dynamic$/ }, () => ({ path: root + 'node_modules/next/dist/shared/lib/app-dynamic.js' }))
            builder.onResolve({ filter: /^@\/(?:components\/providers\/(?:UserProvider|ProfileProvider)|components\/ui\/Toast|lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', resolveDir: root, contents:
                path.endsWith('UserProvider') ? 'export const useUser=()=>({user:null,loading:false});'
                    : path.endsWith('ProfileProvider') ? 'const noop=async()=>false;export const useProfile=()=>({applyOperation:noop,undo:noop,canUndo:false,revision:0,refreshProfile:noop,getRevision:()=>0,links:[]});'
                        : path.endsWith('/Toast') ? 'export const useToast=()=>({showToast:()=>{}});'
                            : 'export const createClient=()=>({auth:{getSession:async()=>({data:{session:null}})}});' }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `import React from'react';import{createRoot}from'react-dom/client';import Agent from'./src/components/agent/NSSOAgent';const app=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>app.unmount();app.render(<><button id="fixture-opener" onClick={()=>window.dispatchEvent(new CustomEvent('open-deity-chat'))}>Open fixture Deity</button><Agent/></>);` },
    })
    files = new Map(result.outputFiles.map(file => ['/' + basename(file.path), file.text]))
    const output = Object.entries(result.metafile.outputs).find(([, value]) => value.entryPoint?.endsWith('src/components/agent/AgentChatInterface.tsx'))
    if (!output) throw Error('Fixture must retain the real chat dynamic import')
    chatChunk = '/' + basename(output[0])
})

async function mount(page) {
    const state = { chunks: 0, requests: [], errors: [], release: null }
    const held = new Promise(resolve => { state.release = resolve })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    page.on('pageerror', error => state.errors.push(error.message))
    await page.route('https://nsso.test/**', async route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === chatChunk) { state.chunks++; await held }
        if (files.has(pathname)) return route.fulfill({ contentType: 'application/javascript', body: files.get(pathname) })
        if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (['/nsso-agent-avatar.png', '/deity logo white.png'].includes(decodeURIComponent(pathname))) return route.fulfill({ contentType: 'image/png', body: readFileSync(root + 'public' + decodeURIComponent(pathname)) })
        if (pathname.startsWith('/api/')) { state.requests.push(pathname); return route.abort() }
        if (pathname !== '/fixture') throw Error('Unexpected fixture request: ' + pathname)
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script type="module" src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/fixture')
    await expect(page.getByRole('button', { name: 'Open fixture Deity', exact: true })).toBeVisible()
    return state
}

test('an unresolved real chat chunk stays announced and touch-dismissible; ready chat preserves one conversation', async ({ page }, testInfo) => {
    const state = await mount(page)
    const opener = page.getByRole('button', { name: 'Open fixture Deity', exact: true })
    const dialog = page.getByRole('dialog', { name: 'Deity assistant', exact: true })
    const close = dialog.getByRole('button', { name: 'Close Deity chat', exact: true })
    try {
        expect(state.chunks).toBe(0)
        await page.evaluate(() => window.scrollTo(0, 450))
        // Native keyboard activation gives the custom event a known focused
        // opener; mobile dismissal below still uses a real touch tap.
        await opener.focus()
        await opener.press('Enter')
        await expect.poll(() => state.chunks).toBe(1)
        await expect(dialog.getByRole('status')).toHaveText('Loading Deity…')
        await expect(close).toBeVisible()
        const bounds = await close.boundingBox()
        expect(bounds.width).toBeGreaterThanOrEqual(44)
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        await expect(dialog).toHaveCSS('background-color', 'rgb(227, 231, 237)')
        await expect(dialog).toHaveCSS('opacity', '1')
        expect(await page.evaluate(() => document.body.style.position)).toBe('fixed')
        if (testInfo.project.use.hasTouch) await close.tap()
        else await close.click()
        await expect(dialog).toBeHidden()
        await expect(opener).toBeFocused()
        expect(await page.evaluate(() => ({ position: document.body.style.position, scroll: scrollY }))).toEqual({ position: '', scroll: 450 })

        state.release()
        await expect(page.locator('#deity-message-input')).toHaveCount(1)
        await expect(dialog).toBeHidden()
        await opener.focus()
        await opener.press('Enter')
        await expect(close).toHaveCount(1)
        await expect(dialog.getByRole('status').filter({ hasText: 'Loading Deity…' })).toHaveCount(0)
        const composer = dialog.getByRole('textbox', { name: 'Message Deity', exact: true })
        await composer.fill('Retained synthetic local draft')
        await close.click()
        await expect(opener).toBeFocused()
        await opener.focus()
        await opener.press('Enter')
        await expect(composer).toHaveValue('Retained synthetic local draft')
        await expect(close).toHaveCount(1)
        expect(state.chunks).toBe(1)
        expect(state.requests).toEqual([])
        expect(state.errors).toEqual([])
    } finally { state.release(); await page.evaluate(() => window.fixtureUnmount?.()).catch(() => {}) }
})

test('ready chat replaces its focused loading control without losing the modal focus scope', async ({ page }) => {
    const state = await mount(page)
    const opener = page.getByRole('button', { name: 'Open fixture Deity', exact: true })
    const dialog = page.getByRole('dialog', { name: 'Deity assistant', exact: true })
    try {
        await opener.focus()
        await opener.press('Enter')
        await expect.poll(() => state.chunks).toBe(1)
        const loadingClose = dialog.getByRole('button', { name: 'Close Deity chat', exact: true })
        await loadingClose.focus()
        state.release()
        await expect(dialog.getByRole('textbox', { name: 'Message Deity', exact: true })).toBeEditable()
        await expect(dialog.getByRole('button', { name: 'Close Deity chat', exact: true })).toHaveCount(1)
        await expect(dialog.getByRole('status').filter({ hasText: 'Loading Deity…' })).toHaveCount(0)
        await expect(dialog).toBeFocused()
        await page.keyboard.press('Tab')
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(opener).toBeFocused()
        expect(state.chunks).toBe(1)
        expect(state.requests).toEqual([])
        expect(state.errors).toEqual([])
    } finally { state.release(); await page.evaluate(() => window.fixtureUnmount?.()).catch(() => {}) }
})
