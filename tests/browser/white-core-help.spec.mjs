import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { expectOpaqueLightPanel, minimumTextContrast } from './helpers/light-panel-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
test.beforeAll(async () => {
    const files = ['src/app/dashboard/components/MyNssoTab.tsx', 'src/app/dashboard/components/NetworkTable.tsx', 'src/app/dashboard/components/SectionHelp.tsx', 'src/components/ui/ComingSoonBadge.tsx', 'src/components/ui/light-panel.ts', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx']
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;background:#43628c;color:white;font-family:Arial}main{padding:24px}button,input,textarea{font:inherit}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'notes-help-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/link|@\/components\/providers\/UIProvider|@\/components\/ui\/Toast|@\/app\/dashboard\/components\/DashboardGlassCard|\.\/NetworkingTimeline)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/link' ? 'export default props=><a {...props}/>;'
                    : path.endsWith('UIProvider') ? 'const noop=()=>{};export const useUI=()=>({setBackgroundDimmed:noop});'
                        : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:message=>window.fixtureToasts.push(message)});'
                            : path.endsWith('NetworkingTimeline') ? 'export default ()=>null;'
                                    : 'export default ({children})=><div>{children}</div>;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import{createRoot}from'react-dom/client';import Network from './src/app/dashboard/components/MyNssoTab';import Help from './src/app/dashboard/components/SectionHelp';import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
            window.fixtureToasts=[];const context={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'white-reading-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1},registerSurface(){},unregisterSurface(){},requestRender(){}};
            const connection={id:'synthetic-connection',connectedUserId:'synthetic-other',username:'fixture',fullName:'Fixture Connection',dateMet:'2026-10-01',location:'',notes:'Saved synthetic notes'};
            const emptyConnection={...connection,id:'synthetic-new-connection',username:'new-fixture',fullName:'New Connection',notes:''};
            createRoot(document.getElementById('root')).render(<TahoeGlassEngineContext.Provider value={context}><main><section><Help title="Purchases">This provider handles payment and delivery. Your profile only links to it.</Help><button type="button" style={{minHeight:44}}>Outside help target</button></section><Network initialData={{connections:[connection,emptyConnection]}}/></main></TahoeGlassEngineContext.Provider>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    const state = { status: 200, writes: [], gate: null }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('https://nsso.test/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname
        if (path === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (path === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (path.startsWith('/api/my-nsso/connections/')) {
            state.writes.push({ method: request.method(), body: request.postDataJSON() })
            if (state.gate) await state.gate
            return route.fulfill({ status: state.status, contentType: 'application/json', body: JSON.stringify({ success: state.status === 200 }) })
        }
        if (path !== '/white-help') throw Error('Unexpected fixture request ' + path)
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/white-help')
    return state
}

// Rounded tooltip corners are outside the label's text painting area. Sample
// the actual line rectangles, so unrelated content behind those cutouts cannot
// be mistaken for the background beneath the help text.
async function minimumTooltipTextContrast(tooltip) {
    const paint = await tooltip.evaluate(element => {
        const box = element.getBoundingClientRect()
        const range = document.createRange(); range.selectNodeContents(element)
        const rectangles = [...range.getClientRects()].map(rect => ({ x: rect.x - box.x, y: rect.y - box.y, width: rect.width, height: rect.height }))
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1)
        const ink = [...context.getImageData(0, 0, 1, 1).data]
        const original = element.style.color; element.dataset.originalContrastColor = original; element.style.color = 'transparent'
        return { rectangles, ink }
    })
    let screenshot
    try { screenshot = await tooltip.screenshot({ scale: 'css' }) }
    finally { await tooltip.evaluate(element => { element.style.color = element.dataset.originalContrastColor; delete element.dataset.originalContrastColor }) }
    const { data, info } = await sharp(screenshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const luminance = rgb => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)
    let minimum = Infinity
    for (const rect of paint.rectangles) for (let y = Math.max(0, Math.ceil(rect.y)); y < Math.min(info.height, Math.floor(rect.y + rect.height)); y += 2) for (let x = Math.max(0, Math.ceil(rect.x)); x < Math.min(info.width, Math.floor(rect.x + rect.width)); x += 2) {
        const offset = (y * info.width + x) * 4
        const background = [...data.subarray(offset, offset + 3)]
        const foreground = background.map((channel, index) => paint.ink[index] * paint.ink[3] / 255 + channel * (1 - paint.ink[3] / 255))
        const a = luminance(foreground), b = luminance(background)
        minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05))
    }
    expect(Number.isFinite(minimum), 'at least one actual help text line must be sampled').toBe(true)
    return { minimum, rectangles: paint.rectangles, ink: paint.ink }
}

test('connection notes use an opaque white material, dark readable fields and preserved modal focus', async ({ page }) => {
    const state = await mount(page)
    const opener = page.getByRole('button', { name: 'Edit notes for Fixture Connection', exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: 'Notes for Fixture Connection', exact: true })
    await expect(dialog).toHaveAttribute('data-reading-material', 'white')
    await expect(dialog.locator('[data-tahoe-chromium-optics]')).toHaveCount(0)
    await expectOpaqueLightPanel(page, dialog)
    expect(await minimumTextContrast(dialog.getByRole('heading'))).toBeGreaterThanOrEqual(4.5)
    const notes = dialog.getByRole('textbox', { name: 'Connection notes', exact: true })
    await notes.fill('Retained synthetic draft')
    await notes.blur()
    expect(await minimumTextContrast(notes)).toBeGreaterThanOrEqual(4.5)
    state.status = 503
    await dialog.getByRole('button', { name: 'Save Notes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('draft is still here')
    expect(await minimumTextContrast(dialog.getByRole('alert'))).toBeGreaterThanOrEqual(4.5)
    await expect(notes).toHaveValue('Retained synthetic draft')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(opener).toBeFocused()
    expect(state.writes).toEqual([{ method: 'PATCH', body: { notes: 'Retained synthetic draft' } }])
})

test('notes save remains single-flight and blocks dismissal until the same synthetic request settles', async ({ page }) => {
    const state = await mount(page)
    await page.getByRole('button', { name: 'Edit notes for Fixture Connection', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Notes for Fixture Connection', exact: true })
    let release; state.gate = new Promise(resolve => { release = resolve })
    await dialog.getByRole('textbox', { name: 'Connection notes' }).fill('One save only')
    await dialog.getByRole('button', { name: 'Save Notes', exact: true }).click()
    await expect(dialog.getByRole('button', { name: 'Saving...' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Close notes dialog' })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    expect(state.writes).toHaveLength(1)
    release()
    await expect(dialog).toHaveCount(0)
    expect(state.writes).toEqual([{ method: 'PATCH', body: { notes: 'One save only' } }])
})

test('context help stays opaque and readable while keyboard and touch dismissal remain unchanged', async ({ page }) => {
    const state = await mount(page)
    const trigger = page.getByRole('button', { name: 'About Purchases', exact: true })
    const target = await trigger.boundingBox()
    expect(target.width).toBeGreaterThanOrEqual(24)
    expect(target.width).toBeLessThanOrEqual(44)
    await expect(trigger.locator('svg')).toHaveAttribute('width', '14')
    await expect(trigger).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await trigger.press('Enter')
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText('This provider handles payment and delivery.')
    await expectOpaqueLightPanel(page, tooltip)
    const previousSample = await minimumTextContrast(tooltip)
    const textPaint = await minimumTooltipTextContrast(tooltip)
    await test.info().attach('tooltip-painted-text-contrast', { body: JSON.stringify({ previousWholeBoxMinimum: previousSample, ...textPaint }), contentType: 'application/json' })
    expect(textPaint.minimum).toBeGreaterThanOrEqual(4.5)
    const bounds = await tooltip.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(15)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width - 15)
    await page.keyboard.press('Escape')
    await expect(tooltip).toBeHidden()
    await expect(trigger).toBeFocused()
    await trigger.click()
    await expect(tooltip).toBeVisible()
    await page.getByRole('button', { name: 'Outside help target', exact: true }).click()
    await expect(tooltip).toBeHidden()
    expect(state.writes).toEqual([])
})

test('help enters the top layer above a later full-screen overlay and escapes a clipped, transformed parent', async ({ page }) => {
    await mount(page)
    const trigger = page.getByRole('button', { name: 'About Purchases', exact: true })
    await trigger.evaluate(element => {
        const parent = element.parentElement.parentElement
        Object.assign(parent.style, { height: '32px', overflow: 'hidden', transform: 'translateZ(0)', isolation: 'isolate' })
    })
    await trigger.press('Enter')
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toBeVisible()
    await expect.poll(() => tooltip.evaluate(element => element.matches(':popover-open'))).toBe(true)
    expect(await tooltip.evaluate(element => element.parentElement === document.body)).toBe(true)
    await page.evaluate(() => {
        const cover = document.createElement('div')
        cover.id = 'synthetic-occluding-glass'
        Object.assign(cover.style, { position: 'fixed', inset: '0', zIndex: '2147483647', background: '#54769e', backdropFilter: 'blur(12px)' })
        document.body.append(cover)
    })
    expect(await tooltip.evaluate(element => {
        const box = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
    })).toBe(true)
    await expectOpaqueLightPanel(page, tooltip)
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveCount(0)
    await expect(trigger).toBeFocused()
})

test('Add notes and Edit notes remain compact one-line horizontal actions from narrow mobile to desktop', async ({ page }) => {
    const state = await mount(page)
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        for (const [action, name] of [['Add', 'New Connection'], ['Edit', 'Fixture Connection']]) {
            const button = page.getByRole('button', { name: `${action} notes for ${name}`, exact: true })
            await button.scrollIntoViewIfNeeded()
            const size = await button.evaluate(element => {
                const target = element.getBoundingClientRect(), style = getComputedStyle(element)
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), lines = []
                for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.trim().endsWith('notes')) {
                    const range = document.createRange(); range.selectNodeContents(node)
                    for (const rect of range.getClientRects()) lines.push(Math.round(rect.top))
                }
                return { width: target.width, height: target.height, right: target.right, lines: [...new Set(lines)].length, paddingLeft: parseFloat(style.paddingLeft), paddingRight: parseFloat(style.paddingRight), scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }
            })
            expect(size.lines, `${action} notes at ${width}px`).toBe(1)
            expect(size.width).toBeGreaterThanOrEqual(132)
            expect(size.width).toBeLessThanOrEqual(160)
            expect(size.height).toBe(44)
            expect(size.paddingLeft).toBeGreaterThanOrEqual(12)
            expect(size.paddingRight).toBeGreaterThanOrEqual(12)
            expect(size.right).toBeLessThanOrEqual(width)
            expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    const add = page.getByRole('button', { name: 'Add notes for New Connection', exact: true })
    await add.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Connection notes', exact: true })).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(add).toBeFocused()
    expect(state.writes).toEqual([])
})

test('network discovery uses the compact shared Coming soon badge without dash punctuation', async ({ page }) => {
    await mount(page)
    await expect(page.getByText('Discover nsso users', { exact: true })).toBeVisible()
    const badge = page.getByText('Coming soon', { exact: true })
    await expect(badge).toBeVisible()
    const rendered = await badge.evaluate(element => ({ font: getComputedStyle(element).fontSize, whiteSpace: getComputedStyle(element).whiteSpace, height: element.closest('[data-coming-soon-badge]').getBoundingClientRect().height }))
    expect(rendered.font).toBe('10px')
    expect(rendered.whiteSpace).toBe('nowrap')
    expect(rendered.height).toBeGreaterThanOrEqual(20)
    expect(rendered.height).toBeLessThanOrEqual(24)
    await expect(page.locator('main')).not.toContainText('—')
})
