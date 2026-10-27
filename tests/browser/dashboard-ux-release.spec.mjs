import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
test.beforeAll(async () => {
    const files = ['src/components/layout/Header.tsx', 'src/components/ui/ImageCropperModal.tsx', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx', 'src/app/dashboard/components/AdvancedModeCard.tsx', 'src/app/dashboard/components/ProductsServicesEditor.tsx', 'src/app/dashboard/components/SectionHelp.tsx', 'src/app/dashboard/components/ConfirmDeleteDialog.tsx', 'src/app/dashboard/components/SortableLinkItem.tsx', 'src/app/dashboard/components/SortableContactItem.tsx', 'src/app/dashboard/components/NetworkTable.tsx', 'src/app/dashboard/components/MyNssoTab.tsx']
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;background:#344956;color:white;font-family:Arial}#root{padding:110px 16px 110px}#fixture-chrome{position:fixed;bottom:0;height:88px;inset-inline:0;z-index:5000;background:#27323d}button,input,textarea,select{font:inherit}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'dashboard-ux-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/providers\/ProfileProvider|@\/components\/providers\/UserProvider|@\/components\/providers\/UIProvider|@\/components\/ui\/Toast|@\/components\/ui\/tahoe-glass|@\/components\/payments\/PayPalCodeEditor|@\/app\/dashboard\/components\/DashboardGlassCard)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const usePathname=()=>"/dashboard";export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push:path=>window.destinations.push(path),prefetch(){}});'
                    : path === 'next/link' ? 'export default props=><a {...props}/>;'
                        : path === 'next/image' ? 'export default ({priority,fill,...props})=><img {...props}/>;'
                            : path.endsWith('supabase/client') ? 'export const createClient=()=>({auth:{signOut:async()=>({error:null})}});'
                                : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:{id:"fixture",username:"fixture",user_type:"standard"}});'
                                    : path.endsWith('UIProvider') ? 'const noop=()=>{};export const useUI=()=>({setBackgroundDimmed:noop});'
                                        : path.endsWith('ProfileProvider') ? 'export const useProfile=()=>({mutationState:{status:"saved",message:""},retryPending:async()=>{},...window.fixtureProfile});'
                                            : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:()=>{}});'
                                                : path.endsWith('DashboardGlassCard') ? 'export default ({children,className})=><div className={className}>{children}</div>;'
                                                    : path.endsWith('PayPalCodeEditor') ? 'export default ()=>null;'
                                                        : 'import React from "react";import {TahoeGlassSurface} from "./src/components/ui/tahoe-glass/TahoeGlassSurface";export * from "./src/components/ui/tahoe-glass/index";export const TahoeBackdropHeader=({backdropEnabled,displacementProfile,materialLighting,...props})=><TahoeGlassSurface as="header" {...props}/>;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {DndContext} from '@dnd-kit/core';
            import {TahoeGlassEngineContext} from './src/components/providers/TahoeGlassProvider';
            import Header from './src/components/layout/Header';import Editor from './src/app/dashboard/components/AdvancedModeCard';
            import {SortableLinkItem} from './src/app/dashboard/components/SortableLinkItem';import {SortableContactItem} from './src/app/dashboard/components/SortableContactItem';
            import ImageCropper from './src/components/ui/ImageCropperModal';import MyNsso from './src/app/dashboard/components/MyNssoTab';
            window.deleted=[];window.destinations=[];window.fixtureDeleteSucceeds=true;window.cropApplied=false;
            window.fixtureProfile={experiences:[{id:'exp',company_name:'Fixture company',job_title:'Builder',start_year:2024,end_year:null}],qualifications:[{id:'qual',institution:'Fixture university',qualification_name:'Fixture degree',start_year:2020,end_year:2023}],projects:[{id:'project',project_name:'Fixture project',contribution:'Creator',project_url:'https://example.test',description:'Project description'}],products:[{id:'product',name:'Fixture offer',price:'£12',description:'Product description',purchase_link_active:true,purchase_link:'https://seller.example.test',paypal_active:false,sales_page_active:false,sales_page_published:false}],reorderExperiences:async()=>true,reorderQualifications:async()=>true,reorderProjects:async()=>true,patchEntity:async()=>true,createEntity:async()=>({status:'rejected',changes:[]}),removeEntity:async(type,id)=>{window.deleted.push({type,id});return window.fixtureDeleteSucceeds},refreshProfile:async()=>{},getRevision:()=>0};
            function App(){const [crop,setCrop]=useState(false);return <><Header/><div id="fixture-chrome">Fixed navigation</div><main>
                {location.search.includes('network')?<MyNsso initialData={{connections:[{id:'friend',connectedUserId:'friend',username:'friend',fullName:'Fixture Friend',dateMet:'2026-10-01',notes:'Saved notes',location:'Conference'}]}}/>:<>
                <DndContext><SortableLinkItem link={{id:'link',link_name:'Portfolio',link_url:'https://example.test'}} updateLink={()=>{}} removeLink={async()=>{window.deleted.push({type:'link'});return window.fixtureDeleteSucceeds}}/><SortableContactItem contact={{id:'contact',method:'Email',value:'test@example.invalid'}} updateContact={()=>{}} removeContact={async()=>{window.deleted.push({type:'contact'});return window.fixtureDeleteSucceeds}}/></DndContext>
                <Editor userId="fixture"/><button onClick={()=>setCrop(true)}>Edit photo fixture</button><ImageCropper isOpen={crop} onClose={()=>setCrop(false)} imageSrc={'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="coral"/></svg>')} aspectRatio={1} onCropComplete={async()=>{window.cropApplied=true;setCrop(false)}}/></>}
            </main></>};const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'layout-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};createRoot(document.getElementById('root')).render(<TahoeGlassEngineContext.Provider value={fallback}><App/></TahoeGlassEngineContext.Provider>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page, query = '') {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('https://nsso.test/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (path === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/fixture' + query)
}

async function expectReadableOverlay(dialog) {
    await expect(dialog).toHaveAttribute('data-tahoe-readable-overlay', 'true')
    const backing = await dialog.evaluate(element => {
        const style = getComputedStyle(element, '::before')
        return { color: style.backgroundColor, zIndex: style.zIndex, content: style.content }
    })
    expect(backing.color).toBe('rgb(32, 33, 38)')
    expect(backing.content).not.toBe('none')
    expect(Number(backing.zIndex)).toBeGreaterThan(10)
    await expect(dialog.locator('[data-liquid-glass]')).toHaveCount(0)
}

test('a standard mobile account can reach security and cannot see the privileged Admin item', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await page.getByRole('button', { name: 'Open account menu' }).click()
    const dialog = page.getByRole('dialog', { name: 'Menu', exact: true })
    await expectReadableOverlay(dialog)
    await expect(dialog.getByRole('link', { name: 'Account security' })).toHaveAttribute('href', '/dashboard/security')
    await expect(dialog.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Sign Out' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
})

test('links and contacts require confirmation and cancelled deletion never writes', async ({ page }) => {
    await mount(page)
    for (const [trigger, title] of [['Remove Portfolio', 'Delete Portfolio?'], ['Remove Email contact method', 'Delete Email contact method?']]) {
        await page.getByRole('button', { name: trigger, exact: true }).click()
        const dialog = page.getByRole('dialog', { name: title, exact: true })
        await expectReadableOverlay(dialog)
        await expect(dialog.getByRole('button', { name: 'Keep item' })).toBeFocused()
        await dialog.getByRole('button', { name: 'Keep item' }).click()
    }
    expect(await page.evaluate(() => window.deleted)).toEqual([])
    await page.getByRole('button', { name: 'Remove Portfolio', exact: true }).click()
    await page.evaluate(() => { window.fixtureDeleteSucceeds = false })
    const dialog = page.getByRole('dialog', { name: 'Delete Portfolio?', exact: true })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Removal could not be confirmed')
    await expect(dialog.getByRole('button', { name: 'Delete', exact: true })).toBeEnabled()
})

test('all advanced content deletion paths confirm above fixed navigation', async ({ page }, testInfo) => {
    await mount(page)
    await page.getByRole('button', { name: /^Experience & Education/ }).click()
    for (const [tab, trigger, title] of [[null, 'Delete experience', 'Delete experience at Fixture company?'], ['Qualifications', 'Delete qualification', 'Delete Fixture degree?'], ['Projects', 'Delete project', 'Delete Fixture project?']]) {
        if (tab) await page.getByRole('tab', { name: tab, exact: true }).click()
        await page.getByRole('button', { name: trigger, exact: true }).click()
        await page.getByRole('dialog', { name: title, exact: true }).getByRole('button', { name: 'Keep item' }).click()
    }
    await page.getByRole('button', { name: /^Products & Services/ }).click()
    await page.getByRole('button', { name: 'Edit Fixture offer', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.screenshot({ path: testInfo.outputPath('product-editor.png'), fullPage: true })
    await page.getByRole('button', { name: 'Delete offering', exact: true }).focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Delete Fixture offer?', exact: true })
    await expectReadableOverlay(dialog)
    expect(await dialog.evaluate(element => {
        const overlay = element.closest('[data-tahoe-glass-dialog-overlay]')
        return overlay.parentElement === document.body && Number(getComputedStyle(overlay).zIndex) > Number(getComputedStyle(document.getElementById('fixture-chrome')).zIndex)
    })).toBe(true)
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => window.deleted)).toEqual([{ type: 'product', id: 'product' }])
})

test('future integrations and PayPal explanations work with touch or keyboard even before enabling PayPal', async ({ page }) => {
    await mount(page)
    await page.getByRole('button', { name: /^Products & Services/ }).click()
    const planned = page.getByRole('button', { name: 'Coming soon', exact: true })
    await expect(planned).toHaveAttribute('aria-expanded', 'false')
    await planned.focus()
    await planned.press('Enter')
    await page.getByRole('button', { name: 'About Web3 wallet', exact: true }).click()
    await expect(page.getByText('Wallet sign-in and crypto payments are planned for a future release.')).toBeVisible()
    await page.getByRole('button', { name: 'Edit Fixture offer', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'About PayPal checkout', exact: true }).click()
    await expect(page.getByRole('tooltip')).toContainText('PayPal controls the recipient, price and checkout')
    await expect(page.getByRole('switch', { name: 'Enable PayPal button code' })).toHaveAttribute('aria-checked', 'false')
})

test('notes dialog portals above navigation and keeps its mobile close target usable', async ({ page }, testInfo) => {
    await mount(page, '?network')
    await page.screenshot({ path: testInfo.outputPath('network-cards.png'), fullPage: true })
    await page.getByRole('list', { name: 'Your connections' }).getByRole('button', { name: 'Edit notes for Fixture Friend', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Notes for Fixture Friend' })
    await expectReadableOverlay(dialog)
    expect(await dialog.evaluate(element => element.closest('[data-tahoe-glass-dialog-overlay]').parentElement === document.body)).toBe(true)
    const close = await dialog.getByRole('button', { name: 'Close notes dialog' }).boundingBox()
    expect(close.width).toBeGreaterThanOrEqual(44)
    expect(close.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({ path: testInfo.outputPath('notes-dialog.png') })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
})

test('image cropping keeps zoom and Apply accessible on short landscape phones', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 667, height: 320 })
    await mount(page)
    await page.getByRole('button', { name: 'Edit photo fixture' }).click()
    const dialog = page.getByRole('dialog', { name: 'Crop Image' })
    await expectReadableOverlay(dialog)
    await expect(dialog.getByRole('slider', { name: 'Zoom' })).toBeVisible()
    const apply = dialog.getByRole('button', { name: 'Apply Crop', exact: true })
    await expect(apply).toBeEnabled()
    const bounds = await apply.boundingBox()
    expect(bounds.y).toBeGreaterThanOrEqual(0)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(320)
    await page.screenshot({ path: testInfo.outputPath('landscape-cropper.png') })
    await apply.click()
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => window.cropApplied)).toBe(true)
})
