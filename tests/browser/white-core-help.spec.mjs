import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expectOpaqueLightPanel, minimumTextContrast } from './helpers/light-panel-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
test.beforeAll(async () => {
    const files = ['src/app/dashboard/components/MyNssoTab.tsx', 'src/app/dashboard/components/SectionHelp.tsx', 'src/components/ui/light-panel.ts', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx']
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;background:#43628c;color:white;font-family:Arial}main{padding:24px}button,input,textarea{font:inherit}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'notes-help-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/link|@\/components\/providers\/UIProvider|@\/components\/ui\/Toast|@\/app\/dashboard\/components\/DashboardGlassCard|\.\/(?:NetworkTable|NetworkingTimeline))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/link' ? 'export default props=><a {...props}/>;'
                    : path.endsWith('UIProvider') ? 'const noop=()=>{};export const useUI=()=>({setBackgroundDimmed:noop});'
                        : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:message=>window.fixtureToasts.push(message)});'
                            : path.endsWith('NetworkTable') ? 'export default ({connections,onOpenNotes})=><div>{connections.map(row=><button key={row.id} type="button" style={{minHeight:44}} onClick={()=>onOpenNotes(row)}>Edit notes for {row.fullName}</button>)}</div>;'
                                : path.endsWith('NetworkingTimeline') ? 'export default ()=>null;'
                                    : 'export default ({children})=><div>{children}</div>;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import{createRoot}from'react-dom/client';import Network from './src/app/dashboard/components/MyNssoTab';import Help from './src/app/dashboard/components/SectionHelp';import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
            window.fixtureToasts=[];const context={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'white-reading-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1},registerSurface(){},unregisterSurface(){},requestRender(){}};
            const connection={id:'synthetic-connection',connectedUserId:'synthetic-other',username:'fixture',fullName:'Fixture Connection',dateMet:'2026-10-01',location:'',notes:'Saved synthetic notes'};
            createRoot(document.getElementById('root')).render(<TahoeGlassEngineContext.Provider value={context}><main><section><Help title="Purchases">This provider handles payment and delivery. Your profile only links to it.</Help><button type="button" style={{minHeight:44}}>Outside help target</button></section><Network initialData={{connections:[connection]}}/></main></TahoeGlassEngineContext.Provider>);
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
    await trigger.press('Enter')
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toContainText('This provider handles payment and delivery.')
    await expectOpaqueLightPanel(page, tooltip)
    expect(await minimumTextContrast(tooltip)).toBeGreaterThanOrEqual(4.5)
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
