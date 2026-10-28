import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
test.use({ browserName: 'webkit', channel: '' })

test.beforeAll(async () => {
    // Compile the actual route/component utility classes, including their flex,
    // padding and overflow rules. Unstyled semantic fixtures miss this failure.
    const files = ['src/app/deity/page.tsx', 'src/components/agent/AgentChatInterface.tsx', 'src/components/ui/light-panel.ts', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts']
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;font-family:Arial;background:#344956}#fixture-header{position:fixed;inset:0 0 auto;height:88px;z-index:5000;background:#546a7c}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'responsive-deity-fixture', setup(builder) {
        builder.onResolve({ filter: /^(?:next\/navigation|@\/components\/layout\/Header|@\/components\/providers\/(?:UserProvider|ProfileProvider)|@\/components\/ui\/Toast|@\/lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
            path === 'next/navigation' ? 'export const useRouter=()=>({push:()=>{}});'
                : path.endsWith('/Header') ? 'export default ()=> <header id="fixture-header">Site navigation fixture</header>;'
                    : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:null,loading:false});'
                        : path.endsWith('ProfileProvider') ? 'const noop=async()=>false;export const useProfile=()=>({applyOperation:noop,undo:noop,canUndo:false,fastMode:false,setFastMode:noop,revision:0,refreshProfile:noop,getRevision:()=>0,links:[]});'
                            : path.endsWith('/Toast') ? 'export const useToast=()=>({showToast:()=>{}});'
                                : 'export const createClient=()=>({auth:{getSession:async()=>({data:{session:null}})}});' }))
    } }], stdin: { resolveDir: root, loader: 'tsx', contents: 'import React from "react";import {createRoot} from "react-dom/client";import Page from "./src/app/deity/page";createRoot(document.getElementById("root")).render(<Page/>);' } })
    bundle = result.outputFiles[0].text
})

async function mount(page, viewport) {
    const runtimeErrors = []
    page.on('pageerror', error => runtimeErrors.push(error.message))
    page.on('console', message => { if (/ResizeObserver.*(?:loop|undelivered)/i.test(message.text())) runtimeErrors.push(message.text()) })
    await page.setViewportSize(viewport)
    await page.route('https://nsso.test/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (path === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (path.startsWith('/api/')) throw new Error('Responsive verification must not send an AI request')
        if (/\.(?:png|jpg)$/.test(path)) return route.fulfill({ status: 204 })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/deity')
    return runtimeErrors
}

async function expectComposerContained(page) {
    await expect.poll(() => page.evaluate(() => {
        const shell = document.querySelector('[data-deity-surface]')?.getBoundingClientRect()
        const composer = document.querySelector('#deity-message-input')?.getBoundingClientRect()
        const send = document.querySelector('[aria-label="Send message"]')?.getBoundingClientRect()
        if (!shell || !composer || !send) return false
        const bottom = Math.min(shell.bottom, window.visualViewport?.height ?? window.innerHeight)
        return composer.top >= shell.top && composer.bottom <= bottom + 1 && send.top >= shell.top && send.bottom <= bottom + 1 && send.height >= 44 && composer.height >= 56
    })).toBe(true)
}

for (const viewport of [{ width: 390, height: 400 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
    test(`composer and Send fit the actual styled ${viewport.width}×${viewport.height} chat pane`, async ({ page }, testInfo) => {
        const runtimeErrors = await mount(page, viewport)
        const composer = page.getByRole('textbox', { name: 'Message Deity' })
        await composer.fill('My work\nMy passions\nMy goals\nA longer biography')
        await expectComposerContained(page)
        await composer.fill(Array.from({ length: 20 }, (_, index) => `Biography line ${index + 1}`).join('\n'))
        await expectComposerContained(page)
        await expect(composer).toHaveValue(/Biography line 20/)
        await page.getByRole('button', { name: 'What you can ask me about' }).click()
        await expectComposerContained(page)
        const database = page.getByRole('button', { name: 'nsso DATABASE', exact: true })
        await database.scrollIntoViewIfNeeded()
        await database.click()
        const dialog = page.getByRole('dialog', { name: 'About the nsso database' })
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Close database information' }).click()
        await expect(dialog).toHaveCount(0)
        await expectComposerContained(page)
        await page.screenshot({ path: testInfo.outputPath('short-deity-composer.png') })
        expect(runtimeErrors).toEqual([])
    })
}

test('an already-expanded long composer follows a shrink and expansion of the viewport', async ({ page }) => {
    const runtimeErrors = await mount(page, { width: 390, height: 844 })
    const composer = page.getByRole('textbox', { name: 'Message Deity' })
    const draft = Array.from({ length: 20 }, (_, index) => `My biography line ${index + 1}`).join('\n')
    await composer.fill(draft)
    await page.getByRole('button', { name: 'What you can ask me about' }).click()
    await page.setViewportSize({ width: 390, height: 400 })
    await expectComposerContained(page)
    await expect(composer).toHaveValue(draft)
    await page.setViewportSize({ width: 390, height: 320 })
    await expectComposerContained(page)
    await expect(composer).toHaveValue(draft)
    await page.setViewportSize({ width: 390, height: 844 })
    await expectComposerContained(page)
    await expect(composer).toHaveValue(draft)
    expect(runtimeErrors).toEqual([])
})
