import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const fixture = `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import Environment from './src/components/providers/NSSOTahoeGlassEnvironment';
    import {UIProvider} from './src/components/providers/UIProvider';
    import {TahoeGlassSurface,TahoeGlassField,TahoeBackdropSurface} from './src/components/ui/tahoe-glass';
    import {LightButton} from './src/components/ui/LightButton';
    const app=createRoot(document.getElementById('root'));window.disposeFixture=()=>app.unmount();
    window.fixturePendingWrites=new Map();window.fixtureSavedWrites=[];
    function EditorRow({index}){const[name,setName]=React.useState('Synthetic row '+index);const[saveState,setSaveState]=React.useState('Saved');
        return <section data-perf-row={index} style={{height:280,marginBottom:20}}>
            <TahoeGlassSurface variant="card" radius={24} tone="dark" style={{height:'100%',padding:20}}>
                <h2>Editor section {index+1}</h2>
                <TahoeGlassField label={'Name '+index}><input value={name} onChange={event=>{const value=event.target.value;setName(value);setSaveState('Saving');window.fixturePendingWrites.set(index,()=>{window.fixtureSavedWrites.push({index,value});setSaveState('Saved')})}}/></TahoeGlassField>
                <TahoeGlassField label={'Description '+index}><textarea defaultValue="Synthetic editor content; no account or writes."/></TahoeGlassField>
                <LightButton type="button">Edit row {index+1}</LightButton><span data-save-state={index}>{saveState}</span>
            </TahoeGlassSurface>
        </section>}
    app.render(<UIProvider><Environment>
        <TahoeBackdropSurface as="nav" variant="menu" data-testid="editor-nav" style={{position:'fixed',top:8,left:12,right:12,height:72,zIndex:40}} contentClassName="p-4">Profile editor navigation</TahoeBackdropSurface>
        <main data-testid="retained-editor" style={{maxWidth:900,margin:'0 auto',padding:'110px 20px 30px'}}>
            {Array.from({length:36},(_,index)=><EditorRow key={index} index={index}/>)}
        </main>
    </Environment></UIProvider>);
`

test.beforeAll(async () => {
    const files = ['src/components/providers/TahoeGlassProvider.tsx', 'src/components/providers/NSSOTahoeGlassEnvironment.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/apple-tahoe-liquid-glass-button.tsx']
    const source = files.map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture
    const candidates = [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;font-family:Arial;color:white}button,input,textarea{font:inherit}h2{margin:0 0 12px}textarea{height:56px}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'synthetic-editor-route', setup(builder) {
            // Optional isolated comparison bundles the exact original provider
            // and environment without checking out or mutating tracked files.
            if (process.env.NSSO_EDITOR_BENCHMARK_REVISION) {
                const revision = process.env.NSSO_EDITOR_BENCHMARK_REVISION
                if (!/^[0-9a-f]{7,40}$/.test(revision)) throw new Error('Benchmark revision must be a Git commit hash')
                builder.onLoad({ filter: /\/providers\/(?:NSSOTahoeGlassEnvironment|TahoeGlassProvider)\.tsx$/ }, ({ path }) => ({ loader: 'tsx', contents: execFileSync('git', ['show', revision+':'+path.slice(root.length)], { cwd: root, encoding: 'utf8' }) }))
            }
            builder.onLoad({ filter: /\/tahoe-glass\/optics\.ts$/ }, ({ path }) => ({ loader: 'ts', contents: readFileSync(path, 'utf8').replace('export function calculateTahoeRim(', 'function measuredTahoeRim(') + '\nexport function calculateTahoeRim(...args: Parameters<typeof measuredTahoeRim>) { const start=performance.now(); try{return measuredTahoeRim(...args)}finally{window.fixtureRimMs=(window.fixtureRimMs||0)+performance.now()-start} }' }))
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
    await page.addInitScript(() => {
        window.fixtureDisplacementUploads=0
        for(const context of [window.WebGLRenderingContext,window.WebGL2RenderingContext].filter(Boolean)) for(const method of ['texImage2D','texSubImage2D']){
            const original=context.prototype[method]
            context.prototype[method]=function(...args){if(args.at(-1) instanceof HTMLCanvasElement)window.fixtureDisplacementUploads++;return original.apply(this,args)}
        }
    })
    await page.goto('https://nsso.test' + pathname)
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-glass-state', 'active')
    await expect(page.locator('[data-nsso-deck-background]')).toHaveCount(1)
    await expect(page.locator('#vanta-bg')).toHaveCount(0)
    await page.waitForTimeout(350)
    return requests
}

async function expectPaintedText(field, testInfo, name) {
    const screenshot = await field.screenshot({path:testInfo.outputPath(name)})
    const { data, info } = await sharp(screenshot).raw().toBuffer({ resolveWithObject: true })
    let readablePixels=0
    for(let index=0;index<data.length;index+=info.channels) if(data[index]<80 && data[index+1]<80 && data[index+2]<80) readablePixels++
    expect(readablePixels, 'native input paints its dark text, not an empty material shell').toBeGreaterThan(100)
    await testInfo.attach(name, { body: screenshot, contentType: 'image/png' })
}

test('a visited retained editor does no hidden work and refreshes resized fields when shown', async ({ page }) => {
    await mount(page, '/dashboard')
    const field = page.locator('[data-perf-row="0"] [data-tahoe-glass-surface="recessed"]').first()
    await expect(field).toHaveAttribute('data-tahoe-glass-state', 'active')
    const initialMap = await page.locator('[data-tahoe-glass-viewport] feImage[href]').evaluateAll(images => images.map(image => image.getAttribute('href')))
    const initialUploads = await page.evaluate(() => window.fixtureDisplacementUploads)
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
    const backend = await page.locator('[data-tahoe-glass-provider]').getAttribute('data-tahoe-glass-backend')
    if(backend==='webgl') await expect.poll(() => page.evaluate(() => window.fixtureDisplacementUploads)).toBeGreaterThan(initialUploads)
    else await expect.poll(() => page.locator('[data-tahoe-glass-viewport] feImage[href]').evaluateAll(images => images.map(image => image.getAttribute('href')))).not.toEqual(initialMap)
    await page.getByRole('textbox', { name: 'Name 0', exact: true }).fill('Preserved editor works after return')
    await expect(page.getByRole('textbox', { name: 'Name 0', exact: true })).toHaveValue('Preserved editor works after return')
    await page.evaluate(() => window.disposeFixture())
    await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
})

for (const pathname of ['/dashboard', '/dashboard/products/synthetic/creator']) {
    test(`dense static editor avoids offscreen optical work on ${pathname}`, async ({ page, browserName }, testInfo) => {
        const errors = []; page.on('pageerror', error => errors.push(error.message))
        const requests = await mount(page, pathname)
        if (testInfo.project.name === 'desktop' && browserName==='chromium') await expect(page.getByTestId('editor-nav')).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
        else await expect(page.getByTestId('editor-nav')).toHaveAttribute('data-tahoe-material-family', 'candidate')
        await expect(page.locator('[data-tahoe-native-lens="supplied"]')).toHaveCount(36)
        await expect(page.locator('[data-tahoe-glass-provider]')).toHaveCount(1)
        await expect(page.locator('[data-tahoe-native-lens] canvas')).toHaveCount(0)
        const metrics = await page.evaluate(async () => {
            const counts = { styles: 0, distantStyles: 0, rects: 0, distantRects: 0, pngs: 0, fields: 0, pngMs: 0 }
            const initialRimMs = window.fixtureRimMs || 0
            const nativeStyle = window.getComputedStyle, nativeRect = Element.prototype.getBoundingClientRect, nativePng = HTMLCanvasElement.prototype.toDataURL, nativeImageData = CanvasRenderingContext2D.prototype.createImageData
            const distant = element => Number(element.closest?.('[data-perf-row]')?.getAttribute('data-perf-row') ?? -1) >= 12
            window.getComputedStyle = function(element, ...args) { counts.styles++; if (distant(element)) counts.distantStyles++; return nativeStyle.call(window, element, ...args) }
            Element.prototype.getBoundingClientRect = function() { counts.rects++; if (distant(this)) counts.distantRects++; return nativeRect.call(this) }
            HTMLCanvasElement.prototype.toDataURL = function(...args) { counts.pngs++; const start=performance.now(); try{return nativePng.apply(this, args)}finally{counts.pngMs+=performance.now()-start} }
            CanvasRenderingContext2D.prototype.createImageData = function(...args) { counts.fields++; return nativeImageData.apply(this, args) }
            const gaps = []; let previous = await new Promise(requestAnimationFrame)
            try {
                for (let index=0; index<24; index++) {
                    scrollTo(0, 140 + index * 35)
                    await new Promise(resolve => requestAnimationFrame(time => { gaps.push(time - previous); previous=time; resolve() }))
                }
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                return { ...counts, rimMs: (window.fixtureRimMs || 0) - initialRimMs, frames: gaps.length, elapsedMs: gaps.reduce((sum, value) => sum + value, 0), maxFrameMs: Math.max(...gaps), surfaces: document.querySelectorAll('[data-tahoe-glass-surface]').length }
            } finally {
                window.getComputedStyle = nativeStyle; Element.prototype.getBoundingClientRect = nativeRect; HTMLCanvasElement.prototype.toDataURL = nativePng; CanvasRenderingContext2D.prototype.createImageData = nativeImageData
            }
        })
        console.log(`EDITOR_RENDERING_METRICS ${testInfo.project.name} ${pathname} ${JSON.stringify(metrics)}`)
        await testInfo.attach('editor-rendering-metrics.json', { contentType: 'application/json', body: JSON.stringify(metrics) })
        expect(metrics.distantStyles).toBe(0)
        expect(metrics.distantRects).toBe(0)
        if(browserName==='chromium' && testInfo.project.name==='desktop' && !process.env.NSSO_EDITOR_BENCHMARK_REVISION) expect(metrics.pngs).toBe(0)
        expect(requests.some(path => /vanta|three/i.test(path))).toBe(false)
        await page.getByRole('textbox', { name: 'Name 35', exact: true }).scrollIntoViewIfNeeded()
        await expect(page.locator('[data-perf-row="35"] [data-tahoe-glass-surface="recessed"]').first()).toHaveAttribute('data-tahoe-glass-visible', 'true')
        await expect(page.locator('[data-perf-row="35"] [data-tahoe-glass-surface="recessed"]').first()).toHaveAttribute('data-tahoe-glass-measured', 'true')
        await expect(page.locator('[data-perf-row="35"] [data-tahoe-native-lens="supplied"]')).toHaveAttribute('data-tahoe-glass-visible', 'true')
        const revealed = page.getByRole('textbox', { name: 'Name 35', exact: true })
        await expect(revealed).toHaveValue('Synthetic row 35')
        await expectPaintedText(revealed,testInfo,'fresh-editor-field.png')
        await revealed.fill('Pending edit survives rapid scroll')
        await expect(page.locator('[data-save-state="35"]')).toHaveText('Saving')
        await page.getByRole('textbox', { name: 'Name 0', exact: true }).scrollIntoViewIfNeeded()
        await revealed.scrollIntoViewIfNeeded()
        await expect(revealed).toHaveValue('Pending edit survives rapid scroll')
        await page.evaluate(() => {window.fixturePendingWrites.get(35)();window.fixturePendingWrites.delete(35)})
        await expect(page.locator('[data-save-state="35"]')).toHaveText('Saved')
        expect(await page.evaluate(() => window.fixtureSavedWrites)).toEqual([{index:35,value:'Pending edit survives rapid scroll'}])
        await page.evaluate(() => window.disposeFixture())
        await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
        expect(errors).toEqual([])
    })
}

test('static editor preserves each browser and mobile backend policy', async ({ page, browserName }, testInfo) => {
    await mount(page,'/dashboard')
    const expected = browserName==='webkit' || (browserName==='chromium' && testInfo.project.name==='desktop') ? 'webgl' : 'svg'
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-glass-backend',expected)
    await expectPaintedText(page.getByRole('textbox',{name:'Name 0',exact:true}),testInfo,'initial-editor-field.png')
})

for(const failure of ['unavailable','initialization','draw']) test(`desktop editor retains working SVG and readable native content when WebGL is ${failure}`,async({page,browserName},testInfo)=>{
    test.skip(browserName!=='chromium'||testInfo.project.name!=='desktop'||Boolean(process.env.NSSO_EDITOR_BENCHMARK_REVISION),'Desktop Chrome policy only')
    if(failure!=='draw')await page.addInitScript(mode=>{
        const original=HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext=function(kind,...args){
            if(/webgl/.test(kind) && (mode==='unavailable'||this.parentElement?.hasAttribute('data-tahoe-glass-viewport')))return null
            return original.call(this,kind,...args)
        }
    },failure)
    await mount(page,'/dashboard')
    const provider=page.locator('[data-tahoe-glass-provider]')
    if(failure==='draw'){
        await expect(provider).toHaveAttribute('data-tahoe-glass-backend','webgl')
        await page.evaluate(()=>{
            const canvas=document.querySelector('[data-tahoe-glass-viewport] > canvas')
            canvas.getContext('webgl').drawArrays=()=>{throw new Error('synthetic-draw-failure')}
            scrollTo(0,40)
        })
    }
    await expect(provider).toHaveAttribute('data-tahoe-glass-backend','svg')
    await expect(provider).toHaveAttribute('data-tahoe-glass-state','active')
    await expectPaintedText(page.getByRole('textbox',{name:'Name 0',exact:true}),testInfo,'fallback-editor-field.png')
    await expect(page.locator('[data-nsso-deck-background]')).toHaveCSS('background-color','rgb(67, 98, 140)')
    const screenshot=await page.screenshot()
    const {data,info}=await sharp(screenshot).raw().toBuffer({resolveWithObject:true})
    let blue=0
    for(let y=120;y<info.height-10;y++) {const index=(y*info.width+3)*info.channels;if(data[index+2]>data[index]+15&&data[index+1]>data[index]+10)blue++}
    expect(blue/(info.height-130),'original blue deck stays painted during failure').toBeGreaterThan(.95)
    await page.getByRole('textbox',{name:'Name 0',exact:true}).fill('Editable through fallback')
    await expect(page.getByRole('textbox',{name:'Name 0',exact:true})).toHaveValue('Editable through fallback')
})

test('desktop editor retains pending edits, blue deck and native text across real WebGL context loss and restoration',async({page,browserName},testInfo)=>{
    test.skip(browserName!=='chromium'||testInfo.project.name!=='desktop'||Boolean(process.env.NSSO_EDITOR_BENCHMARK_REVISION),'Desktop Chrome policy only')
    await mount(page,'/dashboard')
    const provider=page.locator('[data-tahoe-glass-provider]')
    await expect(provider).toHaveAttribute('data-tahoe-glass-backend','webgl')
    const input=page.getByRole('textbox',{name:'Name 0',exact:true})
    await input.fill('Pending edit survives context loss')
    const supported=await page.evaluate(()=>{
        const gl=document.querySelector('[data-tahoe-glass-viewport] > canvas').getContext('webgl')
        const extension=gl.getExtension('WEBGL_lose_context');window.fixtureLostContext=extension;extension?.loseContext();return Boolean(extension)
    })
    expect(supported,'test must exercise a real restorable context loss').toBe(true)
    await expect(provider).toHaveAttribute('data-tahoe-glass-backend','svg')
    await expect(provider).toHaveAttribute('data-tahoe-glass-state','active')
    await expect(input).toHaveValue('Pending edit survives context loss')
    await expectPaintedText(input,testInfo,'lost-context-editor-field.png')
    await expect(page.locator('[data-nsso-deck-background]')).toHaveCSS('background-color','rgb(67, 98, 140)')
    await page.evaluate(()=>window.fixtureLostContext.restoreContext())
    await expect(provider).toHaveAttribute('data-tahoe-glass-backend','webgl')
    await expect(provider).toHaveAttribute('data-tahoe-glass-state','active')
    await expect(input).toHaveValue('Pending edit survives context loss')
    await page.evaluate(()=>{window.fixturePendingWrites.get(0)();window.fixturePendingWrites.delete(0)})
    await expect(page.locator('[data-save-state="0"]')).toHaveText('Saved')
    await expectPaintedText(input,testInfo,'restored-editor-field.png')
    await page.evaluate(()=>window.disposeFixture())
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveCount(0)
    await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
})
