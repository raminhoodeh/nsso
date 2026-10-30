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
    const source = ['src/components/agent/AgentChatInterface.tsx', 'src/components/ui/light-panel.ts', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts'].map(file => readFileSync(root + file, 'utf8')).join('\n')
    const candidates = [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
    css = compiler.build(candidates) + 'body{margin:0;font-family:Arial}#root{height:100dvh}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'compact-deity-fixture', setup(builder) {
            builder.onResolve({ filter: /^@\/(?:components\/providers\/(?:UserProvider|ProfileProvider)|components\/ui\/Toast|lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', resolveDir: root, contents:
                path.endsWith('UserProvider') ? `import{useSyncExternalStore}from'react';const user={id:'compact-fixture',username:'fixture'};let value=window.fixtureBootstrapPending?{user:null,loading:true}:{user,loading:false};const listeners=new Set();const subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};window.fixtureResolveAccount=()=>{value={user,loading:false};listeners.forEach(fn=>fn())};export const useUser=()=>useSyncExternalStore(subscribe,()=>value);`
                : path.endsWith('ProfileProvider') ? `window.fixtureApplied=[];const value={fastMode:true,setFastMode:()=>{throw Error('Legacy preference must remain untouched')},undo:async()=>({status:'applied'}),canUndo:true,revision:0,getRevision:()=>0,refreshProfile:async()=>{},links:[],applyOperation:async(changes,operationId,expectedRevision)=>{window.fixtureApplied.push({changes,operationId,expectedRevision});return{status:'applied',operationId,revision:window.fixtureApplied.length,changes:[]}}};export const useProfile=()=>value;`
                : path.endsWith('/Toast') ? `const showToast=()=>{};export const useToast=()=>({showToast});`
                : `const client={auth:{getSession:async()=>({data:{session:{access_token:'synthetic-fixture-only',user:{id:'compact-fixture'}}}})},from:()=>({select(){return this},eq(){return this},single:async()=>({data:{full_name:'Fixture Person',bio:'Synthetic fixture biography'}})})};export const createClient=()=>client;`
            }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import{createRoot}from'react-dom/client';import Chat from './src/components/agent/AgentChatInterface';window.fixtureClosed=0;createRoot(document.getElementById('root')).render(<Chat isFullScreen onClose={()=>window.fixtureClosed++}/>);` },
    })
    bundle = result.outputFiles[0].text
})

async function mount(page, viewport, { bootstrap = false } = {}) {
    const errors = [], requests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (/ResizeObserver.*(?:loop|undelivered)/i.test(message.text())) errors.push(message.text()) })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize(viewport)
    await page.addInitScript(value => { window.fixtureBootstrapPending = value }, bootstrap)
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
    if (bootstrap) {
        await expect(page.getByRole('status')).toHaveText('Loading Deity account…')
        return { errors, requests }
    }
    await expect(page.getByRole('textbox', { name: 'Message Deity' })).toBeEditable()
    await expect.poll(() => page.locator('header img').evaluateAll(images => images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true)
    return { errors, requests }
}

async function textContrast(locator, pseudo = null) {
    return locator.evaluate((element, pseudo) => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        const paint = colour => { context.clearRect(0, 0, 1, 1); context.fillStyle = colour; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data] }
        const foreground = paint(getComputedStyle(element, pseudo).color)
        let background = [255, 255, 255, 255]
        for (let node = element; node; node = node.parentElement) {
            const colour = paint(getComputedStyle(node).backgroundColor)
            if (colour[3] === 255) { background = colour; break }
        }
        const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
        const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b)
        return (values[1] + 0.05) / (values[0] + 0.05)
    }, pseudo)
}

for (const browserName of ['chromium', 'webkit']) {
    test.describe(`${browserName} compact Deity`, () => {
        test.use({ compactBrowserName: browserName })
        test('expanded guidance becomes a compact Minimise text control without losing keyboard focus', async ({ page }) => {
            const { errors, requests } = await mount(page, { width: 390, height: 844 })
            const expand = page.getByRole('button', { name: 'What you can ask me about', exact: true })
            await expect(expand).toHaveAttribute('aria-expanded', 'false')
            const initialHeight = await expand.evaluate(element => element.getBoundingClientRect().height)
            await expand.focus()
            await page.keyboard.press('Enter')
            const minimise = page.getByRole('button', { name: 'Minimise', exact: true })
            await expect(minimise).toBeFocused()
            await expect(minimise).toHaveAttribute('aria-expanded', 'true')
            const compact = await minimise.evaluate(element => ({
                height: element.getBoundingClientRect().height,
                width: element.getBoundingClientRect().width,
                nestedLenses: element.querySelectorAll('[data-native-glass-lens]').length,
                background: getComputedStyle(element).backgroundColor,
            }))
            expect(compact.height).toBeGreaterThanOrEqual(24)
            expect(compact.height).toBeLessThan(initialHeight)
            expect(compact.width).toBeLessThan(120)
            expect(compact.nestedLenses).toBe(0)
            expect(compact.background).toBe('rgba(0, 0, 0, 0)')
            await expect(page.getByRole('button', { name: 'nsso DATABASE', exact: true })).toBeVisible()
            await page.keyboard.press('Space')
            await expect(expand).toBeFocused()
            await expect(expand).toHaveAttribute('aria-expanded', 'false')
            await expect(page.getByRole('button', { name: 'nsso DATABASE', exact: true })).toBeHidden()
            expect(requests).toEqual([])
            expect(errors).toEqual([])
        })

        test('loading and loaded Deity share an opaque pastel white panel', async ({ page }, testInfo) => {
            const { errors, requests } = await mount(page, { width: 390, height: 844 }, { bootstrap: true })
            const shell = page.locator('[data-deity-surface="opaque"]')
            const inspectSurface = () => shell.evaluate(element => {
                const style = getComputedStyle(element)
                return { background: style.backgroundColor, image: style.backgroundImage, opacity: style.opacity, backdrop: style.backdropFilter }
            })
            const loading = await inspectSurface()
            expect(loading.background).toBe('rgb(227, 231, 237)')
            expect(loading.opacity).toBe('1')
            expect(loading.image).toContain('linear-gradient')
            expect(loading.backdrop).toBe('none')
            const close = page.getByRole('button', { name: 'Close Deity chat', exact: true })
            expect(await textContrast(close)).toBeGreaterThanOrEqual(4.5)
            await close.focus(); await page.keyboard.press('Enter')
            expect(await page.evaluate(() => window.fixtureClosed)).toBe(1)
            await page.evaluate(() => window.fixtureResolveAccount())
            await expect(page.getByRole('textbox', { name: 'Message Deity' })).toBeEditable()
            expect(await inspectSurface()).toEqual(loading)
            await expect(shell.locator('[data-tahoe-glass-button],[data-tahoe-surface],[data-tahoe-chromium-optics]')).toHaveCount(0)
            await expect(page.locator('header img[alt="Deity"]')).toHaveCSS('filter', 'brightness(0)')
            await page.screenshot({ path: testInfo.outputPath('white-deity-panel.png') })
            expect(requests).toEqual([])
            expect(errors).toEqual([])
        })

        test('white conversation controls, proposals and database dialog retain contrast and keyboard focus', async ({ page }, testInfo) => {
            const { errors, requests } = await mount(page, { width: 390, height: 844 })
            const composer = page.getByRole('textbox', { name: 'Message Deity' })
            expect(await textContrast(composer)).toBeGreaterThanOrEqual(4.5)
            expect(await textContrast(composer, '::placeholder')).toBeGreaterThanOrEqual(4.5)
            await composer.fill('Suggest a readable headline.')
            await page.getByRole('button', { name: 'Send message', exact: true }).click()
            const apply = page.getByRole('button', { name: 'Apply suggested profile change', exact: true }).first()
            const reject = page.getByRole('button', { name: 'Reject suggested profile change', exact: true }).first()
            await expect(apply).toBeVisible()
            for (const item of [page.getByRole('article', { name: 'Your message' }), page.getByRole('article', { name: 'Deity message' }).last(), apply, reject]) {
                expect(await textContrast(item)).toBeGreaterThanOrEqual(4.5)
            }
            await page.keyboard.press('Tab')
            await apply.focus()
            expect(await apply.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
            await page.keyboard.press('Enter')
            const saved = page.getByRole('status').filter({ hasText: 'Done, profile updated!' })
            await expect(saved).toBeVisible()
            expect(await textContrast(saved)).toBeGreaterThanOrEqual(4.5)
            const categories = page.getByRole('button', { name: 'What you can ask me about', exact: true })
            await categories.click()
            const database = page.getByRole('button', { name: 'nsso DATABASE', exact: true })
            expect(await textContrast(database)).toBeGreaterThanOrEqual(4.5)
            await database.focus(); await page.keyboard.press('Enter')
            const dialog = page.getByRole('dialog', { name: 'About the nsso database' })
            await expect(dialog).toBeVisible()
            await expect(dialog).toHaveCSS('background-color', 'rgb(227, 231, 237)')
            await expect(dialog).toHaveCSS('backdrop-filter', 'none')
            const close = dialog.getByRole('button', { name: 'Close database information' })
            await expect(close).toBeFocused()
            await page.screenshot({ path: testInfo.outputPath('white-database-dialog.png') })
            await page.keyboard.press('Escape')
            await expect(dialog).toHaveCount(0)
            await expect(database).toBeFocused()
            await page.emulateMedia({ forcedColors: 'active' })
            const forced = await database.evaluate(element => { const style = getComputedStyle(element); return { background: style.backgroundColor, color: style.color, outline: style.outlineStyle } })
            expect(forced.background).not.toBe(forced.color)
            expect(forced.outline).not.toBe('none')
            expect(requests).toHaveLength(1)
            expect(errors).toEqual([])
        })

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
                expect(metrics.background).toBe('rgb(227, 231, 237)')
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
