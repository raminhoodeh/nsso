import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css

test.beforeAll(async () => {
    const files = ['src/components/ui/light-panel.ts', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx', 'src/app/dashboard/components/AdvancedModeCard.tsx', 'src/app/dashboard/components/DashboardGlassCard.tsx', 'src/app/dashboard/components/ConfirmDeleteDialog.tsx', 'src/components/ui/AskDeityButton.tsx', 'src/components/ui/GlassCard.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx']
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;background:linear-gradient(140deg,#34536c,#456f8f);color:white;font-family:Arial}button,input,textarea{font:inherit}#root{max-width:1120px;margin:auto;padding:24px 16px 120px}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'row-controls-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:@\/components\/providers\/ProfileProvider|@\/components\/ui\/Toast|\.\/ProductsServicesEditor|@\/components\/ui\/ImageCropperModal)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path.endsWith('ProfileProvider') ? 'import{useSyncExternalStore}from"react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,window.fixtureSnapshot,window.fixtureSnapshot);'
                    : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:()=>{}});'
                        : 'export default()=>null;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import{createRoot}from'react-dom/client';import Editor from'./src/app/dashboard/components/AdvancedModeCard';
            import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
            const listeners=new Set();let state;window.reorders=[];window.removals=[];window.prompts=[];
            window.fixtureSubscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};window.fixtureSnapshot=()=>state;
            const emit=patch=>{state={...state,...patch};listeners.forEach(fn=>fn())};
            const rows=(prefix,fields)=>[1,2].map(index=>({id:prefix+index,user_id:'synthetic-user',start_year:2020,end_year:2025,sort_order:index,...Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,value+' '+index]))}));
            const reorder=key=>async ids=>{window.reorders.push({key,ids});emit({[key]:ids.map(id=>state[key].find(row=>row.id===id))});return true};
            state={experiences:rows('experience-', {company_name:'Synthetic company',job_title:'Product manager'}),qualifications:rows('qualification-', {institution:'Synthetic university',qualification_name:'Product degree'}),projects:rows('project-', {project_name:'Synthetic project',contribution:'Product lead',description:'Synthetic project description'}),
                reorderExperiences:reorder('experiences'),reorderQualifications:reorder('qualifications'),reorderProjects:reorder('projects'),
                patchEntity:async(kind,id,patch)=>{const key={experience:'experiences',qualification:'qualifications',project:'projects'}[kind];emit({[key]:state[key].map(row=>row.id===id?{...row,...patch}:row)});return true},createEntity:async()=>({status:'rejected',changes:[]}),removeEntity:async(kind,id)=>{window.removals.push({kind,id});return true}};
            window.addEventListener('open-deity-chat',event=>window.prompts.push(event.detail.initialMessage));
            const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'layout',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            createRoot(document.getElementById('root')).render(<TahoeGlassEngineContext.Provider value={fallback}><Editor userId="synthetic-user"/></TahoeGlassEngineContext.Provider>);
        ` },
    })
    bundle = result.outputFiles[0].text
    // Private, synthetic-only visual-review page; no authenticated network access.
    const directory = root + 'private/editor-row-fixture'
    mkdirSync(directory, { recursive: true })
    writeFileSync(directory + '/fixture.js', bundle, { mode: 0o600 })
    writeFileSync(directory + '/fixture.css', css, { mode: 0o600 })
    writeFileSync(directory + '/index.html', '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>', { mode: 0o600 })
})

async function mount(page) {
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') throw new Error('Unexpected network access from synthetic row fixture')
        return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html', body: url.pathname.endsWith('.js') ? bundle : url.pathname.endsWith('.css') ? css : '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/rows')
    await page.getByRole('button', { name: /^Experience & Education/ }).click()
}

for (const [kind, tab, primary, detail, collection] of [
    ['experience', 'Job Titles', 'Company', 'Role', 'experiences'],
    ['qualification', 'Qualifications', 'Institution', 'Qualification', 'qualifications'],
    ['project', 'Projects', 'Project name', 'Your contribution', 'projects'],
]) {
    test(`${kind} controls have separate aligned rows and preserve keyboard reordering`, async ({ page }) => {
        await mount(page)
        await page.getByRole('tab', { name: tab, exact: true }).click()
        const main = page.getByRole('textbox', { name: primary, exact: true }).first()
        const secondary = page.getByRole('textbox', { name: detail, exact: true }).first()
        const remove = page.getByRole('button', { name: `Delete ${kind}`, exact: true }).first()
        const drag = page.getByRole('button', { name: `Drag to reorder ${kind}`, exact: true }).first()
        const primaryRow = page.locator('[data-editor-primary-row]').first()
        const [field, detailBox, x, grip, row] = await Promise.all([main.boundingBox(), secondary.boundingBox(), remove.boundingBox(), drag.boundingBox(), primaryRow.boundingBox()])
        const primaryWidth = await page.locator('[data-editor-primary-field]').first().evaluate(e => e.getBoundingClientRect().width)
        expect(primaryWidth / row.width).toBeGreaterThan(.62)
        expect(primaryWidth / row.width).toBeLessThanOrEqual(.71)
        expect(field.x + field.width).toBeLessThan(x.x)
        expect(Math.abs((field.y + field.height / 2) - (x.y + x.height / 2))).toBeLessThan(3)
        expect(grip.x + grip.width).toBeLessThan(detailBox.x)
        expect(Math.abs((detailBox.y + detailBox.height / 2) - (grip.y + grip.height / 2))).toBeLessThan(3)
        expect(grip.width).toBeGreaterThanOrEqual(44)
        expect(x.width).toBeGreaterThanOrEqual(44)
        await expect(page.locator('html')).toHaveJSProperty('scrollWidth', page.viewportSize().width)
        await secondary.fill('A revised synthetic detail')
        await expect(secondary).toHaveValue('A revised synthetic detail')
        await drag.scrollIntoViewIfNeeded()
        await drag.focus()
        await page.keyboard.press('Space')
        await expect(drag).toHaveAttribute('aria-pressed', 'true')
        // The keyboard sensor measures the active sortable layout on the next paint.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await page.keyboard.press('ArrowDown')
        await expect(page.getByRole('status').filter({ hasText: `droppable area ${kind}-2` })).toBeAttached()
        await page.keyboard.press('Space')
        await expect.poll(() => page.evaluate(() => window.reorders)).toEqual([{ key: collection, ids: [`${kind}-2`, `${kind}-1`] }])
        await expect(page.getByRole('textbox', { name: primary, exact: true }).first()).toHaveValue(/ 2$/)
        expect(await page.evaluate(() => window.removals)).toEqual([])
    })
}
