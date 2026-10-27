import { test, expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const fixture = `
  import React,{useState} from 'react';import{createRoot}from'react-dom/client';
  import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
  import{TahoeGlassSurface,TahoeGlassButton}from'./src/components/ui/tahoe-glass/TahoeGlassSurface';
  import{TahoeBackdropSurface}from'./src/components/ui/tahoe-glass/TahoeBackdropHeader';
  import{TahoeGlassDialog,TahoeGlassPopover}from'./src/components/ui/tahoe-glass/TahoeGlassOverlays';
  import{TahoeGlassDirectBackdropBoundaryContext}from'./src/components/ui/tahoe-glass/TahoeGlassBoundaryContext';
  const registrations=new Map();window.__glassHistory=[];window.__glassDuplicates=[];
  window.__glassStats=()=>[...registrations.values()].map(({element,options})=>({name:element.dataset.testid,refractive:options?.refractive}));
  const context={diagnostics:{status:'fallback',backend:'css-blur',source:'dom-scene',reason:'fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1},
    registerSurface(id,element,options){if(registrations.has(id))window.__glassDuplicates.push(element.dataset.testid);registrations.set(id,{element,options});window.__glassHistory.push({event:'register',name:element.dataset.testid});},
    unregisterSurface(id){registrations.delete(id);},requestRender(){}};
  function App(){const[dialog,setDialog]=useState(false);const[popover,setPopover]=useState(false);const[pressed,setPressed]=useState(0);
    return <TahoeGlassEngineContext.Provider value={context}>
      <TahoeBackdropSurface as="nav" variant="menu" aria-label="Fixture navigation" data-testid="fixture-nav" tone="light" semanticTint="dark" semanticTintOpacity={.38} style={{position:'fixed',top:12,left:16,right:16,height:88,padding:20}} contentClassName="flex items-center justify-between">
        <span>nsso</span><TahoeGlassButton data-testid="legacy-nav-control" onClick={()=>setPressed(n=>n+1)} tone="light" className="min-h-11 px-4 py-2">Pressed {pressed}</TahoeGlassButton>
      </TahoeBackdropSurface>
      <main className="space-y-6 px-5 pb-20 pt-32">
        <button onClick={()=>setDialog(true)}>Open readable dialog</button><button onClick={()=>setPopover(true)}>Open readable popover</button>
        <TahoeGlassSurface data-testid="fixture-card" variant="card" tone="light" semanticTint="dark" semanticTintOpacity={.38} style={{width:'min(600px,100%)',height:180,padding:24}}>Readable card with preserved grey wash</TahoeGlassSurface>
        <TahoeGlassSurface data-testid="default-card" variant="card" tone="light" style={{width:'min(600px,100%)',height:120,padding:24}}>Default card contrast</TahoeGlassSurface>
        <TahoeBackdropSurface data-testid="fixture-backdrop" variant="card" tone="light" semanticTint="dark" semanticTintOpacity={.38} style={{width:'min(600px,100%)',height:160,padding:24}}>A direct backdrop card</TahoeBackdropSurface>
        <TahoeGlassDirectBackdropBoundaryContext.Provider value={true}><TahoeGlassSurface data-testid="protected-card" variant="card" tone="light" style={{height:80,padding:16}}>Protected nested surface</TahoeGlassSurface></TahoeGlassDirectBackdropBoundaryContext.Provider>
        <TahoeGlassSurface data-testid="marked-card" data-tahoe-readable-overlay="true" variant="card" tone="light" style={{height:80,padding:16}}>An explicitly excluded reading surface</TahoeGlassSurface>
      </main>
      <TahoeGlassDialog open={dialog} onOpenChange={setDialog} title="Readable fixture" tone="light" semanticTint="dark" semanticTintOpacity={.38} backdropClassName="bg-black/70">
        <TahoeGlassSurface data-testid="dialog-child" variant="card" tone="light">Keep popup children out of clear optics</TahoeGlassSurface>
        <button onClick={()=>setDialog(false)}>Close readable dialog</button>
      </TahoeGlassDialog>
      <TahoeGlassPopover open={popover} onOpenChange={setPopover} aria-label="Readable help" tone="light" style={{top:140,left:24,width:300}}>
        <TahoeGlassSurface data-testid="popover-child" variant="card" tone="light">Opaque help content</TahoeGlassSurface><button onClick={()=>setPopover(false)}>Close readable popover</button>
      </TahoeGlassPopover>
    </TahoeGlassEngineContext.Provider>;
  }
  const appRoot=createRoot(document.getElementById('root'));window.__unmountGlass=()=>appRoot.unmount();appRoot.render(<App/>);
`

test.beforeAll(async () => {
    const files = ['src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx', 'src/components/ui/experimental/liquid-glass-candidate.tsx']
    const source = files.map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture
    const candidates = [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;min-height:1400px;background-color:#365469;background-image:linear-gradient(#c8f1f8 1px,transparent 1px),linear-gradient(90deg,#c8f1f8 1px,transparent 1px);background-size:32px 32px;color:white;font-family:Arial}button{min-height:44px;padding:8px 12px;background:#202126;border:1px solid #aaa;border-radius:10px}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: fixture } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('https://nsso.test/**', route => {
        const pathname = new URL(route.request().url()).pathname
        if (pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/chrome-glass-fixture')
}

async function expectPolicy(page, desktop) {
    for (const name of ['fixture-nav', 'fixture-card', 'default-card', 'fixture-backdrop']) {
        const surface = page.getByTestId(name)
        if (desktop) await expect(surface).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
        else await expect(surface).not.toHaveAttribute('data-tahoe-chromium-optics')
    }
    for (const name of ['protected-card', 'marked-card', 'legacy-nav-control']) await expect(page.getByTestId(name)).not.toHaveAttribute('data-tahoe-chromium-optics')
}

test('real shared surfaces use one desktop renderer and retain mobile ownership', async ({ page }, testInfo) => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await mount(page)
    const desktop = testInfo.project.name === 'desktop'
    await expectPolicy(page, desktop)
    await expect.poll(() => page.evaluate(() => window.__glassDuplicates)).toEqual([])
    const registered = await page.evaluate(() => window.__glassStats())
    for (const name of ['fixture-card', 'default-card']) expect(registered.some(entry => entry.name === name)).toBe(!desktop)
    expect(registered.filter(entry => entry.name === 'fixture-nav' || entry.name === 'fixture-backdrop')).toEqual([])
    expect(registered.find(entry => entry.name === 'protected-card')?.refractive).toBe(false)
    await page.getByRole('button', { name: 'Pressed 0', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pressed 1', exact: true })).toBeVisible()
    await page.evaluate(() => window.__unmountGlass())
    expect(await page.evaluate(() => window.__glassStats())).toEqual([])
    expect(await page.locator('filter[id^="lgf"]').count()).toBe(0)
    expect(errors).toEqual([])
})

test('readable grey transmission layers survive desktop optics and mobile fallback', async ({ page }) => {
    await mount(page)
    for (const name of ['fixture-nav', 'fixture-card', 'fixture-backdrop']) {
        const surface = page.getByTestId(name)
        await expect(surface).toHaveAttribute('data-tahoe-glass-tint', 'dark')
        const veil = await surface.evaluate(element => [...element.children].map(child => getComputedStyle(child)).filter(style => style.backgroundColor === 'rgb(8, 12, 20)').map(style => Number(style.opacity)))
        expect(veil).toEqual([0.38])
    }
})

test('dialogs and popovers and their child cards stay opaque and opt out', async ({ page }) => {
    await mount(page)
    for (const [trigger, title, child, close] of [
        ['Open readable dialog', 'Readable fixture', 'dialog-child', 'Close readable dialog'],
        ['Open readable popover', 'Readable help', 'popover-child', 'Close readable popover'],
    ]) {
        await page.getByRole('button', { name: trigger, exact: true }).click()
        const panel = page.getByRole('dialog', { name: title, exact: true })
        await expect(panel).toHaveAttribute('data-tahoe-readable-overlay', 'true')
        await expect(panel).not.toHaveAttribute('data-tahoe-chromium-optics')
        await expect(page.getByTestId(child)).not.toHaveAttribute('data-tahoe-chromium-optics')
        expect(await panel.evaluate(element => getComputedStyle(element, '::before').backgroundColor)).toBe('rgb(32, 33, 38)')
        await expect(panel.locator('[data-tahoe-chromium-optics]')).toHaveCount(0)
        await panel.getByRole('button', { name: close, exact: true }).click()
        await expect(panel).toHaveCount(0)
    }
})

test('resizing releases the new desktop lens and resumes the legacy route safely', async ({ page }, testInfo) => {
    await mount(page)
    await expectPolicy(page, testInfo.project.name === 'desktop')
    await page.setViewportSize({ width: 390, height: 844 })
    await expectPolicy(page, false)
    await expect.poll(() => page.evaluate(() => window.__glassStats().some(entry => entry.name === 'fixture-card'))).toBe(true)
    if (testInfo.project.name === 'desktop') {
        await page.setViewportSize({ width: 1440, height: 900 })
        await expectPolicy(page, true)
        expect(await page.evaluate(() => window.__glassStats().some(entry => ['fixture-card', 'default-card', 'fixture-nav', 'fixture-backdrop'].includes(entry.name)))).toBe(false)
    }
    expect(await page.evaluate(() => window.__glassDuplicates)).toEqual([])
})

test('390 to 1440 to 390 restores byte-identical legacy SVG fields', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await expectPolicy(page, false)
    async function legacyFields() {
        const fields = []
        for (const name of ['fixture-nav', 'fixture-backdrop']) {
            const surface = page.getByTestId(name)
            await expect(surface).toHaveAttribute('data-tahoe-refraction-backend', 'svg-live-dom')
            await expect.poll(() => surface.evaluate(element => element.nextElementSibling?.querySelector('feImage')?.getAttribute('href')?.startsWith('data:image/png'))).toBe(true)
            // Mobile stays on the same backend through every resize. Its
            // backend flag cannot signal completion of the next RAF's map.
            await expect.poll(() => surface.evaluate(element => {
                const image = element.nextElementSibling?.querySelector('feImage')
                const rect = element.getBoundingClientRect()
                return Number(image?.getAttribute('width')) === Math.max(1, Math.round(rect.width)) &&
                    Number(image?.getAttribute('height')) === Math.max(1, Math.round(rect.height))
            })).toBe(true)
            const snapshot = await surface.evaluate(element => ({
                field: element.nextElementSibling.querySelector('feImage').getAttribute('href'),
                filter: getComputedStyle(element).backdropFilter,
                radius: getComputedStyle(element).borderRadius,
            }))
            // Preserve exact-byte comparison without dumping giant PNGs into
            // CI logs if a genuine optical regression changes the field.
            fields.push({ ...snapshot, field: createHash('sha256').update(snapshot.field).digest('hex') })
        }
        return fields
    }
    const before = await legacyFields()
    await page.setViewportSize({ width: 1440, height: 900 })
    await expectPolicy(page, testInfo.project.name === 'desktop')
    await page.setViewportSize({ width: 390, height: 844 })
    await expectPolicy(page, false)
    await expect.poll(legacyFields).toEqual(before)
    expect(await page.evaluate(() => window.__glassDuplicates)).toEqual([])
})

test('dynamic reduced-transparency and forced-colors changes release Chrome optics', async ({ page, context }, testInfo) => {
    await mount(page)
    const desktop = testInfo.project.name === 'desktop'
    await expectPolicy(page, desktop)
    const cdp = await context.newCDPSession(page)
    for (const feature of ['prefers-reduced-transparency', 'forced-colors']) {
        await cdp.send('Emulation.setEmulatedMedia', { features: [
            { name: 'prefers-reduced-motion', value: 'reduce' },
            { name: 'prefers-reduced-transparency', value: feature === 'prefers-reduced-transparency' ? 'reduce' : 'no-preference' },
            { name: 'forced-colors', value: feature === 'forced-colors' ? 'active' : 'none' },
        ] })
        await expect.poll(() => page.evaluate(name => matchMedia(`(${name}: ${name === 'forced-colors' ? 'active' : 'reduce'})`).matches, feature)).toBe(true)
        await expectPolicy(page, false)
        await expect(page.getByTestId('fixture-nav')).toHaveAttribute('data-tahoe-refraction-backend', 'solid')
        await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
        await expectPolicy(page, desktop)
    }
    await cdp.detach()
    expect(await page.evaluate(() => window.__glassDuplicates)).toEqual([])
})
