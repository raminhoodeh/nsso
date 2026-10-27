import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
const fixture = `
  import React from 'react';import{createRoot}from'react-dom/client';
  import{TahoeBackdropSurface}from'./src/components/ui/tahoe-glass/TahoeBackdropHeader';
  import LightGlassPanel from './src/components/ui/LightGlassPanel';
  const style={width:280,height:160,margin:20,padding:20};
  createRoot(document.getElementById('root')).render(<>
    <TahoeBackdropSurface data-testid="default" tone="dark" style={style}>Default calibration</TahoeBackdropSurface>
    <TahoeBackdropSurface data-testid="light" tone="dark" chromiumAppearance="light" style={style}>Light calibration</TahoeBackdropSurface>
    <LightGlassPanel data-testid="wrapped-light" chromiumAppearance="light" style={style}>Wrapped light calibration</LightGlassPanel>
  </>);
`

test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: fixture } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    await page.route('https://nsso.test/**', route => {
        if (new URL(route.request().url()).pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:linear-gradient(120deg,#baddec,#f5eee2);min-height:100vh;font-family:Arial}#root>div{box-sizing:border-box;position:relative}</style><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/glass-appearance')
}

async function opticalCalibration(surface) {
    return surface.evaluate(element => {
        const children = [...element.children].map(child => getComputedStyle(child))
        const lens = children.find(style => style.backdropFilter.includes('url('))
        const id = lens?.backdropFilter.match(/url\(["']?#([^\)"']+)/)?.[1]
        const curve = id ? document.getElementById(id)?.querySelector('feFuncR')?.getAttribute('tableValues') : undefined
        return {
            endpoint: curve ? Number(curve.split(/\s+/).at(-1)) : null,
            darkVeils: children.filter(style => /rgba?\(8[, ]+8[, ]+10/.test(style.backgroundColor)).length,
        }
    })
}

test('explicit light calibration removes desktop darkening and preserves the shared default and mobile route', async ({ page }, testInfo) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await mount(page)
    const desktop = testInfo.project.name === 'desktop'
    for (const name of ['default', 'light', 'wrapped-light']) {
        const surface = page.getByTestId(name)
        await expect(surface).not.toHaveAttribute('chromiumappearance')
        if (desktop) await expect(surface).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
        else {
            await expect(surface).not.toHaveAttribute('data-tahoe-chromium-optics')
            await expect(surface).toHaveAttribute('data-tahoe-refraction-backend', 'svg-live-dom')
            expect(await opticalCalibration(surface)).toEqual({ endpoint: null, darkVeils: 0 })
        }
    }
    if (desktop) {
        const original = await opticalCalibration(page.getByTestId('default'))
        expect(original.endpoint).toBeGreaterThan(0.7)
        expect(original.endpoint).toBeLessThan(0.8)
        expect(original.darkVeils).toBe(1)
        for (const name of ['light', 'wrapped-light']) {
            expect(await opticalCalibration(page.getByTestId(name))).toEqual({ endpoint: 1, darkVeils: 0 })
        }
    }
    expect(errors).toEqual([])
})

test('light calibration cannot override reduced transparency or forced colors', async ({ page, context }, testInfo) => {
    await mount(page)
    const cdp = await context.newCDPSession(page)
    for (const feature of ['prefers-reduced-transparency', 'forced-colors']) {
        await cdp.send('Emulation.setEmulatedMedia', { features: [
            { name: 'prefers-reduced-transparency', value: feature === 'prefers-reduced-transparency' ? 'reduce' : 'no-preference' },
            { name: 'forced-colors', value: feature === 'forced-colors' ? 'active' : 'none' },
        ] })
        for (const name of ['default', 'light', 'wrapped-light']) {
            const surface = page.getByTestId(name)
            await expect(surface).not.toHaveAttribute('data-tahoe-chromium-optics')
            await expect(surface).toHaveAttribute('data-tahoe-refraction-backend', 'solid')
            // The solid accessibility material must survive the appearance override.
            expect(await surface.evaluate(element => [...element.children].map(child => child.style.backgroundColor.toLowerCase()))).toContain('canvas')
        }
        await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
        await cdp.send('Emulation.setEmulatedMedia', { features: [] })
        if (testInfo.project.name === 'desktop') {
            await expect(page.getByTestId('light')).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
            expect(await opticalCalibration(page.getByTestId('light'))).toEqual({ endpoint: 1, darkVeils: 0 })
        }
    }
    await cdp.detach()
})
