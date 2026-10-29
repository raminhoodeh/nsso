import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { controlMaterial, expectWhiteEditorControls, keyboardFocus, renderedControlContrast } from './helpers/white-control-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const fixture = `
 import React from 'react';import {createRoot} from 'react-dom/client';
 import DashboardGlassCard from './src/app/dashboard/components/DashboardGlassCard';
 import ProfileGlassCard from './src/components/profile/ProfileGlassCard';
 import GlassCard from './src/components/ui/GlassCard';
 import {LightButton,LightCloseButton} from './src/components/ui/LightButton';
 import AskDeityButton from './src/components/ui/AskDeityButton';
 import {LIGHT_PANEL} from './src/components/ui/light-panel';
 import {TahoeGlassEngineContext} from './src/components/providers/TahoeGlassProvider';
 window.materialActions=[];window.materialSubmits=0;window.materialRegistrations=[];
 const context={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'bright-material-proof',reducedMotion:false,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1},
 registerSurface(id,element,options){window.materialRegistrations.push({id,tag:element.tagName,variant:element.dataset.tahoeGlassSurface,continuous:!!options?.continuous})},unregisterSurface(){},requestRender(){}};
 const button=(label,intent)=> <LightButton intent={intent} onClick={()=>window.materialActions.push(label)}>{label}</LightButton>;
 function Contents({name}){return <form aria-label={name+' controls'} onSubmit={event=>{event.preventDefault();window.materialSubmits++}}>
  <h2><span>{name} heading</span></h2><p><span>Clear text on the shared bright crystal surface.</span></p>
  <div data-controls>{button(name+' default')}{button(name+' muted','muted')}{button(name+' danger','danger')}
   <LightCloseButton aria-label={'Close '+name} onClick={()=>window.materialActions.push('close '+name)}/>
   <AskDeityButton aria-label={'Ask about '+name} onClick={()=>window.materialActions.push('ask '+name)}/>
   <LightButton disabled onClick={()=>window.materialActions.push('disabled')}>Unavailable</LightButton>
  </div><span data-premium-chip className={LIGHT_PANEL.control+' inline-flex rounded-full px-3 py-1 text-xs'}>Premium Free</span>
 </form>}
 const scenes=[['white','#fff'],['sky','#586e91'],['deck','#43628c']];
 const panelKind=new URLSearchParams(location.search).get('kind')||'dashboard';
 const Card=panelKind==='profile'?ProfileGlassCard:DashboardGlassCard;
 const app=createRoot(document.getElementById('root'));window.disposeMaterialFixture=()=>app.unmount();
 app.render(<TahoeGlassEngineContext.Provider value={context}><main>{scenes.map(([scene,background])=><section key={scene} data-scene={scene} style={{background,backgroundImage:scene==='deck'?"url('/assets/backgrounds/nsso-deck-blue.webp')":undefined,backgroundSize:'cover'}}>
  <div data-core-panel={panelKind}><Card style={{padding:24}}><Contents name={scene+' '+panelKind}/></Card></div>
 </section>)}<section data-standalone style={{background:'#43628c',backgroundImage:"url('/assets/backgrounds/nsso-deck-blue.webp')",backgroundSize:'cover'}}>{button('Standalone default')}<AskDeityButton aria-label="Standalone assistance"/></section>
 <div data-reading-scene style={{background:'#43628c',backgroundImage:"url('/assets/backgrounds/nsso-deck-blue.webp')",backgroundSize:'cover',padding:16}}><section data-reading className="nsso-crystal-reading"><h1><span>Page heading outside a card</span></h1><label><span>Profile name</span><input aria-label="Profile name" defaultValue="Synthetic identity"/></label></section></div>
 <section data-legacy><GlassCard tone="light" semanticTint="dark" semanticTintOpacity={.38}><p>Explicit dark material remains available to separate apps.</p></GlassCard></section></main></TahoeGlassEngineContext.Provider>);
`

test.beforeAll(async () => {
    const files = ['src/app/dashboard/components/DashboardGlassCard.tsx', 'src/components/profile/ProfileGlassCard.tsx', 'src/components/ui/GlassCard.tsx', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/light-panel.ts', 'src/components/ui/AskDeityButton.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx']
    const sources = files.map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture
    const candidates = [...sources.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;font-family:Arial;background:#586e91}main{padding:12px;display:grid;gap:20px}section{padding:16px;display:grid;gap:20px}h2{margin:0 0 8px}p{margin:0 0 12px}form [data-controls]{display:flex;align-items:center;gap:8px;flex-wrap:wrap}form [data-premium-chip]{margin-top:12px}*{box-sizing:border-box}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: fixture } })
    bundle = result.outputFiles[0].text
})

async function mount(page, { kind = 'dashboard' } = {}) {
    const errors = [], external = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') { external.push(url.href); return route.abort() }
        if (url.pathname === '/assets/backgrounds/nsso-deck-blue.webp') return route.fulfill({ contentType: 'image/webp', body: readFileSync(root + 'public/assets/backgrounds/nsso-deck-blue.webp') })
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/bright-materials?kind=' + kind)
    await expect(page.getByRole('heading', { name: `white ${kind} heading` })).toBeVisible()
    return { errors, external }
}

for (const kind of ['dashboard', 'profile']) test(`real ${kind} wrapper uses translucent material and readable native controls`, async ({ page }, testInfo) => {
    const state = await mount(page, { kind })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const samples = []
    for (const scene of ['white', 'sky', 'deck']) {
        const host = page.locator(`[data-scene="${scene}"] [data-core-panel="${kind}"]`)
        const panel = host.locator('[data-tahoe-glass-surface]').first()
        await expect(panel).toHaveAttribute('data-tahoe-glass-tone', 'dark')
        await expect(panel).toHaveAttribute('data-tahoe-glass-tint', 'light')
        await expect(panel).toHaveAttribute('data-tahoe-chromium-appearance', 'light')
        await expect(panel).toHaveAttribute('data-tahoe-material-finish', 'satin')
        await expect(panel).toHaveClass(/nsso-crystal-panel/)
        const coating = await panel.evaluate(element => {
            const style = getComputedStyle(element, '::after')
            return { image: style.backgroundImage, events: style.pointerEvents, zIndex: Number(style.zIndex), shadow: getComputedStyle(element.querySelector('form')).textShadow }
        })
        expect(coating.image).not.toBe('none')
        expect(coating.events).toBe('none')
        expect(coating.zIndex).toBeLessThan(20)
        expect(coating.shadow).toBe('none')
        for (const copy of await host.locator('h2,p').all()) expect(await renderedControlContrast(copy), `${scene} ${kind} core copy contrast`).toBeGreaterThanOrEqual(4.5)
        const controls = await expectWhiteEditorControls(host)
        const chip = host.locator('[data-premium-chip]')
        await expect(chip).toHaveClass(/nsso-glass-control/)
        await expect(chip.locator('[data-tahoe-glass-surface]')).toHaveCount(0)
        const action = controls.find(control => control.label === `${scene} ${kind} default`)
        samples.push({ scene, kind, material: action, paint: action.paint })
    }
    // The real scene must still transmit through the complete panel/control
    // stack, not merely declare an alpha underneath a hidden opaque coating.
    {
        const white = samples.find(sample => sample.kind === kind && sample.scene === 'white').paint.centerBackground
        const dark = samples.find(sample => sample.kind === kind && sample.scene === 'deck').paint.centerBackground
        expect(white.every((channel, index) => channel > dark[index] + 5), kind + ' visible scene transmission').toBe(true)
    }
    const legacy = page.locator('[data-legacy] [data-tahoe-glass-surface]')
    await expect(legacy).toHaveAttribute('data-tahoe-glass-tone', 'light')
    await expect(legacy).toHaveAttribute('data-tahoe-glass-tint', 'dark')
    await expect(legacy).not.toHaveClass(/nsso-crystal-panel/)
    const registrations = await page.evaluate(() => window.materialRegistrations)
    await expect(page.locator('[data-tahoe-glass-surface]')).toHaveCount(4)
    expect(registrations.every(item => !['BUTTON', 'SPAN'].includes(item.tag) && !['button', 'pill'].includes(item.variant))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await testInfo.attach('shared-bright-materials', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
    await page.evaluate(() => window.disposeMaterialFixture())
    expect(state).toEqual({ errors: [], external: [] })
})

test('standalone glass controls and compact status copy remain readable over the actual deck scene', async ({ page }) => {
    const state = await mount(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const standalone = page.locator('[data-standalone]')
    await expectWhiteEditorControls(standalone)
    const reading = page.locator('[data-reading]')
    const readingMaterial = await reading.evaluate(element => ({ background: getComputedStyle(element).backgroundImage, shadow: getComputedStyle(element).textShadow }))
    expect(readingMaterial.background).toContain('0.36)')
    expect(readingMaterial.background).toContain('0.42)')
    expect(readingMaterial.shadow).toBe('none')
    expect(await renderedControlContrast(reading.locator('h1'))).toBeGreaterThanOrEqual(4.5)
    expect(await renderedControlContrast(reading.locator('label'))).toBeGreaterThanOrEqual(4.5)
    await page.evaluate(() => window.disposeMaterialFixture())
    expect(state).toEqual({ errors: [], external: [] })
})

test('bright native controls preserve keyboard action, disabled state, focus and motion preferences', async ({ page, browserName }) => {
    const state = await mount(page)
    const host = page.locator('[data-scene="sky"] [data-core-panel="dashboard"]')
    const control = host.getByRole('button', { name: 'sky dashboard default', exact: true })
    await control.scrollIntoViewIfNeeded()
    await keyboardFocus(control, page, browserName)
    expect((await controlMaterial(control)).outline).toMatchObject({ width: '2px', style: 'solid' })
    await control.press('Enter')
    await control.press('Space')
    const close = host.getByRole('button', { name: 'Close sky dashboard', exact: true })
    expect(await controlMaterial(close)).toMatchObject({ width: 44, height: 44, icon: { width: '18', height: '18' } })
    await close.click()
    const unavailable = host.getByRole('button', { name: 'Unavailable', exact: true })
    await expect(unavailable).toBeDisabled()
    expect(await page.evaluate(() => window.materialActions)).toEqual(['sky dashboard default', 'sky dashboard default', 'close sky dashboard'])
    expect(await page.evaluate(() => window.materialSubmits)).toBe(0)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(control).toHaveCSS('transition-property', 'none')
    await expect(control).toHaveCSS('animation-name', 'none')
    await expect(control).toHaveCSS('backdrop-filter', 'none')
    await page.evaluate(() => window.disposeMaterialFixture())
    expect(state).toEqual({ errors: [], external: [] })
})

test('forced-colour controls stay solid, readable and focused in idle and hover states', async ({ page, browserName }) => {
    const state = await mount(page, { kind: 'profile' })
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
    // WebKit does not advertise forced-colors; it must still retain its normal
    // accessible material. Chromium exercises the actual system-colour branch.
    const forced = await page.evaluate(() => matchMedia('(forced-colors: active)').matches)
    const host = page.locator('[data-scene="deck"] [data-core-panel="profile"]')
    for (const intent of ['default', 'muted', 'danger']) {
        const control = host.getByRole('button', { name: `deck profile ${intent}`, exact: true })
        await control.scrollIntoViewIfNeeded()
        for (const hovered of [false, true]) {
            if (hovered) await control.hover()
            else await page.mouse.move(0, 0)
            const material = await controlMaterial(control)
            expect(material.ink).not.toBe(material.background)
            if (forced) { expect(material.backgroundImage).toBe('none'); expect(material.shadow).toBe('none') }
            expect(await renderedControlContrast(control)).toBeGreaterThanOrEqual(4.5)
        }
    }
    const close = host.getByRole('button', { name: 'Close deck profile', exact: true })
    await keyboardFocus(close, page, browserName)
    expect((await controlMaterial(close)).outline).toMatchObject({ width: '2px', style: 'solid' })
    await page.evaluate(() => window.disposeMaterialFixture())
    expect(state).toEqual({ errors: [], external: [] })
})
