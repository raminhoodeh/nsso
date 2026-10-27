import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React,{useState} from 'react';import{createRoot}from'react-dom/client';
            import LightGlassPanel from './src/components/ui/LightGlassPanel';
            function App(){const [height,setHeight]=useState(854);window.resizeFixture=setHeight;return <LightGlassPanel data-testid="large-card" chromiumAppearance="light" style={{position:'relative',width:1088,height,margin:20}}>Large glass card</LightGlassPanel>}
            const app=createRoot(document.getElementById('root'));window.disposeFixture=()=>app.unmount();app.render(<App/>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    await page.route('https://nsso.test/**', route => new URL(route.request().url()).pathname === '/fixture.js'
        ? route.fulfill({ contentType: 'application/javascript', body: bundle })
        : route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:linear-gradient(130deg,#739ab7,#dfc5bd);font-family:Arial}*{box-sizing:border-box}</style><div id="root"></div><script src="/fixture.js"></script>' }))
    await page.goto('https://nsso.test/rim-resolution')
    await expect(page.getByTestId('large-card')).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
}

async function rimPixels(page) {
    return page.getByTestId('large-card').locator('[data-liquid-glass-rim="nine-slice"]').evaluate(async el => {
        const style = getComputedStyle(el)
        const source = style.borderImageSource.match(/url\(["']?(.*?)["']?\)$/)?.[1]
        if (!source) throw Error('Rim must paint its real nine-slice atlas')
        const image = new Image(); image.src = source; await image.decode()
        return { width: image.naturalWidth, height: image.naturalHeight,
            cssWidth: Number(el.getAttribute('data-liquid-glass-rim-css-width')),
            cssHeight: Number(el.getAttribute('data-liquid-glass-rim-css-height')),
            repeat: style.borderImageRepeat, pointerEvents: style.pointerEvents,
            field: await (async () => {
                const card = el.closest('[data-testid="large-card"]')
                const lens = [...card.children].find(child => getComputedStyle(child).backdropFilter.includes('url('))
                const id = getComputedStyle(lens).backdropFilter.match(/url\(["']?#([^\)"']+)/)?.[1]
                const map = new Image(); map.src = document.getElementById(id).querySelector('feImage').getAttribute('href'); await map.decode()
                return { width: map.naturalWidth, height: map.naturalHeight }
            })(),
        }
    })
}

for (const dpr of [2, 4]) test.describe(`physical rim resolution at DPR ${dpr}`, () => {
    test.use({ viewport: { width: 1470, height: 900 }, deviceScaleFactor: dpr, isMobile: false, hasTouch: false })
    test('large cards keep crisp corners without growing a full-card Retina texture', async ({ page, context }) => {
        const errors = []; page.on('pageerror', error => errors.push(error.message))
        await mount(page)
        const initial = await rimPixels(page)
        expect(initial.width / initial.cssWidth).toBeGreaterThanOrEqual(dpr)
        expect(initial.height / initial.cssHeight).toBeGreaterThanOrEqual(dpr)
        expect(initial.width * initial.height).toBeLessThanOrEqual(1_048_576)
        expect(initial.field.width * initial.field.height).toBeLessThanOrEqual(262_144)
        expect(initial.repeat).toBe('stretch')
        expect(initial.pointerEvents).toBe('none')
        await page.evaluate(() => window.resizeFixture(4000))
        await expect(page.getByTestId('large-card')).toHaveCSS('height', '4000px')
        await expect.poll(() => page.getByTestId('large-card').evaluate(el => [...el.children].some(child => getComputedStyle(child).backdropFilter.includes('4000')))).toBe(true)
        const tall = await rimPixels(page)
        expect({ width: tall.width, height: tall.height }).toEqual({ width: initial.width, height: initial.height })
        expect(tall.field.width * tall.field.height).toBeLessThanOrEqual(262_144)
        // Browser zoom or moving between screens can change density without
        // changing this fixed-size card. Its corner atlas must refresh too.
        const changedDpr = dpr === 2 ? 3 : 2
        const cdp = await context.newCDPSession(page)
        // A same-size CDP override emits no resolution/resize event in
        // Chromium. Nudge the viewport while the fixed card stays 1088px.
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1471, height: 900, deviceScaleFactor: changedDpr, mobile: false })
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(changedDpr)
        await expect.poll(() => page.evaluate(density => matchMedia(`(resolution: ${density}dppx)`).matches, changedDpr)).toBe(true)
        await expect.poll(() => page.getByTestId('large-card').locator('[data-liquid-glass-rim]').getAttribute('data-liquid-glass-rim-scale')).toBe(String(changedDpr))
        const resizedDensity = await rimPixels(page)
        expect(resizedDensity.width / resizedDensity.cssWidth).toBeGreaterThanOrEqual(changedDpr)
        expect(resizedDensity.height / resizedDensity.cssHeight).toBeGreaterThanOrEqual(changedDpr)
        expect(resizedDensity.field.width * resizedDensity.field.height).toBeLessThanOrEqual(262_144)
        await expect(page.getByTestId('large-card')).toHaveCSS('width', '1088px')
        await expect(page.getByTestId('large-card')).toHaveCSS('height', '4000px')
        await cdp.detach()
        await page.evaluate(() => window.disposeFixture())
        await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
        expect(errors).toEqual([])
    })
})
