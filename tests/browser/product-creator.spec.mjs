import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const actor = '11111111-1111-4111-8111-111111111111', productId = '33333333-3333-4333-8333-333333333333'
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'creator-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/navigation|@\/lib\/(?:supabase\/client|profile-media-client)|@\/components\/(?:providers\/ProfileProvider|payments\/PayPalCodeEditor|ui\/(?:Toast|ImageCropperModal|tahoe-glass))|@\/app\/dashboard\/components\/DashboardGlassCard)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? `export const useParams=()=>({id:'${productId}'}),useRouter=()=>window.fixtureRouter;`
                    : path.endsWith('ProfileProvider') ? 'import {useSyncExternalStore} from "react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,()=>window.fixtureProfile);'
                        : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});'
                            : path.endsWith('PayPalCodeEditor') ? 'export default ()=>null;'
                                : path.endsWith('ImageCropperModal') ? 'import React from "react";export default ({isOpen,onCropComplete,loading})=>isOpen?<div role="dialog"><button disabled={loading} onClick={()=>onCropComplete(new Blob(["fixture-raster"],{type:"image/jpeg"}),new AbortController().signal)}>Apply fixture crop</button></div>:null;'
                                    : path.endsWith('DashboardGlassCard') ? 'import React from "react";export default ({children})=><div>{children}</div>;'
                                        : path.endsWith('tahoe-glass') ? 'import React from "react";export const TahoeGlassSurface=({as:Tag="div",children})=><Tag>{children}</Tag>;export const TahoeGlassButton=({children,onClick,disabled,...props})=><button onClick={onClick} disabled={disabled} aria-label={props["aria-label"]}>{children}</button>;export const TahoeGlassField=({label,children})=><label>{label}{children}</label>;'
                                            : path.endsWith('profile-media-client') ? `export {runProfileMediaAttempt} from './src/lib/profile-media-client';export const uploadProfileMedia=async()=>{window.fixtureUploads++;if(window.fixtureHoldUpload)await new Promise(resolve=>window.fixtureReleaseUpload=resolve);return{url:'https://media.example.test/image.jpg',path:'${actor}/product/fixture.jpg'}};`
                                                : `export const createClient=()=>({auth:{getUser:async()=>{if(window.fixtureAuthFailure)throw new Error('Synthetic Auth unavailable');if(window.fixtureHoldAuth)await new Promise(resolve=>window.fixtureReleaseAuth=resolve);return{data:{user:{id:'${actor}'}},error:null}}}});` }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';import Creator from './src/app/dashboard/products/[id]/creator/page';
            window.fixtureListeners=new Set();window.fixtureSubscribe=fn=>{window.fixtureListeners.add(fn);return()=>window.fixtureListeners.delete(fn)};
            window.fixtureNavigation=[];window.fixtureToasts=[];window.fixtureUploads=0;window.fixturePatches=0;window.fixtureAuthFailure=false;
            window.fixtureRouter={push:path=>window.fixtureNavigation.push(path)};
            window.updateCreatorStatus=status=>{window.fixtureProfile={...window.fixtureProfile,mutationState:{status,message:status==='saved'?'':'Your change is not confirmed.'}};window.fixtureListeners.forEach(fn=>fn())};
            window.fixtureProfile={products:[{id:'${productId}',user_id:'${actor}',name:'Fixture offer',price:'£12',benefits:[],testimonials:[],paypal_html:null}],loading:false,patchEntity:async()=>{window.fixturePatches++;return true},refreshProfile:async()=>{},getRevision:()=>0,retryPending:async()=>{},mutationState:{status:'saved',message:''}};
            createRoot(document.getElementById('root')).render(<Creator/>);
        ` } })
    bundle = result.outputFiles[0].text
})
async function fixture(page) {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://nsso.test/fixture', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
    await page.goto('https://nsso.test/fixture')
    await page.addScriptTag({ content: bundle })
    await expect(page.getByRole('heading', { name: 'Sales Page Creator', exact: true })).toBeVisible()
    return errors
}

test('both creator preview actions explicitly disable checkout on their destination', async ({ page }) => {
    const errors = await fixture(page)
    await page.getByRole('button', { name: 'Preview Page', exact: true }).click()
    await page.getByRole('button', { name: 'Preview Sales Page', exact: true }).click()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([`/products/${productId}?source=creator&preview=true`, `/products/${productId}?source=creator&preview=true`])
    expect(errors).toEqual([])
})

test('pending, rejected and uncertain saves never show Saved or allow a stale preview', async ({ page }) => {
    await fixture(page)
    for (const status of ['saving', 'failed', 'conflict', 'outcomeUnknown']) {
        await page.evaluate(status => window.updateCreatorStatus(status), status)
        await expect(page.getByText('Saved', { exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Preview Page', exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Preview Sales Page', exact: true })).toBeDisabled()
    }
    await page.evaluate(() => window.updateCreatorStatus('saved'))
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview Page', exact: true })).toBeEnabled()
})

test('an Auth failure during image upload keeps the crop and releases busy state for retry', async ({ page }) => {
    const errors = await fixture(page)
    await page.locator('input[type="file"]').setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from('synthetic-image-file') })
    await page.evaluate(() => { window.fixtureAuthFailure = true })
    await page.getByRole('button', { name: 'Apply fixture crop', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureToasts.length)).toBe(1)
    await expect(page.getByRole('button', { name: 'Apply fixture crop', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => window.fixtureUploads)).toBe(0)
    await page.evaluate(() => { window.fixtureAuthFailure = false })
    await page.getByRole('button', { name: 'Apply fixture crop', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureUploads)).toBe(1)
    expect(errors).toEqual([])
})

test('a denied clipboard does not acknowledge a copied AI prompt', async ({ page }) => {
    const errors = await fixture(page)
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Synthetic clipboard denial') } } }))
    await page.getByRole('button', { name: 'Copy AI Prompt', exact: true }).first().click()
    await expect.poll(() => page.evaluate(() => window.fixtureToasts)).toEqual([{ message: 'The prompt could not be copied. Please try again.', type: 'error' }])
    expect(errors).toEqual([])
})

test('a stalled Auth lookup releases the crop and cannot start a late upload', async ({ page }) => {
    await page.clock.install()
    const errors = await fixture(page)
    await page.locator('input[type="file"]').setInputFiles({ name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('synthetic-image-file') })
    await page.evaluate(() => {window.fixtureHoldAuth=true})
    await page.getByRole('button',{name:'Apply fixture crop',exact:true}).click()
    await page.waitForFunction(() => Boolean(window.fixtureReleaseAuth))
    await page.clock.fastForward(8_001)
    await expect(page.getByRole('button',{name:'Apply fixture crop',exact:true})).toBeEnabled()
    await page.evaluate(() => {window.fixtureReleaseAuth();window.fixtureHoldAuth=false})
    expect(await page.evaluate(() => window.fixtureUploads)).toBe(0)
    expect(await page.evaluate(() => window.fixturePatches)).toBe(0)
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(errors).toEqual([])
})

test('a stalled image callback releases busy state and ignores a late upload without automatically replaying it', async ({ page }) => {
    await page.clock.install()
    const errors = await fixture(page)
    await page.locator('input[type="file"]').setInputFiles({ name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('synthetic-image-file') })
    await page.evaluate(() => {window.fixtureHoldUpload=true})
    await page.getByRole('button',{name:'Apply fixture crop',exact:true}).click()
    await page.waitForFunction(() => Boolean(window.fixtureReleaseUpload))
    await page.clock.fastForward(30_001)
    await expect(page.getByRole('button',{name:'Apply fixture crop',exact:true})).toBeEnabled()
    await page.evaluate(() => {window.fixtureReleaseUpload();window.fixtureHoldUpload=false})
    expect(await page.evaluate(() => window.fixtureUploads)).toBe(1)
    expect(await page.evaluate(() => window.fixturePatches)).toBe(0)
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button',{name:'Apply fixture crop',exact:true}).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureUploads)).toBe(2)
    expect(await page.evaluate(() => window.fixturePatches)).toBe(1)
    expect(errors).toEqual([])
})
