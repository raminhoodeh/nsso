import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
const grid = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="white"/><rect width="16" height="16" fill="#111"/><rect x="16" y="16" width="16" height="16" fill="#111"/><path d="M0 0H32V32" fill="none" stroke="#36bbcc" stroke-width="2"/></pattern></defs><rect width="1600" height="1000" fill="url(#p)"/></svg>')
let bundle, css
const fixture = `
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {TahoeGlassProvider,TahoeGlassEngineContext} from './src/components/providers/TahoeGlassProvider';
 import {LiquidGlassViewport,LiquidGlassButton} from './src/components/ui/apple-tahoe-liquid-glass-button';
 import {LightButton} from './src/components/ui/LightButton';
 import AskDeityButton from './src/components/ui/AskDeityButton';
 const grid=${JSON.stringify(grid)};
 const ownedGridSource={kind:'image',src:grid,fit:'cover',label:'owned-test-grid'};
 window.actions=[];window.refraction=true;
 function Controls({refractive}){
   const engine=React.useContext(TahoeGlassEngineContext);
   const register=React.useCallback((id,node,options)=>engine.registerSurface(id,node,{...options,refractive}),[engine.registerSurface,refractive]);
   const context=React.useMemo(()=>({...engine,registerSurface:register}),[engine,register]);
   return <TahoeGlassEngineContext.Provider value={context}><main data-supplied-controls>
    <LightButton data-optical-target="first" style={{position:'fixed',left:'12%',top:'24%',width:150,height:52}} onClick={()=>window.actions.push('first')}>First lens</LightButton>
    <LightButton data-optical-target="second" style={{position:'fixed',right:'12%',top:'53%',width:150,height:52}} onClick={()=>window.actions.push('second')}>Second lens</LightButton>
    <AskDeityButton aria-label="Ask with supplied lens" style={{position:'fixed',left:'40%',top:'78%'}} onClick={()=>window.actions.push('ask')}/>
   </main></TahoeGlassEngineContext.Provider>
 }
 function Supplied(){const [refractive,set]=React.useState(true);window.setRefraction=value=>{window.refraction=value;set(value)};
  return <TahoeGlassProvider materialFamily="supplied" preferredBackend="auto" fallback="webgl" sourceLabel="owned-test-grid"
   scene={<img src={grid} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>}
   webglSource={ownedGridSource} className="h-screen w-screen">
   <Controls refractive={refractive}/></TahoeGlassProvider>
 }
 const app=createRoot(document.getElementById('root'));
 window.mountReference=()=>app.render(<LiquidGlassViewport bgImage={grid} className="h-screen w-screen"><LiquidGlassButton data-reference-control style={{position:'absolute',left:'calc(50% - 75px)',top:'calc(50% - 26px)',width:150,height:52,padding:0}}>Reference lens</LiquidGlassButton></LiquidGlassViewport>);
 window.mountSupplied=()=>app.render(<Supplied/>);window.dispose=()=>app.unmount();window.mountSupplied();
`

test.beforeAll(async () => {
    const files = ['src/components/providers/TahoeGlassProvider.tsx', 'src/components/ui/apple-tahoe-liquid-glass-button.tsx', 'src/components/ui/LightButton.tsx', 'src/components/ui/AskDeityButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/light-panel.ts']
    const sources = files.map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture
    const candidates = [...sources.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nhtml,body{margin:0;height:100%;font-family:Arial}*{box-sizing:border-box}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: fixture } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://nsso.test/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (path === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/supplied-optics')
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-glass-state', 'active')
    return errors
}

async function pixels(bytes) {
    return sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
}

function changedRegion(a, b, rect) {
    let changed = 0, total = 0, difference = 0
    const left = Math.max(0, Math.ceil(rect.x)), top = Math.max(0, Math.ceil(rect.y))
    const right = Math.min(a.info.width, Math.floor(rect.x + rect.width)), bottom = Math.min(a.info.height, Math.floor(rect.y + rect.height))
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const offset = (y * a.info.width + x) * 4
        const delta = Math.max(...[0, 1, 2].map(channel => Math.abs(a.data[offset + channel] - b.data[offset + channel])))
        changed += delta >= 20 ? 1 : 0
        difference += delta
        total++
    }
    return { changed, total, fraction: changed / total, mean: difference / total }
}

test('supplied source material drives every native lens through one actual refracting scene', async ({ page }, testInfo) => {
    const errors = await mount(page)
    const lenses = page.locator('[data-tahoe-native-lens="supplied"]')
    await expect(lenses).toHaveCount(3)
    for (const lens of await lenses.all()) {
        await expect(lens).toHaveAttribute('data-tahoe-glass-visible', 'true')
        await expect(lens.locator('[data-supplied-glass-layer="coat"]')).toHaveCount(1)
        await expect(lens.locator('[data-supplied-glass-layer="rim"]')).toHaveCount(1)
        await expect(lens.locator('canvas')).toHaveCount(0)
    }
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveCount(1)
    await expect(page.locator('[data-tahoe-glass-viewport] > canvas')).toHaveCount(1)
    await page.getByRole('button', { name: 'First lens', exact: true }).click()
    await page.getByRole('button', { name: 'Second lens', exact: true }).click()
    await page.getByRole('button', { name: 'Ask with supplied lens', exact: true }).click()
    expect(await page.evaluate(() => window.actions)).toEqual(['first', 'second', 'ask'])
    await page.screenshot({ path: testInfo.outputPath('supplied-native-reference-material.png'), scale: 'css' })

    // Hide only text and optical coats for both captures. A scene pixel change
    // then proves actual displacement, rather than just blur, tint or a rim.
    await page.addStyleTag({ content: '[data-supplied-controls] button,[data-supplied-controls] span{color:transparent!important;text-shadow:none!important}[data-supplied-glass-layer]{opacity:0!important}' })
    const rectangles = await lenses.evaluateAll(elements => elements.map(element => {
        const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }
    }))
    const refracted = await pixels(await page.screenshot({ scale: 'css' }))
    await page.evaluate(() => window.setRefraction(false))
    await expect.poll(() => page.locator('[data-tahoe-glass-provider]').getAttribute('data-tahoe-glass-state')).not.toBe('initializing')
    // Drain the shared engine's requested frame, not an arbitrary fixed delay.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    let regions
    await expect.poll(async () => {
        const neutral = await pixels(await page.screenshot({ scale: 'css' }))
        regions = rectangles.map(rect => changedRegion(refracted, neutral, rect))
        return Math.min(...regions.map(region => region.fraction))
    }, { message: 'every registered lens must visibly displace its scene pixels' }).toBeGreaterThan(.04)
    for (const [index, region] of regions.entries()) {
        expect(region.fraction, 'real displacement at native lens ' + index).toBeGreaterThan(.04)
        expect(region.changed).toBeGreaterThan(80)
    }
    const evidence = { regions, backend: await page.locator('[data-tahoe-glass-provider]').getAttribute('data-tahoe-glass-backend') }
    console.log('SUPPLIED_REFRACTION_PIXELS ' + testInfo.project.name + ' ' + JSON.stringify(evidence))
    await testInfo.attach('multiple-supplied-lens-pixels', { body: JSON.stringify(evidence), contentType: 'application/json' })
    expect(errors).toEqual([])
    await page.evaluate(() => window.dispose())
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveCount(0)
})

test('the retained original and production controls use the same canonical supplied coat and rim', async ({ page }) => {
    const errors = await mount(page)
    const production = await page.locator('[data-optical-target="first"] [data-supplied-glass-layer="coat"]').evaluate(element => ({ background: element.style.background, filter: element.style.backdropFilter, shadow: element.style.boxShadow }))
    await page.evaluate(() => window.mountReference())
    const reference = page.locator('[data-reference-control]')
    await expect(reference).toBeVisible()
    await expect.poll(() => reference.locator('[data-supplied-glass-layer="coat"]').evaluate(element => element.style.background)).toBe(production.background)
    const original = await reference.locator('[data-supplied-glass-layer="coat"]').evaluate(element => ({ background: element.style.background, filter: element.style.backdropFilter, shadow: element.style.boxShadow }))
    // WebGL deliberately has no second CSS frost layer in the supplied code.
    expect(production.shadow).toBe(original.shadow)
    expect(production.background).toBe(original.background)
    expect(production.filter).toBe(original.filter)
    await expect(reference.locator('[data-supplied-glass-layer="rim"]')).toHaveCount(1)
    expect(errors).toEqual([])
    await page.evaluate(() => window.dispose())
})
