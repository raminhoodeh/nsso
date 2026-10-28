import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const sourceFiles = directory => readdirSync(root + directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(directory + '/' + entry.name) : /\.(?:ts|tsx)$/.test(entry.name) ? [directory + '/' + entry.name] : [])

test.beforeAll(async () => {
    const files = ['src/app/page.tsx', 'src/app/preview/page.tsx', ...sourceFiles('src/components/layout'), ...sourceFiles('src/components/ui')]
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;background:linear-gradient(130deg,#385a6b,#b9abbb);color:white;font-family:Arial}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'core-navigation-fixture', setup(builder) {
        builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/providers\/(?:ProfileProvider|UserProvider)|@\/components\/ui\/(?:Toast|tahoe-glass)|@\/components\/profile\/ProfileSaveStatus|@\/components\/home\/(?:HomeProfileDemo|HomeProfileClaim|HomeVisionPlayer))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
            path === 'next/navigation' ? `import{useSyncExternalStore}from'react';const subscribe=fn=>{window.fixtureRouteListeners.add(fn);return()=>window.fixtureRouteListeners.delete(fn)};const router={push:path=>window.fixtureNavigate(path),replace:path=>window.fixtureNavigate(path,true),prefetch(){}};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));export const useRouter=()=>router;`
                : path === 'next/link' ? `export default function Link({href,onClick,children,...props}){return <a {...props} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.fixtureNavigate(href)}}}>{children}</a>}`
                    : path === 'next/image' ? 'export default ({priority,fill,...props})=><img {...props}/>;'
                        : path.endsWith('supabase/client') ? `const client={auth:{signOut:async()=>{throw Error('Unexpected logout')},getSession:()=>{window.fixtureAuthReads++;const value={data:{session:window.fixtureUser?{user:window.fixtureUser}:null},error:null};if(!window.fixtureOptions.holdAuth)return Promise.resolve(value);return new Promise(resolve=>window.fixtureResolveAuth=()=>{resolve(value);window.fixtureAuthSettled++})}}};export const createClient=()=>client;`
                            : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:window.fixtureUser,loading:false,refreshUser:async()=>{}});'
                                : path.endsWith('ProfileProvider') ? 'export const useProfile=()=>window.fixtureProfile;'
                                    : path.endsWith('/Toast') ? 'export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});'
                                        : path.endsWith('ProfileSaveStatus') ? 'export default ()=>null;'
                                            : path.includes('/home/') ? 'export default ()=> <div data-fixture-home-media>Media boundary fixture</div>;'
                                                : `import React from'react';import{TahoeGlassSurface}from'./src/components/ui/tahoe-glass/TahoeGlassSurface';export * from'./src/components/ui/tahoe-glass/index';export const TahoeBackdropHeader=({backdropEnabled,displacementProfile,materialLighting,...props})=><TahoeGlassSurface as="header" {...props}/>;export const TahoeBackdropSurface=({backdropEnabled,displacementProfile,materialLighting,...props})=><TahoeGlassSurface {...props}/>;`,
        }))
    } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
        import React from'react';import{createRoot}from'react-dom/client';import{usePathname}from'next/navigation';
        import Home from'./src/app/page';import Preview from'./src/app/preview/page';import Header from'./src/components/layout/Header';
        import GlobalNavigation from'./src/components/layout/GlobalNavigation';import AuthenticatedLayout from'./src/components/layout/AuthenticatedLayoutWrapper';
        import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
        window.fixtureRuntime=crypto.randomUUID();window.fixtureRouteListeners=new Set();window.fixtureDestinations=[];window.fixtureReplacements=[];window.fixtureToasts=[];window.fixtureAuthReads=0;window.fixtureAuthSettled=0;
        window.fixtureUser=window.fixtureOptions.signedOut?null:{id:'synthetic-owner',username:'fixture',email:'fixture@example.invalid',permissions:[]};
        window.fixtureProfile={profile:{user_id:'synthetic-owner',full_name:'Fixture Owner',bio:'Synthetic preview content.'},links:[],contacts:[],experiences:[],qualifications:[],projects:[],products:[],loading:false,refreshProfile:async()=>{}};
        const notify=()=>window.fixtureRouteListeners.forEach(fn=>fn());window.addEventListener('popstate',notify);
        window.fixtureNavigate=(target,replace=false)=>{(replace?window.fixtureReplacements:window.fixtureDestinations).push(target);history[replace?'replaceState':'pushState']({},'',target);notify()};
        function App(){const path=usePathname();return <><GlobalNavigation/><AuthenticatedLayout>{path==='/'?<Home/>:path==='/preview'?<Preview/>:<><Header/><main data-fixture-editor style={{paddingTop:120,minHeight:900}}><h1>Editing fixture profile</h1></main></>}</AuthenticatedLayout></>}
        const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'navigation-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
        const root=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>root.unmount();root.render(<TahoeGlassEngineContext.Provider value={fallback}><App/></TahoeGlassEngineContext.Provider>);
    ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page, { path = '/preview', holdAuth = false, signedOut = false } = {}) {
    const state = { errors: [], documents: 0, writes: [] }
    page.on('pageerror', error => state.errors.push(error.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(options => { window.fixtureOptions = options }, { holdAuth, signedOut })
    await page.route('https://nsso.test/**', route => {
        const request = route.request(), url = new URL(request.url())
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) state.writes.push(request.url())
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (['/assets/nsso-logo.png', '/assets/nsso-logo-dark.png'].includes(url.pathname)) return route.fulfill({ contentType: 'image/png', body: readFileSync(root + 'public' + url.pathname) })
        if (url.pathname.startsWith('/api/')) throw Error('Unexpected provider request in synthetic navigation fixture: ' + url.pathname)
        if (request.isNavigationRequest()) state.documents++
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test' + path)
    await expect(page.locator('[data-nsso-topbar]').filter({ visible: true })).toHaveCount(1)
    return state
}
const topbar = page => page.locator('[data-nsso-topbar]').filter({ visible: true })
async function openMenu(page) {
    await topbar(page).getByRole('button', { name: 'Open account menu', exact: true }).press('Enter')
    const menu = page.getByRole('dialog', { name: 'Menu', exact: true })
    await expect(menu).toBeVisible()
    return menu
}

test('preview logo, edit shortcut and editor home menu keep one visible navbar through client transitions', async ({ page }, testInfo) => {
    const state = await mount(page)
    const runtime = await page.evaluate(() => window.fixtureRuntime)
    await expect(page.getByRole('heading', { name: "I'm Fixture Owner", exact: true })).toBeVisible()
    const nav = topbar(page)
    const edit = nav.getByRole('button', { name: 'Edit profile', exact: true })
    await expect(edit).toBeVisible()
    await nav.getByRole('link', { name: 'nsso homepage', exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/?view=home')
    await expect(page.getByRole('heading', { name: 'Future-Proof Yourself', exact: true })).toBeVisible()
    await expect(topbar(page)).toHaveCount(1)
    await expect(page.locator('[data-nsso-topbar]')).toHaveCount(1)
    expect(await page.evaluate(() => window.fixtureReplacements)).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('authenticated-home-navbar.png') })
    await topbar(page).getByRole('button', { name: /^(Preview Profile|Preview)$/, exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/preview')
    await topbar(page).getByRole('button', { name: 'Edit profile', exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/dashboard?view=profile')
    await expect(page.getByRole('heading', { name: 'Editing fixture profile' })).toBeVisible()
    if (testInfo.project.name === 'desktop') {
        await expect(page.locator('aside')).toBeVisible()
        await page.locator('aside').getByRole('button', { name: 'nsso homepage', exact: true }).click()
    } else {
        const menu = await openMenu(page)
        await menu.getByRole('link', { name: 'nsso homepage', exact: true }).press('Enter')
    }
    await expect(page).toHaveURL('https://nsso.test/?view=home')
    await expect(topbar(page)).toHaveCount(1)
    await expect(page.locator('[data-nsso-topbar]')).toHaveCount(1)
    await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => ({ runtime: window.fixtureRuntime, replacements: window.fixtureReplacements, position: document.body.style.position, inert: document.getElementById('root').inert }))).toEqual({ runtime, replacements: [], position: '', inert: false })
    expect(state.documents).toBe(1)
    expect(state.writes).toEqual([])
    expect(state.errors).toEqual([])
})

test('preview edit, logo, copy and menu fit narrow and wide screens; menu uses the supplied dark mark', async ({ page }, testInfo) => {
    const widths = testInfo.project.name === 'desktop' ? [1440, 768] : [390, 320]
    for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        const state = await mount(page)
        const nav = topbar(page)
        const edit = nav.getByRole('button', { name: 'Edit profile', exact: true })
        const logo = nav.getByRole('link', { name: 'nsso homepage', exact: true })
        const copy = nav.getByRole('button', { name: 'Copy page URL', exact: true })
        const trigger = nav.getByRole('button', { name: 'Open account menu', exact: true })
        await expect(edit).toHaveText('Edit profile')
        if (width >= 768) await expect(copy).toBeVisible()
        else await expect(copy).not.toBeVisible()
        const boxes = await Promise.all((width >= 768 ? [edit, logo, copy, trigger] : [edit, logo, trigger]).map(item => item.boundingBox()))
        for (let i = 1; i < boxes.length; i++) expect(boxes[i].x).toBeGreaterThanOrEqual(boxes[i - 1].x + boxes[i - 1].width)
        expect(boxes[0].height).toBeGreaterThanOrEqual(44)
        expect(boxes.at(-1).x + boxes.at(-1).width).toBeLessThanOrEqual(width)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`preview-navigation-${width}.png`) })
        const menu = await openMenu(page)
        const menuBox = await menu.boundingBox()
        expect(menuBox.x).toBeGreaterThanOrEqual(0)
        expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width + 1)
        const croppedMark = menu.locator('[data-mobile-menu-logo]')
        const image = croppedMark.getByRole('img', { name: 'nsso', exact: true })
        await expect(image).toHaveAttribute('src', '/assets/nsso-logo-dark.png')
        await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth === 3840)).toBe(true)
        expect(await croppedMark.evaluate(element => ({ width: element.offsetWidth, height: element.offsetHeight, overflow: getComputedStyle(element).overflow }))).toEqual({ width: 69, height: 32, overflow: 'hidden' })
        const home = menu.getByRole('link', { name: 'nsso homepage', exact: true })
        await home.focus()
        expect(await home.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid')
        await page.screenshot({ path: testInfo.outputPath(`dark-mark-menu-${width}.png`) })
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
        expect(state.errors).toEqual([])
    }
})

test('explicit home survives a pending default-landing session read without a dashboard redirect', async ({ page }) => {
    const state = await mount(page, { path: '/', holdAuth: true })
    await expect.poll(() => page.evaluate(() => window.fixtureAuthReads)).toBe(1)
    const menu = await openMenu(page)
    await menu.getByRole('link', { name: 'nsso homepage', exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/?view=home')
    await page.evaluate(() => window.fixtureResolveAuth())
    await expect.poll(() => page.evaluate(() => window.fixtureAuthSettled)).toBe(1)
    await page.evaluate(() => new Promise(requestAnimationFrame))
    expect(await page.evaluate(() => window.fixtureReplacements)).toEqual([])
    await expect(topbar(page)).toHaveCount(1)
    expect(state.errors).toEqual([])
})

test('direct intentional home keeps signed-in and guest navbar ownership separate', async ({ page }) => {
    for (const signedOut of [false, true]) {
        const state = await mount(page, { path: '/?view=home', signedOut })
        await expect(page.getByRole('heading', { name: 'Future-Proof Yourself', exact: true })).toBeVisible()
        await expect(page.locator('[data-nsso-topbar]')).toHaveCount(1)
        await expect(topbar(page)).toHaveCount(1)
        expect(await page.evaluate(() => window.fixtureAuthReads)).toBe(0)
        expect(await page.evaluate(() => window.fixtureReplacements)).toEqual([])
        expect(state.errors).toEqual([])
    }
})
