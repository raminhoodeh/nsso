import { test as base, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const test = base.extend({
    compactBrowserName: ['chromium', { option: true }],
    page: async ({ playwright, compactBrowserName }, runFixture, testInfo) => {
        // The Playwright runner supplies the configured Chrome channel as a
        // browserType default, so explicitly clear it for the WebKit fixture.
        const channel = compactBrowserName === 'chromium' ? (testInfo.project.use.channel ?? '') : ''
        const browser = await playwright[compactBrowserName].launch({ channel })
        try {
            const context = await browser.newContext({ viewport: testInfo.project.use.viewport, isMobile: Boolean(testInfo.project.use.isMobile), hasTouch: Boolean(testInfo.project.use.hasTouch) })
            await runFixture(await context.newPage())
        } finally { await browser.close() }
    },
})

test.beforeAll(async () => {
    const source = readFileSync(root + 'src/components/agent/AgentChatInterface.tsx', 'utf8')
    const candidates = [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
    css = compiler.build(candidates) + 'body{margin:0;font-family:Arial}#root{height:100dvh}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'compact-deity-fixture', setup(builder) {
            builder.onResolve({ filter: /^@\/(?:components\/providers\/(?:UserProvider|ProfileProvider)|components\/ui\/Toast|lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', resolveDir: root, contents:
                path.endsWith('UserProvider') ? `const user={id:'compact-fixture',username:'fixture'};export const useUser=()=>({user,loading:false});`
                : path.endsWith('ProfileProvider') ? `window.fixtureApplied=[];const value={fastMode:true,setFastMode:()=>{throw Error('Legacy preference must remain untouched')},undo:async()=>({status:'applied'}),canUndo:true,revision:0,getRevision:()=>0,refreshProfile:async()=>{},links:[],applyOperation:async(changes,operationId,expectedRevision)=>{window.fixtureApplied.push({changes,operationId,expectedRevision});return{status:'applied',operationId,revision:window.fixtureApplied.length,changes:[]}}};export const useProfile=()=>value;`
                : path.endsWith('/Toast') ? `const showToast=()=>{};export const useToast=()=>({showToast});`
                : `const client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-fixture-only',user:{id:'compact-fixture'}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{full_name:'Fixture Person',bio:'Synthetic fixture biography'}})})};export const createClient=()=>client;`
            }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import Chat from './src/components/agent/AgentChatInterface';window.fixtureClosed=0;createRoot(document.getElementById('root')).render(<Chat isFullScreen onClose={()=>window.fixtureClosed++}/>);` },
    })
    bundle = result.outputFiles[0].text
})

async function mount(page, viewport) {
    const errors = [], requests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (/ResizeObserver.*(?:loop|undelivered)/i.test(message.text())) errors.push(message.text()) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(viewport)
    await page.route('https://nsso.test/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (pathname === '/api/deity/chat') {
            requests.push(route.request().postDataJSON())
            const actions = [
                { version: 1, label: 'Update headline', change: { kind: 'profile.patch', patch: { headline: 'Fixture headline for review' } } },
                { version: 1, label: 'Update bio', change: { kind: 'profile.patch', patch: { bio: 'Fixture biography for review' } } },
            ]
            return route.fulfill({ contentType: 'text/plain', body: 'Please review these suggested changes.\n__DEITY_ACTIONS__\n' + JSON.stringify(actions) + '\n' })
        }
        if (['/nsso-agent-avatar.png', '/deity logo white.png'].includes(decodeURIComponent(pathname))) return route.fulfill({ contentType: 'image/png', body: readFileSync(root + 'public' + decodeURIComponent(pathname)) })
        if (/\.(?:png|jpg)$/.test(pathname)) return route.fulfill({ status: 204 })
        if (pathname.startsWith('/api/')) throw new Error('Unexpected mutation in synthetic Deity fixture')
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/fixture')
    await expect(page.getByRole('textbox', { name: 'Message Deity' })).toBeEditable()
    await expect.poll(() => page.locator('header img').evaluateAll(images => images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
    return { errors, requests }
}

for (const browserName of ['chromium', 'webkit']) {
    test.describe(`${browserName} compact Deity`, () => {
        test.use({ compactBrowserName: browserName })
        for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 360 }, { width: 1440, height: 900 }]) {
            test(`stable guidance and compact opaque controls fit ${viewport.width}×${viewport.height}`, async ({ page }, testInfo) => {
                const { errors, requests } = await mount(page, viewport)
                await expect(page.getByRole('button', { name: /Fast mode/i })).toHaveCount(0)
                const composer = page.getByRole('textbox', { name: 'Message Deity' })
                await expect(composer).toHaveAttribute('placeholder', 'Message Deity…')
                const metrics = await composer.evaluate(element => {
                    const style = getComputedStyle(element), bounds = element.getBoundingClientRect()
                    const canvas = document.createElement('canvas'), context = canvas.getContext('2d')
                    context.font = `${style.fontSize} ${style.fontFamily}`
                    const shell = element.closest('[data-deity-surface]')
                    const log = shell.querySelector('[role="log"]').getBoundingClientRect()
                    const send = shell.querySelector('[aria-label="Send message"]').getBoundingClientRect()
                    const header = shell.querySelector('header'), brand = header.firstElementChild.getBoundingClientRect(), controls = header.lastElementChild.getBoundingClientRect()
                    return { font: parseFloat(style.fontSize), guidanceWidth: context.measureText(element.placeholder).width, availableWidth: element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, composerBottom: bounds.bottom, shellBottom: shell.getBoundingClientRect().bottom, logHeight: log.height, shellHeight: shell.getBoundingClientRect().height, sendHeight: send.height, background: getComputedStyle(shell).backgroundColor, headerPadding: getComputedStyle(header).paddingTop, brandRight: brand.right, controlsLeft: controls.left, overflow: shell.scrollWidth > shell.clientWidth }
                })
                expect(metrics.font).toBeGreaterThanOrEqual(16)
                expect(metrics.guidanceWidth).toBeLessThan(metrics.availableWidth)
                expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.clientHeight)
                expect(metrics.composerBottom).toBeLessThanOrEqual(metrics.shellBottom)
                expect(metrics.logHeight).toBeGreaterThan(metrics.shellHeight * 0.45)
                expect(metrics.sendHeight).toBeGreaterThanOrEqual(44)
                expect(metrics.background).toBe('rgb(17, 22, 29)')
                expect(parseFloat(metrics.headerPadding)).toBeLessThanOrEqual(8)
                expect(metrics.brandRight).toBeLessThanOrEqual(metrics.controlsLeft)
                expect(metrics.overflow).toBe(false)
                await composer.focus()
                await composer.press('Shift+Enter')
                await expect(composer).toHaveValue('\n')
                expect(requests).toHaveLength(0)
                const draft = 'My work\nMy passions\nMy goals'
                await composer.fill(draft)
                await expect(composer).toHaveValue(draft)
                await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled()
                await page.screenshot({ path: testInfo.outputPath('compact-opaque-deity.png') })
                expect(errors).toEqual([])
            })
        }

        test('keyboard send and proposal review cannot silently use a stored fast-mode preference', async ({ page }) => {
            const { errors, requests } = await mount(page, { width: 390, height: 844 })
            const composer = page.getByRole('textbox', { name: 'Message Deity' })
            await composer.fill('Suggest a clearer profile, without changing it.')
            // Safari's system setting can restrict Tab to text fields. Focus
            // the native control explicitly, then verify keyboard activation
            // without depending on that setting or Enter-to-submit convention.
            const send = page.getByRole('button', { name: 'Send message', exact: true })
            await send.focus()
            await expect(send).toBeFocused()
            await page.keyboard.press('Enter')
            const apply = page.getByRole('button', { name: 'Apply suggested profile change', exact: true })
            await expect(apply).toHaveCount(2)
            expect(requests).toHaveLength(1)
            expect(await page.evaluate(() => window.fixtureApplied)).toEqual([])
            const first = apply.first()
            await first.locator('..').getByText('Review proposed values', { exact: true }).click()
            await expect(first.locator('..').locator('dd')).toHaveText('Fixture headline for review')
            await first.focus()
            await page.keyboard.press('Enter')
            await expect(page.getByText('Done, profile updated!', { exact: true })).toHaveCount(1)
            const operations = await page.evaluate(() => window.fixtureApplied)
            expect(operations).toHaveLength(1)
            expect(operations[0].changes).toEqual([{ kind: 'profile.patch', patch: { headline: 'Fixture headline for review' } }])
            await page.getByRole('button', { name: 'Reject suggested profile change', exact: true }).click()
            await expect(page.getByRole('status').filter({ hasText: 'Rejected' })).toHaveCount(1)
            expect(await page.evaluate(() => window.fixtureApplied)).toHaveLength(1)
            expect(errors).toEqual([])
        })
    })
}
