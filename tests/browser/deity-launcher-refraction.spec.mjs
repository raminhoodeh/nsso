import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
function sourceFiles(directory) {
    return readdirSync(root + directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? sourceFiles(directory + '/' + entry.name)
        : /\.(?:ts|tsx)$/.test(entry.name) ? [directory + '/' + entry.name] : [])
}
const fixture = `
import React from'react';import{createRoot}from'react-dom/client';
import Agent from'./src/components/agent/NSSOAgent';import TopBar from'./src/components/layout/NssoTopBar';
import{TahoeGlassProvider,TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
import{NativeGlassLens}from'./src/components/ui/tahoe-glass/NativeGlassLens';
window.fixtureAgentResources={requests:[],registrations:[],activeSurfaces:new Set(),activeOwnedListeners:0,ownedFrames:0};
function ObservedAgent(){
 const engine=React.useContext(TahoeGlassEngineContext),resources=window.fixtureAgentResources;
 const requestRender=React.useCallback(reason=>{resources.requests.push(reason);engine.requestRender(reason)},[engine?.requestRender]);
 const registerSurface=React.useCallback((id,element,options)=>{resources.registrations.push({id,launcher:element.hasAttribute('data-deity-launcher-glass')});resources.activeSurfaces.add(id);engine.registerSurface(id,element,options)},[engine?.registerSurface]);
 const unregisterSurface=React.useCallback(id=>{resources.activeSurfaces.delete(id);engine.unregisterSurface(id)},[engine?.unregisterSurface]);
 const subscribeOwnedSceneAfterRender=React.useCallback(listener=>{resources.activeOwnedListeners++;const dispose=engine.subscribeOwnedSceneAfterRender(canvas=>{resources.ownedFrames++;listener(canvas)});return()=>{resources.activeOwnedListeners--;dispose()}},[engine?.subscribeOwnedSceneAfterRender]);
 const value=React.useMemo(()=>engine?{...engine,requestRender,registerSurface,unregisterSurface,subscribeOwnedSceneAfterRender}:null,[engine,requestRender,registerSurface,unregisterSurface,subscribeOwnedSceneAfterRender]);
 return<TahoeGlassEngineContext.Provider value={value}><Agent/></TahoeGlassEngineContext.Provider>
}
// The provider and local optics receive an actual same-origin owned canvas.
// Only the scene producer is synthetic; no renderer or capability is mocked.
function OwnedScene(){
 const engine=React.useContext(TahoeGlassEngineContext),ref=React.useRef(null);
 React.useEffect(()=>{const image=new Image();let active=true;
 const draw=()=>{const canvas=ref.current;if(!active||!canvas||!image.complete||!image.naturalWidth)return;canvas.width=innerWidth;canvas.height=innerHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);for(let x=0;x<canvas.width;x+=20){ctx.fillStyle=x%40?'#f5fcff':'#082447';ctx.fillRect(x,canvas.height-160,10,160)}engine.renderNow();engine.publishOwnedSceneAfterRender();window.fixtureSceneFrames=(window.fixtureSceneFrames||0)+1};
 image.onload=draw;image.src='/assets/backgrounds/nsso-deck-blue.webp';const unsubscribe=engine.subscribeSceneFrameRequests(draw);window.addEventListener('resize',draw);return()=>{active=false;image.onload=null;unsubscribe();window.removeEventListener('resize',draw)}
 },[engine?.renderNow,engine?.publishOwnedSceneAfterRender,engine?.subscribeSceneFrameRequests]);
 return<canvas ref={ref} data-fixture-owned-scene style={{width:'100%',height:'100%'}}/>
}
const source={kind:'canvas',dynamic:true,getElement:()=>document.querySelector('[data-fixture-owned-scene]'),fit:'cover',label:'real-supplied-owned-deck'};
const content=<><div className="transmitted-content" aria-hidden="true">${'LIVE PROFILE CONTENT '.repeat(200)}</div><TopBar style={{height:88}}/><NativeGlassLens as="span" data-provider-reference style={{position:'fixed',top:160,left:16,width:160,height:44}} className="nsso-glass-control rounded-full">Premium · Free</NativeGlassLens><button id="fixture-opener" style={{position:'fixed',top:220,left:16,zIndex:1}} onClick={()=>window.dispatchEvent(new CustomEvent('open-deity-chat'))}>Open mobile Deity</button><ObservedAgent/></>;
const app=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>app.unmount();
window.fixtureResourceSnapshot=()=>{const r=window.fixtureAgentResources;return{requests:[...r.requests],registrations:[...r.registrations],activeSurfaces:[...r.activeSurfaces],activeOwnedListeners:r.activeOwnedListeners,ownedFrames:r.ownedFrames,canvasAttempts:[...window.fixtureLauncherCanvasAttempts],breakpointListeners:window.fixtureBreakpointListeners.size,diagnostics:window.fixtureDiagnostics}};
app.render(new URLSearchParams(location.search).has('provider')?<TahoeGlassProvider materialFamily="supplied" preferredBackend="auto" fallback="webgl" sourceLabel={source.label} scene={<OwnedScene/>} webglSource={source} onDiagnosticsChange={value=>window.fixtureDiagnostics=value}>{content}</TahoeGlassProvider>:content);
`
test.beforeAll(async () => {
    const source = ['src/components/agent/NSSOAgent.tsx', 'src/components/layout/NssoTopBar.tsx', 'src/components/providers/TahoeGlassProvider.tsx', ...sourceFiles('src/components/ui')].map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture
    const candidates = [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + 'body{margin:0;min-height:1800px;font-family:Arial;background:#c3dcf2}.transmitted-content{position:fixed;inset:0;background:repeating-linear-gradient(90deg,#082447 0 5px,#f5fcff 5px 10px);color:#0c1a29;font-size:44px;line-height:1.5;overflow:hidden}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'deity-launcher-boundaries', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/dynamic|@\/components\/providers\/UserProvider)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', resolveDir: root, contents: path === 'next/dynamic' ? 'export default()=>()=>null;' : 'export const useUser=()=>({user:null,loading:false});' }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: fixture },
    })
    bundle = result.outputFiles[0].text
})

async function mount(page, provider = false) {
    const errors = [], requests = []
    await page.emulateMedia({ reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await page.addInitScript(() => {
        window.fixtureLauncherCanvasAttempts = []
        window.fixtureBreakpointListeners = new Set()
        const getContext = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (...args) {
            if (this.closest('[data-deity-launcher-glass]')) window.fixtureLauncherCanvasAttempts.push({ type: args[0], width: innerWidth })
            return getContext.apply(this, args)
        }
        const matchMedia = window.matchMedia.bind(window)
        window.matchMedia = query => {
            const result = matchMedia(query)
            if (query !== '(min-width: 768px)') return result
            const add = result.addEventListener.bind(result), remove = result.removeEventListener.bind(result)
            result.addEventListener = (type, listener, options) => { if (type === 'change') window.fixtureBreakpointListeners.add(listener); return add(type, listener, options) }
            result.removeEventListener = (type, listener, options) => { if (type === 'change') window.fixtureBreakpointListeners.delete(listener); return remove(type, listener, options) }
            return result
        }
    })
    await page.route('https://nsso.test/**', route => {
        const pathname = decodeURIComponent(new URL(route.request().url()).pathname)
        if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (pathname === '/assets/backgrounds/nsso-deck-blue.webp') return route.fulfill({ contentType: 'image/webp', body: readFileSync(root + 'public' + pathname) })
        if (['/nsso-agent-avatar.png', '/deity logo white.png'].includes(pathname)) return route.fulfill({ contentType: 'image/png', body: readFileSync(root + 'public' + pathname) })
        if (pathname.startsWith('/api/')) { requests.push(pathname); return route.abort() }
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/deity-launcher-fixture' + (provider ? '?provider=1' : ''))
    await expect.poll(() => page.evaluate(() => window.fixtureBreakpointListeners.size)).toBe(1)
    if (provider) {
        await expect.poll(() => page.evaluate(() => window.fixtureSceneFrames || 0)).toBeGreaterThan(0)
        await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-glass-state', 'active')
    }
    return { errors, requests }
}

test('Deity launcher uses the navbar live-DOM lens and measurably displaces underlying content', async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop' || browserName !== 'chromium', 'Live-DOM SVG optics are Chromium-specific; other engines are verified through their actual provider route.')
    const { errors, requests } = await mount(page)
    const launcher = page.locator('[data-deity-launcher-glass]')
    const navbar = page.locator('[data-nsso-topbar]')
    for (const surface of [launcher, navbar]) {
        await expect(surface).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
        await expect(surface).toHaveAttribute('data-tahoe-refraction-backend', 'svg-live-dom')
        await expect(surface).toHaveAttribute('data-tahoe-refraction-scope', 'live-backdrop')
    }
    await expect(launcher.locator('canvas')).toHaveCount(0)
    const warped = await launcher.screenshot()
    const reset = await launcher.evaluate(element => {
        const lens = [...element.children].find(child => getComputedStyle(child).backdropFilter.includes('url('))
        const id = getComputedStyle(lens).backdropFilter.match(/url\(["']?#([^"')]+)/)?.[1]
        const displacement = document.getElementById(id)?.querySelector('feDisplacementMap')
        if (!displacement) throw Error('No active launcher displacement primitive')
        const scale = displacement.getAttribute('scale')
        displacement.setAttribute('scale', '0')
        return { id, scale }
    })
    const neutral = await launcher.screenshot()
    await page.evaluate(({ id, scale }) => document.getElementById(id).querySelector('feDisplacementMap').setAttribute('scale', scale), reset)
    const left = await sharp(warped).ensureAlpha().raw().toBuffer()
    const right = await sharp(neutral).ensureAlpha().raw().toBuffer()
    const meanDifference = left.reduce((total, value, index) => total + Math.abs(value - right[index]), 0) / left.length
    expect(meanDifference).toBeGreaterThan(0.5)
    await testInfo.attach('live-dom-pixel-proof', { body: JSON.stringify({ meanDifference, minimum: 0.5 }), contentType: 'application/json' })
    await page.screenshot({ path: testInfo.outputPath('deity-launcher-live-dom-refraction.png') })
    const button = page.getByRole('button', { name: 'Open Deity assistant', exact: true })
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Deity assistant', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(button).toBeFocused()
    expect(errors).toEqual([])
    expect(requests).toEqual([])
})

test('Deity launcher reports an honest standalone fallback and respects forced colors', async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'The floating launcher only mounts at the desktop breakpoint.')
    const { errors, requests } = await mount(page)
    const launcher = page.locator('[data-deity-launcher-glass]')
    if (browserName === 'webkit') {
        await expect(launcher).toHaveAttribute('data-tahoe-refraction-backend', 'css-material')
        await expect(launcher).toHaveAttribute('data-tahoe-refraction-scope', 'none')
        await expect(launcher).not.toHaveAttribute('data-tahoe-chromium-optics')
        await expect(launcher.locator('canvas')).toHaveCount(0)
    } else {
        await page.emulateMedia({ forcedColors: 'active' })
        await expect(launcher).toHaveAttribute('data-tahoe-refraction-backend', 'solid')
        await expect(launcher).not.toHaveAttribute('data-tahoe-chromium-optics')
        await expect(page.getByRole('button', { name: 'Open Deity assistant', exact: true })).toBeVisible()
    }
    expect(errors).toEqual([])
    expect(requests).toEqual([])
})

async function resources(page) { return page.evaluate(() => window.fixtureResourceSnapshot()) }
async function settleFrames(page, count = 12) {
    await page.evaluate(async count => { for (let index = 0; index < count; index++) await new Promise(requestAnimationFrame) }, count)
}
async function expectNoHiddenLauncherWork(page, before) {
    await expect(page.locator('[data-deity-launcher-glass]')).toHaveCount(0)
    await expect(page.locator('[data-deity-launcher-glass] canvas')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Open Deity assistant', exact: true })).toHaveCount(0)
    await settleFrames(page)
    const after = await resources(page)
    expect(after.activeSurfaces).toEqual([])
    expect(after.activeOwnedListeners).toBe(0)
    expect(after.requests).toEqual(before.requests)
    expect(after.registrations).toEqual(before.registrations)
    expect(after.canvasAttempts).toEqual(before.canvasAttempts)
    expect(after.ownedFrames).toBe(before.ownedFrames)
    return after
}

test('mobile has no launcher DOM, local canvas, retry or surface budget even after closing chat with the actual supplied provider', async ({ page, browserName }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'This proves the initial mobile mount, including Apple-mobile WebKit routing.')
    const state = await mount(page, true)
    const initial = await resources(page)
    expect(initial.requests).toEqual([])
    expect(initial.registrations).toEqual([])
    expect(initial.canvasAttempts).toEqual([])
    expect(initial.ownedFrames).toBe(0)
    if (browserName === 'webkit') expect(initial.diagnostics.backend).toBe('webgl')
    await expectNoHiddenLauncherWork(page, initial)
    const opener = page.getByRole('button', { name: 'Open mobile Deity', exact: true })
    await opener.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Deity assistant', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(opener).toBeFocused()
    await expect(page.getByRole('dialog', { name: 'Deity assistant', exact: true })).toBeHidden()
    const closed = await expectNoHiddenLauncherWork(page, initial)
    await page.screenshot({ path: testInfo.outputPath('deity-mobile-no-hidden-renderer.png') })
    await page.evaluate(() => window.fixtureUnmount())
    const disposed = await resources(page)
    expect(disposed.breakpointListeners).toBe(0)
    await testInfo.attach('mobile-launcher-resources', { body: JSON.stringify({ browserName, initial, closed, disposed }, null, 2), contentType: 'application/json' })
    expect(state).toEqual({ errors: [], requests: [] })
})

test('actual supplied provider releases and remounts launcher resources at the 767/768 breakpoint', async ({ page, browserName }, testInfo) => {
    await page.setViewportSize({ width: 767, height: 844 })
    const state = await mount(page, true)
    const initial = await resources(page)
    await expectNoHiddenLauncherWork(page, initial)
    const cycles = []
    let firstLauncher
    for (let cycle = 0; cycle < 2; cycle++) {
        await page.setViewportSize({ width: 768, height: 844 })
        const launcher = page.locator('[data-deity-launcher-glass]')
        await expect(launcher).toBeVisible()
        await expect(launcher).toHaveCount(1)
        if (cycle === 0) firstLauncher = await launcher.elementHandle()
        else expect(await firstLauncher.evaluate(element => element.isConnected)).toBe(false)
        if (browserName === 'chromium') await expect(launcher).toHaveAttribute('data-tahoe-refraction-backend', 'svg-live-dom')
        else if (testInfo.project.name === 'mobile') {
            await expect(launcher.locator('[data-tahoe-nav-owned-scene-canvas]')).toHaveCount(1)
            await expect.poll(async () => (await resources(page)).ownedFrames).toBeGreaterThan(0)
            await expect(launcher).toHaveAttribute('data-tahoe-owned-scene-state', 'active')
            await expect(launcher).toHaveAttribute('data-tahoe-refraction-backend', 'webgl-owned-scene')
        } else {
            await expect(launcher).toHaveAttribute('data-tahoe-refraction-backend', 'webgl-owned-scene')
            await expect(launcher).toHaveAttribute('data-tahoe-refraction-scope', 'owned-scene-only')
        }
        const wide = await resources(page)
        await page.setViewportSize({ width: 767, height: 844 })
        await expect(launcher).toHaveCount(0)
        const closed = await expectNoHiddenLauncherWork(page, await resources(page))
        expect(closed.diagnostics.surfaceCount).toBeLessThanOrEqual(initial.diagnostics.surfaceCount)
        cycles.push({ wide, closed })
    }
    await page.screenshot({ path: testInfo.outputPath('deity-responsive-resources-released.png') })
    await page.evaluate(() => window.fixtureUnmount())
    const disposed = await resources(page)
    expect(disposed.breakpointListeners).toBe(0)
    expect(disposed.activeSurfaces).toEqual([])
    expect(disposed.activeOwnedListeners).toBe(0)
    await testInfo.attach('responsive-launcher-resources', { body: JSON.stringify({ browserName, initial, cycles, disposed }, null, 2), contentType: 'application/json' })
    expect(state).toEqual({ errors: [], requests: [] })
})
