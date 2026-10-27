import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css

function sourceFiles(directory) {
    return readdirSync(root + directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? sourceFiles(directory + '/' + entry.name)
        : /\.(?:ts|tsx)$/.test(entry.name) ? [directory + '/' + entry.name] : [])
}

test.beforeAll(async () => {
    const candidates = ['src/app/dashboard/page.tsx', ...sourceFiles('src/app/dashboard/components'), ...sourceFiles('src/components/ui'), ...sourceFiles('src/components/layout')]
        .flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
    css = compiler.build(candidates) + '\n:root{--mobile-bottom-safe-space:8px;--mobile-bottom-nav-height:80px}body{margin:0;background:linear-gradient(130deg,#385a6b,#b9abbb);color:white;font-family:Arial}button,input,textarea,select{font:inherit}#fixture-outside{height:100px}#fixture-outside button{min-height:44px}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'profile-editor-polish-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/providers\/(?:ProfileProvider|UserProvider|UIProvider)|@\/components\/ui\/(?:Toast|tahoe-glass)|@\/components\/layout\/DashboardSidebar|@\/components\/profile\/ProfileSaveStatus|@\/components\/ui\/ImageCropperModal|@\/app\/dashboard\/components\/(?:EarningsTab|MyNssoTab|AdvancedModeCard))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.routeSubscribers.add(fn);return()=>window.routeSubscribers.delete(fn)};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));export const useRouter=()=>({push:window.fixtureNavigate,prefetch(){}});`
                    : path === 'next/link' ? `export default function Link({href,onClick,children,...props}){return <a {...props} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.fixtureNavigate(href)}}}>{children}</a>}`
                        : path === 'next/image' ? 'export default ({priority,fill,...props})=><img {...props}/>;'
                            : path.endsWith('supabase/client') ? 'export const createClient=()=>({auth:{signOut:async()=>{window.signOuts++;return{error:null}}}});'
                                : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:window.fixtureUser,loading:false,refreshUser:async()=>{}});'
                                    : path.endsWith('UIProvider') ? 'export const useUI=()=>({setBackgroundDimmed:()=>{}});'
                                        : path.endsWith('ProfileProvider') ? 'export const useProfile=()=>window.fixtureProfile;'
                                            : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:(message,type)=>window.toasts.push({message,type})});'
                                                : path.endsWith('DashboardSidebar') ? 'export default ()=><aside data-fixture-sidebar="true" className="hidden lg:block">Desktop profile navigation</aside>;'
                                                    : path.endsWith('AdvancedModeCard') ? 'export default ()=><section aria-label="Advanced editor fixture"/>;'
                                                        : /(?:ProfileSaveStatus|ImageCropperModal|EarningsTab|MyNssoTab)$/.test(path) ? 'export default ()=>null;'
                                                            : `import React from 'react';import {TahoeGlassSurface} from './src/components/ui/tahoe-glass/TahoeGlassSurface';export * from './src/components/ui/tahoe-glass/index';export const TahoeBackdropHeader=({backdropEnabled,displacementProfile,materialLighting,...props})=><TahoeGlassSurface as="header" {...props}/>;export const TahoeBackdropSurface=({backdropEnabled,displacementProfile,materialLighting,...props})=><TahoeGlassSurface {...props}/>;`
            }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React,{useState} from 'react';import{createRoot}from'react-dom/client';
            import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
            import Dashboard from './src/app/dashboard/page';import Header from './src/components/layout/Header';
            import GlobalNavigation from './src/components/layout/GlobalNavigation';import AuthenticatedLayout from './src/components/layout/AuthenticatedLayoutWrapper';
            window.routeSubscribers=new Set();window.destinations=[];window.toasts=[];window.deleted=[];window.reordered=[];window.deityEvents=[];window.signOuts=0;
            window.fixtureUser={id:'qa',username:'fixture',user_type:window.fixtureOptions.admin?'admin':'standard'};
            window.fixtureNavigate=target=>{window.destinations.push(target);history.pushState({},'',target);window.routeSubscribers.forEach(fn=>fn())};
            window.addEventListener('open-deity-chat',()=>window.deityEvents.push({menuPresent:!!document.querySelector('[role=dialog]'),bodyPosition:document.body.style.position,inert:document.getElementById('root').inert}));
            function App(){const [,update]=useState(0);const refresh=()=>update(value=>value+1);const profile=window.fixtureProfile||={
                profile:window.fixtureOptions.profileState==='error'?null:{full_name:'Fixture Name',headline:'Builder',bio:'A fixture biography.',profile_pic_url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'},loading:window.fixtureOptions.profileState==='loading',profileCompleteness:100,
                links:[{id:'link-1',link_name:'Portfolio',link_url:'https://example.test/portfolio'},{id:'link-2',link_name:'Writing',link_url:'https://example.test/writing'}],
                contacts:[{id:'contact-1',method:'Email',value:'test@example.invalid'},{id:'contact-2',method:'Phone',value:'+123456789'}],
                updateField:async()=>true,patchProfile:async()=>true,refreshProfile:async()=>{},addLink:()=>{},addContact:()=>{},
                updateLink:(id,field,value)=>{profile.links=profile.links.map(row=>row.id===id?{...row,[field]:value}:row);refresh()},
                updateContact:(id,field,value)=>{profile.contacts=profile.contacts.map(row=>row.id===id?{...row,[field]:value}:row);refresh()},
                removeLink:async id=>{window.deleted.push({type:'link',id});profile.links=profile.links.filter(row=>row.id!==id);refresh();return true},
                removeContact:async id=>{window.deleted.push({type:'contact',id});profile.contacts=profile.contacts.filter(row=>row.id!==id);refresh();return true},
                reorderLinks:ids=>{window.reordered.push({type:'link',ids});profile.links=ids.map(id=>profile.links.find(row=>row.id===id));refresh()},
                reorderContacts:ids=>{window.reordered.push({type:'contact',ids});profile.contacts=ids.map(id=>profile.contacts.find(row=>row.id===id));refresh()}
            };return <><AuthenticatedLayout>{window.fixtureOptions.content==='dashboard'?<Dashboard/>:<><Header/><main style={{paddingTop:120,minHeight:1600}}>Other route content</main></>}</AuthenticatedLayout><GlobalNavigation/><div id="fixture-outside"><button>Outside focus target</button></div></>};
            const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'layout-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            createRoot(document.getElementById('root')).render(<TahoeGlassEngineContext.Provider value={fallback}><App/></TahoeGlassEngineContext.Provider>);
        ` },
    })
    bundle = result.outputFiles[0].text
})

async function mount(page, { path = '/dashboard', admin = false, content = 'dashboard', profileState = 'ready' } = {}) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('https://nsso.test/**', route => {
        const url = new URL(route.request().url())
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{}' })
        if (/\.(?:png|svg)$/.test(url.pathname)) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="458" height="224"><rect width="458" height="224" fill="silver"/></svg>' })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.fixtureOptions=' + JSON.stringify({ admin, content, profileState }) + '</script><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test' + path)
    await expect(page.locator('button[aria-label="Open account menu"]')).toBeAttached()
}

async function openMenu(page, keyboard = false) {
    const trigger = page.getByRole('button', { name: 'Open account menu' })
    if (keyboard) await trigger.press('Enter')
    else await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Menu', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))))
    return dialog
}

test('mobile profile navigation is grouped in useful order, preserves query state, and closes on selection', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page, { path: '/dashboard?claim=keep-name&source=qa' })
    await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
    const dialog = await openMenu(page)
    const group = dialog.locator('[data-mobile-menu-group="profile"]')
    expect(await group.locator('a,button').allTextContents()).toEqual(['Edit Profile', 'My nsso', 'Deity', 'News FeedComing soon'])
    await expect(group.getByRole('link', { name: 'Edit Profile', exact: true })).toHaveAttribute('aria-current', 'page')
    const myNsso = group.getByRole('link', { name: 'My nsso', exact: true })
    const destination = new URL(await myNsso.getAttribute('href'), 'https://nsso.test')
    expect(destination.pathname).toBe('/dashboard')
    expect(Object.fromEntries(destination.searchParams)).toEqual({ claim: 'keep-name', source: 'qa', view: 'my-nsso' })
    const items = await dialog.getByRole('navigation', { name: 'Account and profile' }).locator('a,button').allTextContents()
    expect(items.map(text => text.trim().replace(/\s+/g, ' '))).toEqual(['Edit Profile', 'My nsso', 'Deity', 'News FeedComing soon', 'Preview Profile', 'Copy profile URL', 'Account security', 'Sign Out'])
    await page.screenshot({ path: testInfo.outputPath('mobile-profile-menu.png') })
    await myNsso.click()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(destination.href)
    const reopened = await openMenu(page)
    await expect(reopened.getByRole('link', { name: 'My nsso', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(reopened.getByRole('link', { name: 'Edit Profile', exact: true })).not.toHaveAttribute('aria-current', 'page')
})

test('the mobile menu is readable, dims and isolates the page, traps focus, and restores scrolling and focus', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await mount(page)
    await page.evaluate(() => window.scrollTo(0, 100))
    const before = await page.evaluate(() => ({ y: scrollY, position: document.body.style.position, overflow: document.documentElement.style.overflow }))
    const trigger = page.getByRole('button', { name: 'Open account menu' })
    // Safari does not focus buttons on a pointer click; exercise a genuine
    // previously-focused invoker so focus restoration has a meaningful target.
    await trigger.focus()
    const dialog = await openMenu(page, true)
    await page.screenshot({ path: testInfo.outputPath('narrow-mobile-profile-menu.png') })
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeFocused()
    const material = await dialog.locator('[data-mobile-account-menu="true"]').evaluate(element => {
        const context = document.createElement('canvas').getContext('2d')
        context.fillStyle = getComputedStyle(element).color
        context.fillRect(0, 0, 1, 1)
        return { color: [...context.getImageData(0, 0, 1, 1).data], background: getComputedStyle(element).backgroundColor }
    })
    expect(material.color[0]).toBeLessThan(10)
    expect(material.color[1]).toBeLessThan(15)
    expect(material.color[2]).toBeLessThan(30)
    expect(material.color[3]).toBe(255)
    expect(material.background).toMatch(/rgba?\(2[234]\d, 2[234]\d, 2[234]\d(?:, (?:0\.9\d*|1))?\)/)
    const dimming = await page.locator('[data-tahoe-glass-dialog-overlay] > [aria-hidden="true"]').evaluate(element => {
        const context = document.createElement('canvas').getContext('2d')
        context.fillStyle = getComputedStyle(element).backgroundColor
        context.fillRect(0, 0, 1, 1)
        return [...context.getImageData(0, 0, 1, 1).data]
    })
    expect(dimming.slice(0, 3)).toEqual([0, 0, 0])
    expect(dimming[3]).toBeGreaterThanOrEqual(178)
    expect(dimming[3]).toBeLessThanOrEqual(179)
    expect(await page.locator('#root').evaluate(element => element.inert)).toBe(true)
    expect(await page.evaluate(() => document.body.style.position)).toBe('fixed')
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('hidden')
    await dialog.getByRole('button', { name: 'Sign Out', exact: true }).focus()
    await page.keyboard.press('Tab')
    await expect(dialog.getByRole('button', { name: 'Close menu' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(dialog.getByRole('button', { name: 'Sign Out', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(await page.locator('#root').evaluate(element => element.inert)).toBe(false)
    expect(await page.evaluate(() => ({ y: scrollY, position: document.body.style.position, overflow: document.documentElement.style.overflow }))).toEqual(before)
    await openMenu(page)
    await page.locator('[data-tahoe-glass-dialog-overlay] > [aria-hidden="true"]').click({ position: { x: 4, y: 250 } })
    await expect(dialog).toHaveCount(0)
})

test('Deity starts only after modal isolation is released and News Feed remains an honest coming-soon action', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await (await openMenu(page)).getByRole('button', { name: 'Deity', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.deityEvents)).toEqual([{ menuPresent: false, bodyPosition: '', inert: false }])
    const dialog = await openMenu(page)
    await dialog.getByRole('button', { name: /News Feed/ }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.toasts)).toContainEqual({ message: 'News Feed coming soon', type: 'info' })
    expect(await page.evaluate(() => window.destinations)).toEqual([])
    expect(await page.evaluate(() => window.signOuts)).toBe(0)
})

test('profile editing loses only its mobile bottom bar; nested tools, desktop sidebar and other route policies remain intact', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ['/dashboard', '/dashboard/?view=my-nsso']) {
        await mount(page, { path, content: 'navigation' })
        await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
    }
    for (const path of ['/preview', '/dashboard/security', '/dashboard/products/product/sales-page']) {
        await mount(page, { path, content: 'navigation' })
        await expect(page.getByRole('navigation', { name: 'Dashboard', exact: true })).toBeVisible()
    }
    await mount(page, { path: '/film/razinflix', content: 'navigation' })
    await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
    await expect(page.locator('[data-fixture-sidebar]')).toHaveCount(0)
    for (const width of [768, 844]) {
        await page.setViewportSize({ width, height: 390 })
        await mount(page)
        await expect(page.getByRole('button', { name: 'Open account menu' })).toBeVisible()
        await expect(page.getByRole('img', { name: 'nsso', exact: true })).toBeVisible()
        await expect(page.locator('[data-fixture-sidebar]')).not.toBeVisible()
        await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
        await openMenu(page)
        await page.keyboard.press('Escape')
    }
    await page.setViewportSize({ width: 1024, height: 900 })
    await mount(page)
    await expect(page.locator('[data-fixture-sidebar]')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open account menu' })).not.toBeVisible()
})

test('mobile link and contact controls share a toolbar above full-width fields and retain confirmed deletion', async ({ page }, testInfo) => {
    for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await mount(page)
        for (const [kind, handleName, removeName, fieldName] of [
            ['link', 'Drag to reorder Portfolio', 'Remove Portfolio', 'Link URL'],
            ['contact', 'Drag to reorder Email contact method', 'Remove Email contact method', 'Email contact details'],
        ]) {
            const handle = page.getByRole('button', { name: handleName, exact: true })
            const remove = page.getByRole('button', { name: removeName, exact: true })
            const toolbar = handle.locator('xpath=ancestor::*[@data-sortable-controls][1]')
            await expect(toolbar).toHaveAttribute('data-sortable-controls', kind)
            expect(await toolbar.getByRole('button', { name: removeName, exact: true }).count()).toBe(1)
            const [dragBox, deleteBox, toolbarBox] = await Promise.all([handle.boundingBox(), remove.boundingBox(), toolbar.boundingBox()])
            expect(Math.abs(dragBox.y + dragBox.height / 2 - deleteBox.y - deleteBox.height / 2)).toBeLessThanOrEqual(1)
            expect(deleteBox.x).toBeGreaterThan(dragBox.x)
            expect(deleteBox.width).toBeGreaterThanOrEqual(44)
            expect(deleteBox.height).toBeGreaterThanOrEqual(44)
            const field = page.getByRole('textbox', { name: fieldName, exact: true }).first()
            const fieldBox = await field.boundingBox()
            expect(fieldBox.y).toBeGreaterThanOrEqual(toolbarBox.y + toolbarBox.height)
            expect(fieldBox.width).toBeGreaterThan(width * 0.5)
            if (kind === 'link') {
                const nameBox = await page.getByRole('textbox', { name: 'Link name', exact: true }).first().boundingBox()
                expect(nameBox.width - fieldBox.width).toBeLessThanOrEqual(24)
            }
            await remove.click()
            const dialog = page.getByRole('dialog', { name: /^Delete / })
            await expect(dialog).toHaveAttribute('data-tahoe-readable-overlay', 'true')
            await dialog.getByRole('button', { name: 'Keep item', exact: true }).click()
            expect(await page.evaluate(() => window.deleted)).toEqual([])
            // The toolbar must not itself activate a drag while tapping Delete.
            expect(await page.evaluate(() => window.reordered)).toEqual([])
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.screenshot({ path: testInfo.outputPath('mobile-link-contact-controls.png'), fullPage: true })
    await page.getByRole('button', { name: 'Remove Portfolio', exact: true }).click()
    await page.getByRole('dialog', { name: 'Delete Portfolio?', exact: true }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Drag to reorder Portfolio', exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => window.deleted)).toEqual([{ type: 'link', id: 'link-1' }])
})

test('keyboard reordering still works after separating drag and delete targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    for (const [name, type, ids] of [
        ['Drag to reorder Portfolio', 'link', ['link-2', 'link-1']],
        ['Drag to reorder Email contact method', 'contact', ['contact-2', 'contact-1']],
    ]) {
        const handle = page.getByRole('button', { name, exact: true })
        await handle.scrollIntoViewIfNeeded()
        await handle.focus()
        await page.keyboard.press('Space')
        await expect(handle).toHaveAttribute('aria-pressed', 'true')
        // dnd-kit measures the now-active sortable layout on the next paint.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await page.keyboard.press('ArrowDown')
        await expect(page.getByRole('status').filter({ hasText: `droppable area ${ids[0]}` })).toBeAttached()
        await page.keyboard.press('Space')
        await expect.poll(() => page.evaluate(() => window.reordered)).toContainEqual({ type, ids })
    }
    expect(await page.evaluate(() => window.deleted)).toEqual([])
})

test('profile copy is concise and Links help is accessible on demand by keyboard and touch', async ({ page, browserName, isMobile }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await expect(page.getByRole('heading', { name: 'Hey, wonderful', exact: true })).toBeVisible()
    await expect(page.getByText('Premium profile access and your nsso.me URL are currently free for the first 1000 users.', { exact: true })).toBeVisible()
    await expect(page.getByText('Add your contact methods and social profiles.', { exact: true })).toHaveCount(0)
    const help = page.getByRole('button', { name: 'About Links', exact: true })
    await expect(page.getByRole('tooltip')).toHaveCount(0)
    await page.getByRole('button', { name: 'Copy saved profile URL', exact: true }).focus()
    // Safari's standard keyboard mode uses Option+Tab to include buttons.
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
    await expect(help).toBeFocused()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toHaveText('Where can people find you or your work online?')
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveCount(0)
    if (isMobile) await help.tap()
    else await help.press('Enter')
    await expect(tooltip).toBeVisible()
    await page.getByRole('heading', { name: 'Contact', exact: true }).click()
    await expect(tooltip).toHaveCount(0)
})

test('administrative navigation remains role-gated and follows account security', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await expect((await openMenu(page)).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await mount(page, { admin: true, path: '/dashboard/security', content: 'navigation' })
    const dialog = await openMenu(page)
    const account = dialog.locator('[data-mobile-menu-group="account"]')
    expect(await account.locator('a,button').allTextContents()).toEqual(['Account security', 'Admin'])
    expect((await dialog.getByRole('navigation', { name: 'Account and profile' }).locator('a,button').allTextContents()).at(-1)).toBe('Sign Out')
    await expect(account.getByRole('link', { name: 'Account security', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(account.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute('href', '/admin')
})

test('signed-in profile loading and failures keep mobile navigation available without exposing editable fields', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const profileState of ['loading', 'error']) {
        await mount(page, { profileState })
        await expect(page.getByRole('textbox', { name: 'FULL NAME', exact: true })).toHaveCount(0)
        if (profileState === 'error') await expect(page.getByRole('alert')).toHaveText('Your profile could not be loaded. Please retry before editing.')
        else await expect(page.getByText('All of you...', { exact: false })).toBeVisible()
        const dialog = await openMenu(page)
        await expect(dialog.getByRole('link', { name: 'Edit Profile', exact: true })).toBeVisible()
        await expect(dialog.getByRole('link', { name: 'Account security', exact: true })).toBeVisible()
        await dialog.getByRole('link', { name: 'My nsso', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        await expect(page).toHaveURL('https://nsso.test/dashboard?view=my-nsso')
        expect(await page.evaluate(() => window.deleted)).toEqual([])
    }
})

test('Links help stays open while the pointer crosses into its text and Escape works with focus elsewhere', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 900 })
    await mount(page)
    const field = page.getByRole('textbox', { name: 'FULL NAME', exact: true })
    await field.focus()
    const help = page.getByRole('button', { name: 'About Links', exact: true })
    await help.hover()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toHaveText('Where can people find you or your work online?')
    const button = await help.boundingBox()
    await page.mouse.move(button.x + button.width / 2, button.y + button.height + 4)
    await expect(tooltip).toBeVisible()
    await tooltip.hover()
    await expect(tooltip).toBeVisible()
    await expect(field).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveCount(0)
    await expect(field).toBeFocused()
})
