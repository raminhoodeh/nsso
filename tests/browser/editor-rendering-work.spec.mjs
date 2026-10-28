import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const fixture = `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import Environment from './src/components/providers/NSSOTahoeGlassEnvironment';
    import {UIProvider} from './src/components/providers/UIProvider';
    import {TahoeGlassSurface,TahoeGlassButton,TahoeGlassField,TahoeBackdropSurface} from './src/components/ui/tahoe-glass';
    const app=createRoot(document.getElementById('root'));window.disposeFixture=()=>app.unmount();
    app.render(<UIProvider><Environment>
        <TahoeBackdropSurface as="nav" variant="menu" data-testid="editor-nav" style={{position:'fixed',top:8,left:12,right:12,height:72,zIndex:40}} contentClassName="p-4">Profile editor navigation</TahoeBackdropSurface>
        <main data-testid="retained-editor" style={{maxWidth:900,margin:'0 auto',padding:'110px 20px 30px'}}>
            {Array.from({length:36},(_,index)=><section key={index} data-perf-row={index} style={{height:280,marginBottom:20}}>
                <TahoeGlassSurface variant="card" radius={24} tone="light" style={{height:'100%',padding:20}}>
                    <h2>Editor section {index+1}</h2>
                    <TahoeGlassField label={'Name '+index}><input defaultValue={'Synthetic row '+index}/></TahoeGlassField>
                    <TahoeGlassField label={'Description '+index}><textarea defaultValue="Synthetic editor content; no account or writes."/></TahoeGlassField>
                    <TahoeGlassButton type="button">Edit row {index+1}</TahoeGlassButton>
                </TahoeGlassSurface>
            </section>)}
        </main>
    </Environment></UIProvider>);
`

test.beforeAll(async () => {
    const files = ['src/components/providers/TahoeGlassProvider.tsx', 'src/components/providers/NSSOTahoeGlassEnvironment.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx']
    const source = files.map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture
    const candidates = [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;font-family:Arial;color:white}button,input,textarea{font:inherit}h2{margin:0 0 12px}textarea{height:56px}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'synthetic-editor-route', setup(builder) {
            builder.onResolve({ filter: /^next\/navigation$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const usePathname=()=>location.pathname;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: fixture } })
    bundle = result.outputFiles[0].text
})

async function mount(page, pathname) {
    const requests = []
    page.on('request', request => requests.push(new URL(request.url()).pathname))
    await page.route('https://nsso.test/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (path === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (path === '/assets/backgrounds/nsso-deck-blue.webp') return route.fulfill({ contentType: 'image/webp', body: readFileSync(root + 'public' + path) })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test' + pathname)
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-glass-state', 'active')
    await expect(page.locator('[data-nsso-deck-background]')).toHaveCount(1)
    await expect(page.locator('#vanta-bg')).toHaveCount(0)
    await page.waitForTimeout(350)
    return requests
}

test('a visited retained editor does no hidden work and refreshes resized fields when shown', async ({ page }) => {
    await mount(page, '/dashboard')
    const field = page.locator('[data-perf-row="0"] [data-tahoe-glass-surface="recessed"]').first()
    await expect(field).toHaveAttribute('data-tahoe-glass-state', 'active')
    const initialMap = await page.locator('[data-tahoe-glass-viewport] feImage[href]').evaluateAll(images => images.map(image => image.getAttribute('href')))
    await page.getByTestId('retained-editor').evaluate(element => { element.hidden = true; element.querySelector('[data-tahoe-glass-surface="recessed"]').style.width = '250px' })
    await expect(field).toHaveAttribute('data-tahoe-glass-visible', 'false')
    await page.waitForTimeout(250)
    const hiddenReads = await page.evaluate(async () => {
        let reads = 0
        const nativeStyle = window.getComputedStyle, nativeRect = Element.prototype.getBoundingClientRect
        const hidden = element => Boolean(element.closest?.('[data-testid="retained-editor"]'))
        window.getComputedStyle = function(element, ...args) { if (hidden(element)) reads++; return nativeStyle.call(window, element, ...args) }
        Element.prototype.getBoundingClientRect = function() { if (hidden(this)) reads++; return nativeRect.call(this) }
        try { for (let index=0; index<8; index++) { window.dispatchEvent(new Event('scroll')); await new Promise(requestAnimationFrame) } return reads }
        finally { window.getComputedStyle = nativeStyle; Element.prototype.getBoundingClientRect = nativeRect }
    })
    expect(hiddenReads).toBe(0)
    await page.getByTestId('retained-editor').evaluate(element => { element.hidden = false })
    await field.scrollIntoViewIfNeeded()
    await expect(field).toHaveAttribute('data-tahoe-glass-visible', 'true')
    await expect(field).toHaveAttribute('data-tahoe-glass-state', 'active')
    await expect(field).toHaveCSS('width', '250px')
    await expect.poll(() => page.locator('[data-tahoe-glass-viewport] feImage[href]').evaluateAll(images => images.map(image => image.getAttribute('href')))).not.toEqual(initialMap)
    await page.getByRole('textbox', { name: 'Name 0', exact: true }).fill('Preserved editor works after return')
    await expect(page.getByRole('textbox', { name: 'Name 0', exact: true })).toHaveValue('Preserved editor works after return')
    await page.evaluate(() => window.disposeFixture())
    await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
})

for (const pathname of ['/dashboard', '/dashboard/products/synthetic/creator']) {
    test(`dense static editor avoids offscreen optical work on ${pathname}`, async ({ page }, testInfo) => {
        const errors = []; page.on('pageerror', error => errors.push(error.message))
        const requests = await mount(page, pathname)
        if (testInfo.project.name === 'desktop') await expect(page.getByTestId('editor-nav')).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
        const metrics = await page.evaluate(async () => {
            const counts = { styles: 0, distantStyles: 0, rects: 0, distantRects: 0, pngs: 0 }
            const nativeStyle = window.getComputedStyle, nativeRect = Element.prototype.getBoundingClientRect, nativePng = HTMLCanvasElement.prototype.toDataURL
            const distant = element => Number(element.closest?.('[data-perf-row]')?.getAttribute('data-perf-row') ?? -1) >= 12
            window.getComputedStyle = function(element, ...args) { counts.styles++; if (distant(element)) counts.distantStyles++; return nativeStyle.call(window, element, ...args) }
            Element.prototype.getBoundingClientRect = function() { counts.rects++; if (distant(this)) counts.distantRects++; return nativeRect.call(this) }
            HTMLCanvasElement.prototype.toDataURL = function(...args) { counts.pngs++; return nativePng.apply(this, args) }
            const gaps = []; let previous = await new Promise(requestAnimationFrame)
            try {
                for (let index=0; index<24; index++) {
                    scrollTo(0, 140 + index * 35)
                    await new Promise(resolve => requestAnimationFrame(time => { gaps.push(time - previous); previous=time; resolve() }))
                }
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                return { ...counts, frames: gaps.length, elapsedMs: gaps.reduce((sum, value) => sum + value, 0), maxFrameMs: Math.max(...gaps), surfaces: document.querySelectorAll('[data-tahoe-glass-surface]').length }
            } finally {
                window.getComputedStyle = nativeStyle; Element.prototype.getBoundingClientRect = nativeRect; HTMLCanvasElement.prototype.toDataURL = nativePng
            }
        })
        console.log(`EDITOR_RENDERING_METRICS ${testInfo.project.name} ${pathname} ${JSON.stringify(metrics)}`)
        await testInfo.attach('editor-rendering-metrics.json', { contentType: 'application/json', body: JSON.stringify(metrics) })
        expect(metrics.distantStyles).toBe(0)
        expect(metrics.distantRects).toBe(0)
        expect(requests.some(path => /vanta|three/i.test(path))).toBe(false)
        await page.getByRole('textbox', { name: 'Name 35', exact: true }).scrollIntoViewIfNeeded()
        await expect(page.locator('[data-perf-row="35"] [data-tahoe-glass-surface="recessed"]').first()).toHaveAttribute('data-tahoe-glass-visible', 'true')
        await expect(page.locator('[data-perf-row="35"] [data-tahoe-glass-surface="recessed"]').first()).toHaveAttribute('data-tahoe-glass-measured', 'true')
        await page.getByRole('textbox', { name: 'Name 35', exact: true }).fill('Still editable after scrolling')
        await expect(page.getByRole('textbox', { name: 'Name 35', exact: true })).toHaveValue('Still editable after scrolling')
        await page.evaluate(() => window.disposeFixture())
        await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
        expect(errors).toEqual([])
    })
}
