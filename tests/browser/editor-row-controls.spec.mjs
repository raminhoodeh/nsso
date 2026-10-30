import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { controlMaterial, expectWhiteEditorControls, keyboardFocus, renderedControlContrast } from './helpers/white-control-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css

test.beforeAll(async () => {
    const files = ['src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/light-panel.ts', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx', 'src/app/dashboard/components/AdvancedModeCard.tsx', 'src/app/dashboard/components/DashboardGlassCard.tsx', 'src/app/dashboard/components/ConfirmDeleteDialog.tsx', 'src/components/ui/AskDeityButton.tsx', 'src/components/ui/GlassCard.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx', 'src/components/providers/NSSOTahoeGlassEnvironment.tsx', 'src/components/providers/TahoeGlassProvider.tsx']
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;background:linear-gradient(140deg,#34536c,#456f8f);color:white;font-family:Arial}button,input,textarea{font:inherit}#root{max-width:1120px;margin:auto;padding:24px 16px 120px}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'row-controls-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/navigation|@\/components\/providers\/ProfileProvider|@\/components\/ui\/Toast|\.\/ProductsServicesEditor|@\/components\/ui\/ImageCropperModal)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path==='next/navigation' ? 'export const usePathname=()=>"/dashboard";'
                    : path.endsWith('ProfileProvider') ? 'import{useSyncExternalStore}from"react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,window.fixtureSnapshot,window.fixtureSnapshot);'
                    : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:()=>{}});'
                        : 'export default()=>null;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import{createRoot}from'react-dom/client';import Editor from'./src/app/dashboard/components/AdvancedModeCard';
            import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
            import Environment from './src/components/providers/NSSOTahoeGlassEnvironment';import{UIProvider}from'./src/components/providers/UIProvider';
            const listeners=new Set();let state;window.reorders=[];window.removals=[];window.prompts=[];window.patchWrites=[];window.pendingPatches=[];
            window.fixtureSubscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};window.fixtureSnapshot=()=>state;
            const emit=patch=>{state={...state,...patch};listeners.forEach(fn=>fn())};
            const rows=(prefix,fields)=>Array.from({length:new URLSearchParams(location.search).has('real')?36:2},(_,index)=>index+1).map(index=>({id:prefix+index,user_id:'synthetic-user',start_year:2020,end_year:2025,sort_order:index,...Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,value+' '+index]))}));
            const reorder=key=>async ids=>{window.reorders.push({key,ids});emit({[key]:ids.map(id=>state[key].find(row=>row.id===id))});return true};
            state={experiences:rows('experience-', {company_name:'Synthetic company',job_title:'Product manager'}),qualifications:rows('qualification-', {institution:'Synthetic university',qualification_name:'Product degree'}),projects:rows('project-', {project_name:'Synthetic project',contribution:'Product lead',description:'Synthetic project description'}),
                reorderExperiences:reorder('experiences'),reorderQualifications:reorder('qualifications'),reorderProjects:reorder('projects'),
                patchEntity:async(kind,id,patch)=>{window.patchWrites.push({kind,id,patch});const key={experience:'experiences',qualification:'qualifications',project:'projects'}[kind];emit({[key]:state[key].map(row=>row.id===id?{...row,...patch}:row)});if(window.holdPatches)await new Promise(resolve=>window.pendingPatches.push(resolve));return true},createEntity:async()=>({status:'rejected',changes:[]}),removeEntity:async(kind,id)=>{window.removals.push({kind,id});return true}};
            window.addEventListener('open-deity-chat',event=>window.prompts.push(event.detail.initialMessage));
            const fallback={materialFamily:new URLSearchParams(location.search).has('supplied')?'supplied':undefined,diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'layout',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            const content=<Editor userId="synthetic-user"/>;
            createRoot(document.getElementById('root')).render(new URLSearchParams(location.search).has('real')?<UIProvider><Environment>{content}</Environment></UIProvider>:<TahoeGlassEngineContext.Provider value={fallback}>{content}</TahoeGlassEngineContext.Provider>);
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

async function mount(page, { supplied = false, real = false } = {}) {
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') throw new Error('Unexpected network access from synthetic row fixture')
        if(url.pathname==='/assets/backgrounds/nsso-deck-blue.webp')return route.fulfill({contentType:'image/webp',body:readFileSync(root+'public'+url.pathname)})
        return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'application/javascript' : url.pathname.endsWith('.css') ? 'text/css' : 'text/html', body: url.pathname.endsWith('.js') ? bundle : url.pathname.endsWith('.css') ? css : '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="fixture.css"><div id="root"></div><script src="fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/rows' + (real?'?real=1':supplied ? '?supplied=1' : ''))
    await page.getByRole('button', { name: /^Experience & Education/ }).click()
}

test('mobile experience tabs remove clipped shadows while retaining silver selection, targets and keyboard focus', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page, { supplied: true })
    const tabs = page.getByRole('tablist', { name: 'Experience and education sections' })
    for (const title of ['Job Titles', 'Qualifications', 'Projects']) {
        const tab = tabs.getByRole('tab', { name: title, exact: true })
        await tab.click()
        await expect(tab).toHaveAttribute('aria-selected', 'true')
        await expect(tab).toHaveClass(/\bnsso-silver-glass\b/)
        // Tailwind's shadow-none may compute to several fully transparent,
        // zero-size layers rather than the CSS keyword. Neither paints pixels.
        const shadows=await tab.evaluate(element=>[getComputedStyle(element).boxShadow,getComputedStyle(element,'::before').boxShadow,...[...element.querySelectorAll('[data-supplied-glass-layer="coat"]')].map(coat=>getComputedStyle(coat).boxShadow)])
        for(const shadow of shadows) expect(shadow==='none'||shadow.split(/,(?![^()]*\))/).every(layer=>layer.trim()==='rgba(0, 0, 0, 0) 0px 0px 0px 0px')).toBe(true)
        const bounds = await tab.boundingBox()
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        expect(bounds.width).toBeGreaterThanOrEqual(44)
    }
    const projects = tabs.getByRole('tab', { name: 'Projects', exact: true })
    await projects.press('Home')
    const jobs = tabs.getByRole('tab', { name: 'Job Titles', exact: true })
    await expect(jobs).toBeFocused()
    await expect(jobs).toHaveCSS('outline-style', 'solid')
    await expect(jobs).toHaveCSS('outline-width', '2px')
    await tabs.screenshot({ path: testInfo.outputPath('mobile-shadowless-section-tabs.png') })
    await page.setViewportSize({ width: 1280, height: 900 })
    await expect.poll(()=>jobs.evaluate(element=>[getComputedStyle(element).boxShadow,...[...element.querySelectorAll('[data-supplied-glass-layer="coat"]')].map(coat=>getComputedStyle(coat).boxShadow)].some(shadow=>shadow!=='none'&&!shadow.split(/,(?![^()]*\))/).every(layer=>layer.trim()==='rgba(0, 0, 0, 0) 0px 0px 0px 0px')))).toBe(true)
    expect(await page.evaluate(() => ({ reorders: window.reorders, removals: window.removals }))).toEqual({ reorders: [], removals: [] })
})

test('actual long-list editor reveals native values, labels and controls with pending edits intact',async({page},testInfo)=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await mount(page,{real:true})
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-glass-state','active')
    const fields=page.getByRole('textbox',{name:'Company',exact:true})
    await expect(fields).toHaveCount(36)
    // Native values exist before optical work or a scroll reveal. There are
    // no data fetches for row visibility and no customer-content writes.
    expect(await fields.evaluateAll(inputs=>inputs.map(input=>input.value))).toEqual(Array.from({length:36},(_,index)=>'Synthetic company '+(index+1)))
    const last=fields.last()
    await last.scrollIntoViewIfNeeded()
    const fresh=await last.screenshot({path:testInfo.outputPath('actual-long-list-native-field.png')})
    const {data,info}=await sharp(fresh).raw().toBuffer({resolveWithObject:true})
    let ink=0;for(let offset=0;offset<data.length;offset+=info.channels)if(data[offset]<80&&data[offset+1]<80&&data[offset+2]<80)ink++
    expect(ink,'freshly revealed real editor input has painted dark text').toBeGreaterThan(100)
    await testInfo.attach('actual-long-list-native-field.png',{body:fresh,contentType:'image/png'})
    await expect(page.getByText('Company',{exact:true}).last()).toBeVisible()
    await expect(page.getByRole('button',{name:'Delete experience',exact:true}).last()).toBeVisible()
    await page.evaluate(()=>{window.holdPatches=true})
    await last.fill('Pending synthetic company')
    await fields.first().scrollIntoViewIfNeeded()
    await last.scrollIntoViewIfNeeded()
    await expect(last).toHaveValue('Pending synthetic company')
    expect(await page.evaluate(()=>window.pendingPatches.length)).toBe(1)
    await page.evaluate(()=>{window.pendingPatches.splice(0).forEach(resolve=>resolve())})
    expect(await page.evaluate(()=>window.patchWrites)).toEqual([{kind:'experience',id:'experience-36',patch:{company_name:'Pending synthetic company'}}])
    await page.getByRole('button',{name:'Delete experience',exact:true}).last().click()
    await page.getByRole('button',{name:'Keep item',exact:true}).click()
    expect(await page.evaluate(()=>window.removals)).toEqual([])
    await expect(last).toHaveValue('Pending synthetic company')
    await page.screenshot({path:testInfo.outputPath('actual-long-list-editor.png')})
    expect(errors).toEqual([])
})

async function expectSilver(control) {
    await expect(control).toHaveClass(/\bnsso-silver-glass\b/)
    await controlMaterial(control)
    const paint = await renderedControlContrast(control, { includeBackground: true })
    expect(paint.contrast).toBeGreaterThanOrEqual(4.5)
    expect(Math.min(...paint.centerBackground), 'silver control stays bright over the blue editor background').toBeGreaterThanOrEqual(225)
    expect(Math.max(...paint.centerBackground) - Math.min(...paint.centerBackground), 'silver material has no strong blue cast').toBeLessThanOrEqual(20)
}

test('accordion bars stay silver and the bright selected tab follows pointer and keyboard selection', async ({ page }, testInfo) => {
    await mount(page)
    const experience = page.getByRole('button', { name: 'Experience & Education', exact: true })
    const products = page.getByRole('button', { name: 'Products & Services', exact: true })
    const tabs = page.getByRole('tablist', { name: 'Experience and education sections' })
    await expectSilver(experience)
    await expectSilver(products)
    await expectSilver(tabs.getByRole('tab', { name: 'Job Titles', exact: true }))
    const projects = tabs.getByRole('tab', { name: 'Projects', exact: true })
    await projects.click()
    await page.mouse.move(0, 0)
    await expect(projects).toHaveAttribute('aria-selected', 'true')
    await expect(projects).toHaveAttribute('tabindex', '0')
    await expectSilver(projects)
    await page.screenshot({ path: testInfo.outputPath('silver-editor-selection.png'), fullPage: true })
    await expect(tabs.getByRole('tab', { name: 'Job Titles', exact: true })).not.toHaveClass(/\bnsso-silver-glass\b/)
    await projects.press('Home')
    const jobTitles = tabs.getByRole('tab', { name: 'Job Titles', exact: true })
    await expect(jobTitles).toBeFocused()
    await expect(jobTitles).toHaveAttribute('aria-selected', 'true')
    await expectSilver(jobTitles)
    await expect(projects).not.toHaveClass(/\bnsso-silver-glass\b/)
    await products.click()
    await expect(experience).toHaveAttribute('aria-expanded', 'false')
    await expect(products).toHaveAttribute('aria-expanded', 'true')
    await expectSilver(experience)
    await expectSilver(products)
    expect(await page.evaluate(() => ({ reorders: window.reorders, removals: window.removals }))).toEqual({ reorders: [], removals: [] })
})

for (const [kind, tab, primary, detail, collection] of [
    ['experience', 'Job Titles', 'Company', 'Role', 'experiences'],
    ['qualification', 'Qualifications', 'Institution', 'Qualification', 'qualifications'],
    ['project', 'Projects', 'Project name', 'Your contribution', 'projects'],
]) {
    test(`${kind} controls have separate aligned rows and preserve keyboard reordering`, async ({ page, browserName }) => {
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
        expect(x.width).toBe(44)
        expect(x.height).toBe(44)
        await page.mouse.move(0, 0)
        await expectWhiteEditorControls(page.locator('#root'))
        const material = await controlMaterial(remove)
        expect(material.icon).toMatchObject({ width: '18', height: '18' })
        expect(material.background).toBe('rgba(255, 255, 255, 0.28)')
        expect(material.backgroundImage).not.toBe('none')
        await remove.hover()
        const hoverCapable = await page.evaluate(() => matchMedia('(hover: hover)').matches)
        await expect(remove).toHaveCSS('background-color', hoverCapable ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.28)')
        await page.mouse.move(0, 0)
        await keyboardFocus(remove, page, browserName)
        expect((await controlMaterial(remove)).outline).toMatchObject({ width: '2px', style: 'solid' })
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
