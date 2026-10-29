import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { expectOpaqueLightPanel, minimumTextContrast } from './helpers/light-panel-assertions.mjs'
import { controlMaterial, expectWhiteEditorControls, keyboardFocus, renderedControlContrast } from './helpers/white-control-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, realSceneBundle, css

function sourceFiles(directory) {
    return readdirSync(root + directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? sourceFiles(directory + '/' + entry.name)
        : /\.(?:ts|tsx)$/.test(entry.name) ? [directory + '/' + entry.name] : [])
}

test.beforeAll(async () => {
    const candidates = ['src/app/dashboard/page.tsx', 'src/app/preview/page.tsx', 'src/components/agent/AgentChatInterface.tsx', 'src/components/providers/NSSOTahoeGlassEnvironment.tsx', 'src/components/providers/TahoeGlassProvider.tsx', ...sourceFiles('src/app/dashboard/components'), ...sourceFiles('src/components/ui'), ...sourceFiles('src/components/layout')]
        .flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\n:root{--mobile-bottom-safe-space:8px;--mobile-bottom-nav-height:80px}body{margin:0;background:linear-gradient(130deg,#385a6b,#b9abbb);color:white;font-family:Arial}button,input,textarea,select{font:inherit}#fixture-outside{height:100px}#fixture-outside button{min-height:44px}'
    for (const realScene of [false, true]) {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'profile-editor-polish-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/providers\/(?:ProfileProvider|UserProvider|UIProvider)|@\/components\/ui\/(?:Toast|tahoe-glass)|@\/components\/layout\/DashboardSidebar|@\/components\/profile\/ProfileSaveStatus|@\/components\/ui\/ImageCropperModal|@\/app\/dashboard\/components\/(?:EarningsTab|MyNssoTab|AdvancedModeCard))$/ }, args => realScene && /(?:providers\/UIProvider|ui\/tahoe-glass)$/.test(args.path) ? null : ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.routeSubscribers.add(fn);return()=>window.routeSubscribers.delete(fn)};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search));export const useRouter=()=>({push:window.fixtureNavigate,prefetch(){}});`
                    : path === 'next/link' ? `export default function Link({href,onClick,children,...props}){return <a {...props} href={href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.fixtureNavigate(href)}}}>{children}</a>}`
                        : path === 'next/image' ? 'export default ({priority,fill,...props})=><img {...props}/>;'
                            : path.endsWith('supabase/client') ? 'export const createClient=()=>({auth:{signOut:async()=>{window.signOuts++;return{error:null}}},from:()=>({select(){return this},eq(){return this},single:async()=>({data:window.fixtureProfile?.profile??null,error:null})})});'
                                : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:window.fixtureUser,loading:false,refreshUser:async()=>{window.fixturePreviewRefreshes.user++}});'
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
            ${realScene ? `import Environment from'./src/components/providers/NSSOTahoeGlassEnvironment';import{UIProvider}from'./src/components/providers/UIProvider';import Chat from'./src/components/agent/AgentChatInterface';` : ''}
            import Dashboard from './src/app/dashboard/page';import Header from './src/components/layout/Header';
            import Preview from './src/app/preview/page';import {routeNeedsGlobalAccountHeader} from './src/lib/tahoe-glass/route-boundaries';
            import GlobalNavigation from './src/components/layout/GlobalNavigation';import AuthenticatedLayout from './src/components/layout/AuthenticatedLayoutWrapper';
            window.routeSubscribers=new Set();window.destinations=[];window.toasts=[];window.deleted=[];window.created=[];window.reordered=[];window.deityEvents=[];window.signOuts=0;window.fixtureRowScrolls=[];window.fixturePreviewRefreshes={user:0,profile:0};
            const nativeScrollIntoView=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){const row=this.closest('[data-profile-item-id]');if(row)window.fixtureRowScrolls.push({id:row.getAttribute('data-profile-item-id'),options});return nativeScrollIntoView.call(this,options)};
            window.fixtureUser={id:'qa',username:'fixture',email:window.fixtureOptions.admin?'raminhoodeh@gmail.com':'fixture@example.invalid',permissions:window.fixtureOptions.admin?['nsso:admin']:[],user_type:window.fixtureOptions.admin?'admin':'standard'};
            window.fixtureNavigate=target=>{window.destinations.push(target);history.pushState({},'',target);window.routeSubscribers.forEach(fn=>fn())};
            window.addEventListener('open-deity-chat',()=>window.deityEvents.push({menuPresent:!!document.querySelector('[data-mobile-account-menu]'),bodyPosition:document.body.style.position,inert:document.getElementById('root').inert}));
            function App(){const [,update]=useState(0);const refresh=()=>update(value=>value+1);${realScene ? `const[chatOpen,setChatOpen]=useState(false);React.useEffect(()=>{const open=()=>setChatOpen(true);window.addEventListener('open-deity-chat',open);return()=>window.removeEventListener('open-deity-chat',open)},[]);` : ''}const profile=window.fixtureProfile||={
                profile:window.fixtureOptions.profileState==='error'?null:{user_id:'qa',full_name:'Fixture Name',headline:'Builder',bio:'A fixture biography.',profile_pic_url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384"><rect width="384" height="384" fill="#9abfd1"/><circle cx="192" cy="142" r="66" fill="#e2b8a1"/><path d="M60 384v-32a132 132 0 0 1 264 0v32" fill="#334e68"/></svg>')},loading:window.fixtureOptions.profileState==='loading',profileCompleteness:100,
                experiences:[],qualifications:[],projects:[],products:[],
                links:[{id:'link-1',link_name:'Portfolio',link_url:'https://example.test/portfolio'},{id:'link-2',link_name:'Writing',link_url:'https://example.test/writing'}],
                contacts:[{id:'contact-1',method:'Email',value:'test@example.invalid'},{id:'contact-2',method:'Phone',value:'+123456789'}],
                updateField:async()=>true,patchProfile:async()=>true,refreshProfile:async()=>{window.fixturePreviewRefreshes.profile++},addLink:()=>{},addContact:()=>{},
                createEntity:async(kind,values,position)=>{
                    const id='qa-created-'+(window.created.length+1);const entity=kind==='link'?'links':'contacts';window.created.push({kind,position,id,values});
                    const finish=()=>{if(window.fixtureCreateMode==='failed')return{status:'failed',changes:[]};const row={...values,id,user_id:'qa'};profile[entity]=position==='top'?[row,...profile[entity]]:[...profile[entity],row];refresh();return{status:'applied',changes:[{entity,id,row}]}};
                    if(window.fixtureCreateMode==='pending')return new Promise(resolve=>window.resolveFixtureCreate=()=>resolve(finish()));
                    return finish();
                },
                updateLink:(id,field,value)=>{profile.links=profile.links.map(row=>row.id===id?{...row,[field]:value}:row);refresh()},
                updateContact:(id,field,value)=>{profile.contacts=profile.contacts.map(row=>row.id===id?{...row,[field]:value}:row);refresh()},
                removeLink:async id=>{window.deleted.push({type:'link',id});profile.links=profile.links.filter(row=>row.id!==id);refresh();return true},
                removeContact:async id=>{window.deleted.push({type:'contact',id});profile.contacts=profile.contacts.filter(row=>row.id!==id);refresh();return true},
                reorderLinks:ids=>{window.reordered.push({type:'link',ids});profile.links=ids.map(id=>profile.links.find(row=>row.id===id));refresh()},
                reorderContacts:ids=>{window.reordered.push({type:'contact',ids});profile.contacts=ids.map(id=>profile.contacts.find(row=>row.id===id));refresh()}
            };${realScene ? `if(!profile.fixtureFieldsBound){profile.fixtureFieldsBound=true;window.fixtureFieldWrites=[];profile.updateField=async(field,value)=>{profile.profile={...profile.profile,[field]:value};window.fixtureFieldWrites.push({kind:'field',field,value});refresh();return true};profile.patchProfile=async patch=>{profile.profile={...profile.profile,...patch};window.fixtureFieldWrites.push({kind:'patch',patch});refresh();return true};}` : ''}return <><AuthenticatedLayout>{window.fixtureOptions.content==='dashboard'?<Dashboard/>:window.fixtureOptions.content==='preview'?<Preview/>:<>{!routeNeedsGlobalAccountHeader(location.pathname)&&<Header variant={window.fixtureOptions.content==='owner'?'owner':'default'} username="fixture"/>}<main style={{paddingTop:120,minHeight:1600}}>Other route content</main></>}</AuthenticatedLayout><GlobalNavigation/><div data-fixture-closed-deity role="dialog" aria-label="Synthetic Deity" aria-modal="true" aria-hidden="true" inert={true} style={{position:'fixed',inset:0,opacity:0,pointerEvents:'none'}}><textarea aria-label="Synthetic Deity message"/></div>${realScene ? `{chatOpen&&<div role="dialog" aria-label="Rendered Deity fixture" aria-modal="true" style={{position:'fixed',inset:0,zIndex:6000,padding:12,background:'rgba(0,0,0,.5)'}}><Chat isFullScreen onClose={()=>setChatOpen(false)}/></div>}` : ''}<div id="fixture-outside"><button>Outside focus target</button></div></>};
            const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'layout-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            const fixtureRoot=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>fixtureRoot.unmount();fixtureRoot.render(${realScene ? '<UIProvider><Environment><App/></Environment></UIProvider>' : '<TahoeGlassEngineContext.Provider value={fallback}><App/></TahoeGlassEngineContext.Provider>'});
        ` },
    })
    if (realScene) realSceneBundle = result.outputFiles[0].text
    else bundle = result.outputFiles[0].text
    }
})

test('top and bottom Add controls insert Links and Contact at the chosen edge and immediately focus the new field', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const [kind, label, entity, fieldName] of [
        ['link', 'Add link', 'links', 'Link name'],
        ['contact', 'Add contact method', 'contacts', 'Email contact details'],
    ]) {
        await mount(page)
        await expect(page.locator('[data-fixture-closed-deity]')).toHaveAttribute('inert', '')
        const original = await page.evaluate(entity => window.fixtureProfile[entity].map(row => row.id), entity)
        for (const position of ['top', 'bottom']) {
            const button = page.getByRole('button', { name: label + (position === 'bottom' ? ' at bottom' : ''), exact: true })
            await expect(button).toHaveAttribute('data-nsso-control', 'white')
            await expect(button).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.28)')
            expect(await minimumTextContrast(button.locator('[data-light-button-content]'))).toBeGreaterThanOrEqual(4.5)
            await button.press(position === 'top' ? 'Enter' : 'Space')
            const created = await page.evaluate(() => window.created.at(-1))
            expect(created).toMatchObject({ kind, position })
            const field = page.locator(`[data-profile-item-id="${created.id}"]`).getByRole('textbox', { name: fieldName, exact: true })
            await expect(field).toBeFocused()
            const box = await field.boundingBox()
            expect(box.y).toBeGreaterThanOrEqual(88)
            expect(box.y + box.height).toBeLessThanOrEqual(844)
            const order = await page.evaluate(entity => window.fixtureProfile[entity].map(row => row.id), entity)
            expect(position === 'top' ? order[0] : order.at(-1)).toBe(created.id)
            expect(order.filter(id => original.includes(id))).toEqual(original)
            await field.fill(position + ' synthetic ' + kind)
            await expect(field).toHaveValue(position + ' synthetic ' + kind)
        }
        expect(await page.evaluate(() => window.reordered)).toEqual([])
        expect(await page.evaluate(() => window.deleted)).toEqual([])
    }
})

test('in-flight additions prevent duplicate clicks and failed additions neither invent a row nor steal field focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await page.evaluate(() => { window.fixtureCreateMode = 'pending' })
    const add = page.getByRole('button', { name: 'Add link', exact: true })
    await add.press('Enter')
    await expect(add).toHaveAttribute('aria-busy', 'true')
    await expect(add).toHaveAttribute('aria-disabled', 'true')
    await expect(add).toBeFocused()
    await expect(page.getByRole('button', { name: 'Add link at bottom', exact: true })).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByRole('button', { name: 'Add contact method', exact: true })).toHaveAttribute('aria-disabled', 'true')
    await add.press('Enter')
    expect(await page.evaluate(() => window.created.length)).toBe(1)
    await page.evaluate(() => window.resolveFixtureCreate())
    await expect(page.locator('[data-profile-item-id="qa-created-1"]').getByRole('textbox', { name: 'Link name', exact: true })).toBeFocused()
    await expect(add).not.toHaveAttribute('aria-busy', 'true')
    await page.evaluate(() => { window.fixtureCreateMode = 'failed' })
    await add.press('Enter')
    await expect(add).not.toHaveAttribute('aria-busy', 'true')
    await expect(page.locator('[data-profile-item-id="qa-created-2"]')).toHaveCount(0)
    await expect(add).toBeFocused()
    expect(await page.evaluate(() => window.fixtureProfile.links.map(row => row.id))).toEqual(['qa-created-1', 'link-1', 'link-2'])
})

for (const destination of ['field', 'menu', 'view', 'deity', 'native-modal']) test(`a delayed Add receipt never steals focus after selecting ${destination}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
        await mount(page)
        await page.evaluate(() => { window.fixtureCreateMode = 'pending' })
        const add = page.getByRole('button', { name: 'Add link', exact: true })
        await add.press('Enter')
        await expect(add).toHaveAttribute('aria-busy', 'true')
        if (destination === 'field') await page.getByRole('textbox', { name: 'HEADLINE', exact: true }).focus()
        else if (destination === 'menu') await openMenu(page, true)
        else if (destination === 'view') await page.evaluate(() => window.fixtureNavigate('/dashboard?view=my-nsso'))
        else if (destination === 'deity') await page.evaluate(() => {
            const shell = document.querySelector('[data-fixture-closed-deity]')
            shell.removeAttribute('inert'); shell.setAttribute('aria-hidden', 'false'); shell.style.opacity = '1'; shell.style.pointerEvents = 'auto'
            shell.querySelector('textarea').focus()
        })
        else await page.evaluate(() => {
            const dialog = document.createElement('dialog')
            dialog.innerHTML = '<button id="synthetic-native-modal-focus">Native modal focus target</button>'
            document.body.append(dialog); dialog.showModal()
        })
        // WebKit can finish its own focus/keyboard scroll after focus(). Track
        // app-requested row scrolling instead of confusing that native settling
        // with a late receipt stealing focus or calling scrollIntoView().
        const before = await page.evaluate(() => ({ rowScrolls: window.fixtureRowScrolls.length, active: document.activeElement?.getAttribute('id'), label: document.activeElement?.getAttribute('aria-label') }))
        await page.evaluate(() => window.resolveFixtureCreate())
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        expect(await page.evaluate(() => ({ rowScrolls: window.fixtureRowScrolls.length, active: document.activeElement?.getAttribute('id'), label: document.activeElement?.getAttribute('aria-label') }))).toEqual(before)
        if (destination === 'field') await expect(page.getByRole('textbox', { name: 'HEADLINE', exact: true })).toBeFocused()
        else if (destination === 'menu') {
            await expect(page.getByRole('button', { name: 'Close menu', exact: true })).toBeFocused()
            await page.keyboard.press('Escape')
            await expect(page.getByRole('button', { name: 'Open account menu', exact: true })).toBeFocused()
        } else if (destination === 'view') {
            await expect(page).toHaveURL('https://nsso.test/dashboard?view=my-nsso')
            await page.evaluate(() => window.fixtureNavigate('/dashboard?view=profile'))
            const row = page.locator('[data-profile-item-id="qa-created-1"]')
            await expect(row).toHaveCount(1)
            await expect(row.getByRole('textbox', { name: 'Link name', exact: true })).not.toBeFocused()
        } else if (destination === 'deity') await expect(page.getByRole('textbox', { name: 'Synthetic Deity message', exact: true })).toBeFocused()
        else await expect(page.getByRole('button', { name: 'Native modal focus target', exact: true })).toBeFocused()
        expect(await page.evaluate(() => window.created.length)).toBe(1)
        expect(await page.evaluate(() => window.fixtureProfile.links[0].id)).toBe('qa-created-1')
})

test('identity card has one compact top-right Ask Deity control and a generously sized mobile photo', async ({ page }, testInfo) => {
    for (const width of testInfo.project.name === 'desktop' ? [1440] : [320, 390, 430]) {
        await page.setViewportSize({ width, height: 900 })
        await mount(page)
        const header = page.locator('[data-profile-identity-header]')
        const card = header.locator('xpath=..')
        const ask = card.getByRole('button', { name: 'Ask Deity about my profile', exact: true })
        await expect(ask).toHaveCount(1)
        const [headingBox, askBox] = await Promise.all([header.getByRole('heading', { name: 'Hey, wonderful', exact: true }).boundingBox(), ask.boundingBox()])
        expect(askBox.x).toBeGreaterThanOrEqual(headingBox.x + headingBox.width)
        expect(Math.abs(headingBox.y + headingBox.height / 2 - askBox.y - askBox.height / 2)).toBeLessThanOrEqual(1)
        const photoBox = await card.getByRole('button', { name: 'Upload profile picture', exact: true }).boundingBox()
        expect(photoBox.width).toBeGreaterThanOrEqual(250)
        expect(Math.abs(photoBox.width - photoBox.height)).toBeLessThanOrEqual(1)
        const lens = ask.locator('[data-ask-deity-lens]')
        await expect(lens).toHaveCSS('height', '28px')
        await expect(lens).toHaveCSS('font-size', '12px')
        expect(askBox.height).toBeGreaterThanOrEqual(44)
        await ask.press('Enter')
        expect(await page.evaluate(() => window.deityEvents.length)).toBe(1)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`identity-one-deity-large-photo-${width}.png`) })
    }
})

test('desktop bio native dragging grows its glass container, clamps at four times its height and preserves editing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Native mouse resizing is desktop-only.')
    await page.setViewportSize({ width: 1440, height: 1800 })
    const state = await mount(page, { realScene: true, standardsMode: true })
    try {
        const bio = page.getByRole('textbox', { name: 'BIO', exact: true })
        const card = page.locator('[data-profile-identity-header]').locator('xpath=../..')
        const urlHeading = page.getByRole('heading', { name: 'Profile URL', exact: true })
        const geometry = () => bio.evaluate(element => ({
            field: element.getBoundingClientRect().height,
            shell: element.closest('[data-tahoe-glass-surface="recessed"]').getBoundingClientRect().height,
            width: element.getBoundingClientRect().width,
        }))
        const drag = async delta => {
            await bio.scrollIntoViewIfNeeded()
            const box = await bio.boundingBox()
            await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4)
            await page.mouse.down()
            await page.mouse.move(box.x + box.width - 4, box.y + box.height - 4 + delta, { steps: 12 })
            await page.mouse.up()
        }
        await expect(bio).toHaveCSS('resize', 'vertical')
        const initial = await geometry()
        expect(initial.field).toBe(120)
        const initialCard = await card.boundingBox(), initialUrl = await urlHeading.boundingBox()
        await drag(180)
        await expect.poll(async () => (await geometry()).field).toBe(300)
        const expanded = await geometry(), expandedCard = await card.boundingBox(), expandedUrl = await urlHeading.boundingBox()
        expect(expanded.shell - initial.shell).toBe(180)
        expect(expandedCard.height - initialCard.height).toBe(180)
        expect(expandedUrl.y - initialUrl.y).toBe(180)
        expect(expanded.width).toBe(initial.width)
        await drag(600)
        await expect.poll(async () => (await geometry()).field).toBe(initial.field * 4)
        await expect(bio).toHaveValue('A fixture biography.')
        expect(await page.evaluate(() => window.fixtureFieldWrites)).toEqual([])
        await page.screenshot({ path: testInfo.outputPath('desktop-bio-expanded.png'), fullPage: false })
        await drag(-1000)
        await expect.poll(async () => (await geometry()).field).toBe(initial.field)
        await bio.fill('A synthetic biography edited after resizing.')
        await bio.press('Tab')
        await expect.poll(() => page.evaluate(() => window.fixtureProfile.profile.bio)).toBe('A synthetic biography edited after resizing.')
        await drag(200)
        await page.setViewportSize({ width: 390, height: 844 })
        await expect(bio).toHaveCSS('resize', 'none')
        await expect.poll(async () => (await geometry()).field).toBe(384)
        await expect(bio).toHaveValue('A synthetic biography edited after resizing.')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(state.errors).toEqual([])
        expect(state.unexpected).toEqual([])
    } finally { await page.evaluate(() => window.fixtureUnmount()) }
})

test('mobile bio retains its writing space and never exposes desktop resizing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Touch-layout regression.')
    const state = await mount(page, { realScene: true, standardsMode: true })
    try {
        const bio = page.getByRole('textbox', { name: 'BIO', exact: true })
        for (const width of [320, 390, 767, 1024]) {
            await page.setViewportSize({ width, height: 844 })
            await expect(bio).toHaveCSS('resize', 'none')
            const size = await bio.evaluate(element => {
                const style = getComputedStyle(element)
                return { height: element.getBoundingClientRect().height, intrinsic: element.rows * parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) }
            })
            expect(size.height).toBe(width < 768 ? 384 : size.intrinsic)
            expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        }
        expect(state.errors).toEqual([])
        expect(state.unexpected).toEqual([])
    } finally { await page.evaluate(() => window.fixtureUnmount()) }
})

test('subtitle-free mobile section titles are vertically centred beside their add controls without an empty subtitle gutter', async ({ page }) => {
    for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 })
        await mount(page)
        for (const [title, addName] of [['Links', 'Add link'], ['Contact', 'Add contact method']]) {
            const heading = page.getByRole('heading', { name: title, exact: true })
            const [headingBox, addBox] = await Promise.all([heading.boundingBox(), page.getByRole('button', { name: addName, exact: true }).boundingBox()])
            expect(Math.abs(headingBox.y + headingBox.height / 2 - addBox.y - addBox.height / 2)).toBeLessThanOrEqual(1)
        }
        await expect(page.getByText('Add your contact methods and social profiles.', { exact: true })).toHaveCount(0)
        await expect(page.getByText('Where can people find you or your work online?', { exact: true })).not.toBeVisible()
    }
})

async function mount(page, { path = '/dashboard', admin = false, content = 'dashboard', profileState = 'ready', realScene = false, standardsMode = false } = {}) {
    const errors = [], unexpected = [], requests = []
    if (realScene) {
        page.on('pageerror', error => errors.push(error.message))
        await page.addInitScript(() => {
            const request = requestAnimationFrame.bind(window), cancel = cancelAnimationFrame.bind(window), pending = new Map()
            window.fixtureCloudFrames = { scheduled: 0, pending: () => [...pending.values()].filter(Boolean).length }
            window.requestAnimationFrame = callback => {
                const cloud = new Error().stack?.includes('/vendor/vanta-') ?? false
                if (cloud) window.fixtureCloudFrames.scheduled++
                const id = request(timestamp => { pending.delete(id); callback(timestamp) }); pending.set(id, cloud); return id
            }
            window.cancelAnimationFrame = id => { pending.delete(id); cancel(id) }
        })
    }
    await page.emulateMedia({ reducedMotion: realScene ? 'no-preference' : 'reduce' })
    await page.route('**/*', route => {
        const url = new URL(route.request().url()); requests.push({ path: url.pathname, method: route.request().method() })
        if (url.origin !== 'https://nsso.test') { unexpected.push(url.origin + url.pathname); return route.abort() }
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: realScene ? realSceneBundle : bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (realScene && url.pathname.startsWith('/vendor/')) return route.fulfill({ contentType: 'application/javascript', body: readFileSync(root + 'public' + url.pathname) })
        if (realScene && url.pathname === '/assets/backgrounds/nsso-deck-blue.webp') return route.fulfill({ contentType: 'image/webp', body: readFileSync(root + 'public' + url.pathname) })
        if (realScene && ['/assets/nsso-logo.png', '/nsso-agent-avatar.png', '/deity logo white.png'].includes(decodeURIComponent(url.pathname))) return route.fulfill({ contentType: 'image/png', body: readFileSync(root + 'public' + decodeURIComponent(url.pathname)) })
        if (url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'application/json', body: '{}' })
        if (/\.(?:png|svg)$/.test(url.pathname)) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="458" height="224"><rect width="458" height="224" fill="silver"/></svg>' })
        return route.fulfill({ contentType: 'text/html', body: (standardsMode ? '<!doctype html>' : '') + '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.fixtureOptions=' + JSON.stringify({ admin, content, profileState }) + '</script><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test' + path)
    await expect(page.locator('button[aria-label="Open account menu"]')).toBeAttached()
    return { errors, unexpected, requests }
}

async function expectRealDashboardDeck(page, state) {
    await expect(page.locator('[data-nsso-deck-background="true"]')).toHaveCount(1)
    await expect(page.locator('#vanta-bg')).toHaveCount(0)
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-glass-source', /nsso-deck-blue/)
    await expect(page.locator('[data-tahoe-glass-provider]')).toHaveAttribute('data-tahoe-material-family', 'supplied')
    const identityCard = page.locator('[data-profile-identity-header]').locator('xpath=ancestor::*[@data-tahoe-glass-surface][1]')
    await expect(identityCard).toHaveAttribute('data-tahoe-optical-engine', 'supplied-shared')
    await expect(identityCard).toHaveAttribute('data-tahoe-material-implementation', 'supplied-original')
    await expect(identityCard).not.toHaveAttribute('data-tahoe-chromium-optics')
    await expect(identityCard.locator(':scope > [data-supplied-glass-layer="coat"]')).toHaveCount(1)
    await expect(identityCard.locator(':scope > [data-supplied-glass-layer="rim"]')).toHaveCount(1)
    const decoded = await page.evaluate(async () => {
        const image = new Image(); image.src = '/assets/backgrounds/nsso-deck-blue.webp'; await image.decode()
        const source = document.querySelector('[data-nsso-deck-background="true"]')
        return { width: image.naturalWidth, height: image.naturalHeight, image: getComputedStyle(source).backgroundImage, color: getComputedStyle(source).backgroundColor }
    })
    expect(decoded).toMatchObject({ width: 1920, height: 1360, color: 'rgb(67, 98, 140)' })
    expect(decoded.image).toContain('/assets/backgrounds/nsso-deck-blue.webp')
    const animation = await page.evaluate(async () => {
        for (let tick = 0; tick < 30; tick++) await new Promise(requestAnimationFrame)
        return { cloudSchedules: window.fixtureCloudFrames.scheduled, pendingCloudFrames: window.fixtureCloudFrames.pending(), three: typeof window.THREE, vanta: typeof window.VANTA, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }
    })
    expect(animation).toEqual({ cloudSchedules: 0, pendingCloudFrames: 0, three: 'undefined', vanta: 'undefined', reducedMotion: false })
    expect(state.requests.filter(request => /\/vendor\/(?:three|vanta)/.test(request.path))).toEqual([])
    expect(state.unexpected).toEqual([])
    return { decoded, animation }
}

test('real dashboard deck scene survives query views, scrolling and resizing without cloud initialization', async ({ page }, testInfo) => {
    const state = await mount(page, { path: '/dashboard?view=profile&source=deck-fixture', realScene: true })
    try {
        await expect(page.getByRole('heading', { name: 'Hey, wonderful', exact: true })).toBeVisible()
        const checks = [await expectRealDashboardDeck(page, state)]
        for (const query of ['', '?view=my-nsso', '?view=earnings', '?view=profile&source=deck-fixture']) {
            await page.evaluate(query => window.fixtureNavigate('/dashboard' + query), query)
            await expect(page).toHaveURL('https://nsso.test/dashboard' + query)
            await expect(page.locator('[data-nsso-deck-background="true"]')).toHaveCount(1)
            await expect(page.locator('#vanta-bg')).toHaveCount(0)
        }
        await expect(page.getByRole('textbox', { name: 'BIO', exact: true })).toHaveValue('A fixture biography.')
        await page.getByRole('textbox', { name: 'BIO', exact: true }).scrollIntoViewIfNeeded()
        const viewport = page.viewportSize()
        await page.setViewportSize({ width: viewport.width, height: viewport.height - 80 })
        await page.evaluate(() => scrollTo(0, 0))
        checks.push(await expectRealDashboardDeck(page, state))
        // Sample the real rendered outer gutter, not a detached canvas or a
        // data-attribute-only claim that could pass with a flat blue fallback.
        const { data, info } = await sharp(await page.screenshot()).extract({ left: 2, top: 104, width: 12, height: 32 }).raw().toBuffer({ resolveWithObject: true })
        const samples = Array.from({ length: 12 * 32 }, (_, index) => data[index * info.channels + 2])
        const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length
        const grainDeviation = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length)
        expect(grainDeviation).toBeGreaterThan(.2)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        expect(state.errors).toEqual([])
        await testInfo.attach('real-dashboard-static-performance', { body: Buffer.from(JSON.stringify({ checks, grainDeviation, requests: state.requests })), contentType: 'application/json' })
        await page.screenshot({ path: testInfo.outputPath('real-dashboard-deck-profile.png') })
    } finally { await page.evaluate(() => window.fixtureUnmount()) }
})

test('real dashboard fields stay usable over deck grain and the actual Deity chat stays opaque', async ({ page }, testInfo) => {
    const state = await mount(page, { realScene: true, standardsMode: true })
    try {
        const name = page.getByRole('textbox', { name: 'FULL NAME', exact: true })
        await expect(name).toHaveValue('Fixture Name')
        await name.fill('Fixture Deck Person')
        await name.press('Tab')
        await expect.poll(() => page.evaluate(() => window.fixtureProfile.profile.full_name)).toBe('Fixture Deck Person')
        const nameInk = await name.evaluate(element => {
            const style = getComputedStyle(element), canvas = document.createElement('canvas')
            canvas.width = canvas.height = 1
            const context = canvas.getContext('2d')
            const rgba = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data] }
            const expected = style.getPropertyValue('--color-slate-950')
            if (!expected) throw new Error('Missing opaque core ink token')
            return { actual: rgba(style.color), expected: rgba(expected) }
        })
        expect(nameInk.actual).toEqual(nameInk.expected)
        expect(nameInk.actual[3]).toBe(255)
        expect(await name.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(200)
        expect(await page.locator('[data-profile-identity-header]').evaluate(element => element.closest('[data-tahoe-glass-tint]')?.getAttribute('data-tahoe-glass-tint'))).toBe('light')
        const bio = page.getByRole('textbox', { name: 'BIO', exact: true })
        await bio.fill('A clearly readable, synthetic biography over the exact deck background.')
        await bio.press('Tab')
        await expect.poll(() => page.evaluate(() => window.fixtureProfile.profile.bio)).toBe('A clearly readable, synthetic biography over the exact deck background.')
        await page.getByRole('button', { name: 'Add link', exact: true }).press('Enter')
        const created = await page.evaluate(() => window.created.at(-1))
        expect(created).toMatchObject({ kind: 'link', position: 'top' })
        const link = page.locator(`[data-profile-item-id="${created.id}"]`).getByRole('textbox', { name: 'Link name', exact: true })
        await expect(link).toBeFocused()
        await link.fill('Synthetic deck link')
        await expect(link).toHaveValue('Synthetic deck link')
        await page.evaluate(() => window.fixtureNavigate('/dashboard?view=my-nsso'))
        await page.evaluate(() => window.fixtureNavigate('/dashboard?view=profile'))
        await expect(name).toHaveValue('Fixture Deck Person')
        await expect(bio).toHaveValue('A clearly readable, synthetic biography over the exact deck background.')
        if (page.viewportSize().width < 1024) {
            const header = page.locator('[data-nsso-topbar]').filter({ visible: true })
            await expect(header).toHaveCount(1)
            await expect(header.getByRole('button', { name: 'Preview Profile', exact: true })).toBeVisible()
            await expect(header.getByRole('button', { name: 'Open account menu', exact: true })).toBeVisible()
        }
        await page.locator('[data-profile-identity-header]').getByRole('button', { name: 'Ask Deity about my profile', exact: true }).press('Enter')
        const chat = page.locator('[data-deity-surface="opaque"]')
        await expect(chat).toBeVisible()
        expect(await chat.evaluate(element => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, opacity: getComputedStyle(element).opacity }))).toEqual({ color: 'oklch(0.129 0.042 264.695)', background: 'rgb(227, 231, 237)', opacity: '1' })
        const composer = page.getByRole('textbox', { name: 'Message Deity', exact: true })
        await composer.fill('A synthetic unsent message only.')
        await expect(composer).toHaveValue('A synthetic unsent message only.')
        await expect(page.getByRole('button', { name: /Fast mode/i })).toHaveCount(0)
        await expectRealDashboardDeck(page, state)
        expect(state.requests.filter(request => request.path.startsWith('/api/deity/'))).toEqual([])
        expect(state.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([])
        expect(state.errors).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath('real-dashboard-opaque-deity.png') })
    } finally { await page.evaluate(() => window.fixtureUnmount()) }
})

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
    expect(await group.locator('a,button').allTextContents()).toEqual(['nsso homepage', 'Edit Profile', 'My nsso', 'Deity', 'News FeedComing soon'])
    await expect(group.getByRole('link', { name: 'Edit Profile', exact: true })).toHaveAttribute('aria-current', 'page')
    const myNsso = group.getByRole('link', { name: 'My nsso', exact: true })
    const destination = new URL(await myNsso.getAttribute('href'), 'https://nsso.test')
    expect(destination.pathname).toBe('/dashboard')
    expect(Object.fromEntries(destination.searchParams)).toEqual({ claim: 'keep-name', source: 'qa', view: 'my-nsso' })
    const items = await dialog.getByRole('navigation', { name: 'Account and profile' }).locator('a,button').allTextContents()
    expect(items.map(text => text.trim().replace(/\s+/g, ' '))).toEqual(['nsso homepage', 'Edit Profile', 'My nsso', 'Deity', 'News FeedComing soon', 'Preview Profile', 'Copy profile URL', 'Delete my profile', 'Sign Out'])
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
    await expect(dialog.getByRole('button', { name: 'Sign Out', exact: true })).toHaveCSS('outline-style', 'solid')
    await expect(dialog.getByRole('button', { name: 'Sign Out', exact: true })).toHaveCSS('outline-width', '2px')
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

test('mobile core routes use one account menu instead of bottom navigation; desktop sidebar and route-owned experiences remain intact', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const path of ['/dashboard', '/dashboard/?view=my-nsso']) {
        await mount(page, { path, content: 'navigation' })
        await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
    }
    for (const path of ['/preview', '/dashboard/security', '/dashboard/products/product/sales-page', '/admin', '/?view=home']) {
        await mount(page, { path, content: 'navigation' })
        await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
        await expect(page.locator('[data-nsso-topbar]')).toHaveCount(1)
        await expect(page.getByRole('button', { name: 'Open account menu', exact: true })).toBeVisible()
        await openMenu(page, true)
        await page.keyboard.press('Escape')
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

test('preview keeps the editor topbar material with copy followed by an accessible account menu and no checkout banner', async ({ page }, testInfo) => {
    const widths = testInfo.project.name === 'desktop' ? [1440, 768] : [390, 320]
    for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        await mount(page)
        const material = await page.locator('[data-nsso-topbar]').evaluate(element => ({
            classes: element.className.split(' ').filter(name => !['lg:hidden', 'md:hidden'].includes(name)).sort(),
            coating: getComputedStyle(element, '::after').backgroundImage,
            tint: getComputedStyle(element, '::after').opacity,
        }))
        await mount(page, { path: '/preview', content: 'preview' })
        await expect(page.getByRole('heading', { name: "I'm Fixture Name", exact: true })).toBeVisible()
        await expect(page.locator('[data-nsso-topbar]')).toHaveCount(1)
        await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
        await expect(page.getByText(/Profile preview — checkout is disabled|Unsaved changes are not yet public/)).toHaveCount(0)
        await expect(page.getByText('Checkout is disabled during profile preview', { exact: true })).toHaveCount(0)
        const current = await page.locator('[data-nsso-topbar]').evaluate(element => ({
            classes: element.className.split(' ').filter(name => !['lg:hidden', 'md:hidden'].includes(name)).sort(),
            coating: getComputedStyle(element, '::after').backgroundImage,
            tint: getComputedStyle(element, '::after').opacity,
        }))
        expect(current).toEqual(material)
        expect(current.coating).toContain('linear-gradient')
        const copy = page.getByRole('button', { name: 'Copy page URL', exact: true })
        const trigger = page.getByRole('button', { name: 'Open account menu', exact: true })
        if (width >= 768) await expect(copy).toBeVisible()
        else await expect(copy).not.toBeVisible()
        await expect(trigger).toBeVisible()
        if (width >= 768) {
            const [copyBox, triggerBox] = await Promise.all([copy.boundingBox(), trigger.boundingBox()])
            expect(triggerBox.x).toBeGreaterThanOrEqual(copyBox.x + copyBox.width)
        }
        await trigger.focus()
        const dialog = await openMenu(page, true)
        await expect(dialog.getByRole('link', { name: 'Preview Profile', exact: true })).toHaveAttribute('aria-current', 'page')
        await page.keyboard.press('Escape')
        await expect(trigger).toBeFocused()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath(`preview-shared-nav-${width}.png`) })
        await (await openMenu(page, true)).getByRole('link', { name: 'Edit Profile', exact: true }).press('Enter')
        expect(await page.evaluate(() => window.destinations)).toEqual(['/dashboard?view=profile'])
    }
})

test('profile and preview QR face contains only the code in an equally padded opaque square', async ({ page }, testInfo) => {
    for (const width of testInfo.project.name === 'desktop' ? [1440] : [390, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await mount(page, { path: '/preview', content: 'preview' })
        const photo = page.getByRole('button', { name: "Show Fixture Name's QR code", exact: true })
        await photo.focus()
        await page.keyboard.press('Enter')
        const qr = page.getByRole('button', { name: "Show Fixture Name's profile photo", exact: true })
        await expect(qr).toHaveAttribute('aria-pressed', 'true')
        await expect(qr.getByText('Tap to show QR', { exact: true })).toHaveCount(0)
        const plate = qr.locator('[data-profile-qr-plate]')
        await expect(plate.getByRole('img', { name: "Fixture Name's profile QR code", exact: true })).toHaveCount(1)
        const matrix = await plate.locator('svg').innerHTML()
        expect(await plate.evaluate(element => element.parentElement.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0)
        await expect(plate.locator('span:not(.sr-only)')).toHaveCount(0)
        await expect(plate.getByText('Tap for photo', { exact: true })).toHaveCount(0)
        const padding = await plate.evaluate(element => {
            const style = getComputedStyle(element)
            return { padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft], background: style.backgroundColor, width: element.clientWidth, height: element.clientHeight }
        })
        expect(padding.padding).toEqual(['20px', '20px', '20px', '20px'])
        expect(padding.width).toBe(padding.height)
        expect(padding.background).toBe('rgb(255, 255, 255)')
        await plate.evaluate(element => Promise.all(element.parentElement.getAnimations().map(animation => animation.finished.catch(() => {}))))
        await page.screenshot({ path: testInfo.outputPath(`profile-qr-${width}.png`) })
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await qr.press('Space')
        await expect(photo).toHaveAttribute('aria-pressed', 'false')
        await expect.poll(() => photo.evaluate(element => element.querySelector('[style*="preserve-3d"]').getAnimations().filter(animation => animation.playState === 'running').length)).toBeGreaterThan(0)
        // Changing the accessibility preference also stops an in-flight flip.
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await expect.poll(() => photo.evaluate(element => element.querySelector('[style*="preserve-3d"]').getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0)
        await photo.press('Enter')
        await expect(qr).toHaveAttribute('aria-pressed', 'true')
        expect(await plate.evaluate(element => element.parentElement.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0)
        expect(await plate.locator('svg').innerHTML()).toBe(matrix)
    }
})

test('the signed-in public profile keeps copy and menu controls without resurrecting a bottom bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page, { path: '/fixture', content: 'owner' })
    await expect(page.locator('[data-nsso-topbar]')).toHaveCount(1)
    await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
    const copy = page.getByRole('button', { name: 'Copy page URL', exact: true })
    await expect(copy).toBeVisible()
    const trigger = page.getByRole('button', { name: 'Open account menu', exact: true })
    expect((await trigger.boundingBox()).x).toBeGreaterThan((await copy.boundingBox()).x)
    const dialog = await openMenu(page, true)
    await expect(dialog.getByRole('link', { name: 'Edit Profile', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
})

test('loading or failed preview keeps a verified account menu so editing remains reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const profileState of ['loading', 'error']) {
        await mount(page, { path: '/preview', content: 'preview', profileState })
        await expect(page.locator('[data-nsso-topbar]')).toHaveCount(1)
        await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
        await expect(page.getByRole('heading', { name: "I'm Fixture Name", exact: true })).toHaveCount(0)
        if (profileState === 'error') {
            const recovery = page.getByRole('region', { name: 'Profile preview recovery', exact: true })
            await expect(recovery).toContainText('Your editing draft has been kept.')
            await expectOpaqueLightPanel(page, recovery)
            expect(await minimumTextContrast(recovery.locator('p'))).toBeGreaterThanOrEqual(4.5)
            const retry = recovery.getByRole('button', { name: 'Retry preview', exact: true })
            await expect(retry).toBeVisible()
            expect(await minimumTextContrast(retry.locator('[data-tahoe-button-content]'))).toBeGreaterThanOrEqual(4.5)
            await retry.press('Enter')
            await expect(recovery).toBeVisible()
            expect(await page.evaluate(() => window.fixturePreviewRefreshes)).toEqual({ user: 1, profile: 1 })
        }
        const dialog = await openMenu(page, true)
        await dialog.getByRole('link', { name: 'Edit Profile', exact: true }).press('Enter')
        expect(await page.evaluate(() => window.destinations)).toEqual(['/dashboard?view=profile'])
    }
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
            expect(dragBox.width).toBe(44)
            expect(dragBox.height).toBe(44)
            expect(Math.abs(dragBox.x + dragBox.width / 2 - toolbarBox.x - toolbarBox.width / 2)).toBeLessThanOrEqual(1)
            await expect(handle.locator('svg')).toHaveAttribute('width', '20')
            await expect(handle.locator('svg')).toHaveAttribute('height', '20')
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

test('real editor X controls exactly share Deity white material in normal, hover and keyboard-focus states', async ({ page, browserName }, testInfo) => {
    await page.setViewportSize({ width: testInfo.project.name.includes('desktop') ? 1440 : 320, height: 900 })
    const state = await mount(page, { realScene: true, standardsMode: true })
    const states = async control => {
        await control.scrollIntoViewIfNeeded()
        await control.evaluate(element => element.blur())
        await page.mouse.move(0, 0)
        await expect(control).toHaveAttribute('data-tahoe-native-lens', 'supplied')
        await expect(control).toHaveAttribute('data-tahoe-glass-measured', 'true')
        await expect(control).toHaveAttribute('data-tahoe-glass-state', 'active')
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        await expect(control.locator(':scope > [data-supplied-glass-layer="coat"]')).toHaveCount(1)
        await expect(control.locator(':scope > [data-supplied-glass-layer="rim"]')).toHaveCount(1)
        const canonical = await control.evaluate(element => {
            const coat = element.querySelector(':scope > [data-supplied-glass-layer="coat"]')
            const style = getComputedStyle(coat), canvas = document.createElement('canvas')
            canvas.width = canvas.height = 1
            const context = canvas.getContext('2d'); context.fillStyle = style.backgroundColor; context.fillRect(0, 0, 1, 1)
            return { backend: element.dataset.tahoeGlassBackend, background: [...context.getImageData(0, 0, 1, 1).data], shadow: style.boxShadow, childCanvases: element.querySelectorAll('canvas').length, inline: { coat: coat.getAttribute('style'), rim: element.querySelector(':scope > [data-supplied-glass-layer="rim"]').getAttribute('style') } }
        })
        expect(canonical.background).toEqual(canonical.backend === 'webgl' ? [0, 0, 0, 0] : [255, 255, 255, 64])
        expect(canonical.shadow.split('inset').length).toBeGreaterThan(6)
        expect(canonical.childCanvases).toBe(0)
        const normal = await controlMaterial(control)
        expect(normal).toMatchObject({ width: 44, height: 44, textShadow: 'none', opacity: '1', focusVisible: false, icon: { width: '18', height: '18' } })
        expect(await renderedControlContrast(control)).toBeGreaterThanOrEqual(4.5)
        await control.hover()
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        const hover = await controlMaterial(control)
        expect(await renderedControlContrast(control)).toBeGreaterThanOrEqual(4.5)
        await page.mouse.move(0, 0)
        await keyboardFocus(control, page, browserName)
        await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
        expect(await renderedControlContrast(control)).toBeGreaterThanOrEqual(4.5)
        const focus = await controlMaterial(control)
        expect(focus.outline).toMatchObject({ width: '2px', style: 'solid' })
        expect(focus.outlineOffset).toBe('2px')
        return { normal, hover, focus, canonical: canonical.inline }
    }
    try {
        for (const name of ['Drag to reorder Portfolio', 'Drag to reorder Email contact method']) {
            const handle = page.getByRole('button', { name, exact: true })
            const toolbar = handle.locator('xpath=ancestor::*[@data-sortable-controls][1]')
            const [dragBox, toolbarBox] = await Promise.all([handle.boundingBox(), toolbar.boundingBox()])
            expect(dragBox.width).toBe(44)
            expect(dragBox.height).toBe(44)
            expect(Math.abs(dragBox.x + dragBox.width / 2 - toolbarBox.x - toolbarBox.width / 2)).toBeLessThanOrEqual(1)
        }
        const link = await states(page.getByRole('button', { name: 'Remove Portfolio', exact: true }))
        const contact = await states(page.getByRole('button', { name: 'Remove Email contact method', exact: true }))
        expect(contact).toEqual(link)
        await page.getByRole('button', { name: 'Ask Deity about my profile', exact: true }).press('Enter')
        const chat = page.locator('[data-deity-surface="opaque"]')
        await expect(chat).toBeVisible()
        const deity = await states(chat.getByRole('button', { name: 'Close Deity chat', exact: true }))
        expect(deity).toEqual(link)
        await chat.getByRole('button', { name: 'Close Deity chat', exact: true }).press('Enter')
        await expect(chat).toHaveCount(0)
        await page.mouse.move(0, 0)
        const controls = await expectWhiteEditorControls(page.locator('main'), { photoException: true })
        expect(controls.filter(control => /^Add /.test(control.label)).length).toBeGreaterThanOrEqual(4)
        expect(await page.evaluate(() => ({ deleted: window.deleted, reordered: window.reordered, created: window.created }))).toEqual({ deleted: [], reordered: [], created: [] })
        expect(state.requests.filter(request => !['GET', 'HEAD', 'OPTIONS'].includes(request.method))).toEqual([])
        expect(state.errors).toEqual([])
        await page.screenshot({ path: testInfo.outputPath('shared-white-deity-editor-close.png') })
    } finally { await page.evaluate(() => window.fixtureUnmount()) }
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

test('administrative navigation remains capability-and-email gated with profile deletion secondary', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await expect((await openMenu(page)).getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await mount(page, { admin: true, path: '/dashboard/security', content: 'navigation' })
    const dialog = await openMenu(page)
    const account = dialog.locator('[data-mobile-menu-group="account"]')
    expect(await account.locator('a,button').allTextContents()).toEqual(['Admin', 'Delete my profile'])
    expect((await dialog.getByRole('navigation', { name: 'Account and profile' }).locator('a,button').allTextContents()).at(-1)).toBe('Sign Out')
    await expect(account.getByRole('link', { name: 'Account security', exact: true })).toHaveCount(0)
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
        await expect(dialog.getByRole('button', { name: 'Delete my profile', exact: true })).toBeVisible()
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
