import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const actor = '11111111-1111-4111-8111-111111111111', productId = '33333333-3333-4333-8333-333333333333'
const savedPayPal = '<form action="https://www.paypal.com/ncp/payment/AB12CD34EF56G" method="post"><input type="submit" value="Buy Now"></form>'
let bundle, css
test.beforeAll(async () => {
    const files = ['src/components/products/SalesPageCreator.tsx', 'src/components/payments/PayPalCodeEditor.tsx', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/light-panel.ts', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx']
    const candidates = files.flatMap(file => {
        const source = ts.createSourceFile(file, readFileSync(root + file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
        const literals = []
        const visit = node => {
            if (ts.isStringLiteralLike(node)) literals.push(node.text)
            if (ts.isTemplateExpression(node)) literals.push(node.head.text, ...node.templateSpans.map(span => span.literal.text))
            ts.forEachChild(node, visit)
        }
        visit(source)
        return literals.flatMap(value => value.split(/\s+/))
    })
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates)
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'creator-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|link)|@\/lib\/(?:supabase\/client|profile-media-client)|@\/components\/(?:providers\/ProfileProvider|ui\/(?:Toast|ImageCropperModal))|@\/app\/dashboard\/components\/DashboardGlassCard)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/link' ? 'export default ({children,href,onClick,...props})=><a {...props} href={href} onClick={onClick}>{children}</a>;'
                    : path === 'next/navigation' ? `export const useParams=()=>({id:'${productId}'}),useRouter=()=>window.fixtureRouter;`
                    : path.endsWith('ProfileProvider') ? 'import {useSyncExternalStore} from "react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,()=>window.fixtureProfile);'
                        : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});'
                            : path.endsWith('ImageCropperModal') ? 'import React from "react";export default ({isOpen,onCropComplete,loading})=>isOpen?<div role="dialog"><button disabled={loading} onClick={()=>onCropComplete(new Blob(["fixture-raster"],{type:"image/jpeg"}),new AbortController().signal)}>Apply fixture crop</button></div>:null;'
                                    : path.endsWith('DashboardGlassCard') ? 'import React from "react";export default ({children})=><div>{children}</div>;'
                                            : path.endsWith('profile-media-client') ? `export {runProfileMediaAttempt} from './src/lib/profile-media-client';export const uploadProfileMedia=async()=>{window.fixtureUploads++;if(window.fixtureHoldUpload)await new Promise(resolve=>window.fixtureReleaseUpload=resolve);return{url:'https://media.example.test/image.jpg',path:'${actor}/product/fixture.jpg'}};`
                                                : `export const createClient=()=>({auth:{getUser:async()=>{if(window.fixtureAuthFailure)throw new Error('Synthetic Auth unavailable');if(window.fixtureHoldAuth)await new Promise(resolve=>window.fixtureReleaseAuth=resolve);return{data:{user:{id:'${actor}'}},error:null}}}});` }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';import Creator from './src/app/dashboard/products/[id]/creator/page';
            window.fixtureListeners=new Set();window.fixtureSubscribe=fn=>{window.fixtureListeners.add(fn);return()=>window.fixtureListeners.delete(fn)};
            window.fixtureNavigation=[];window.fixtureToasts=[];window.fixtureUploads=0;window.fixturePatches=0;window.fixtureAuthFailure=false;
            window.fixtureRouter={push:path=>window.fixtureNavigation.push(path)};
            window.updateCreatorStatus=status=>{window.fixtureProfile={...window.fixtureProfile,mutationState:{status,message:status==='saved'?'':'Your change is not confirmed.'}};window.fixtureListeners.forEach(fn=>fn())};
            window.fixtureProfile={products:[{id:'${productId}',user_id:'${actor}',name:'Fixture offer',price:'£12',benefits:[],testimonials:[],paypal_html:window.fixtureSavedPayPal||null}],loading:false,patchEntity:async()=>{window.fixturePatches++;return true},refreshProfile:async()=>{},getRevision:()=>0,retryPending:async()=>{},mutationState:{status:'saved',message:''}};
            createRoot(document.getElementById('root')).render(<Creator/>);
        ` } })
    bundle = result.outputFiles[0].text
})
async function fixture(page, { initialPayPal = null } = {}) {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://nsso.test/fixture', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }))
    await page.goto('https://nsso.test/fixture')
    await page.addStyleTag({ content: css })
    await page.evaluate(value => { window.fixtureSavedPayPal = value }, initialPayPal)
    await page.addScriptTag({ content: bundle })
    await expect(page.getByRole('heading', { name: 'Sales Page Creator', exact: true })).toBeVisible()
    return errors
}

test('both creator preview actions explicitly disable checkout on their destination', async ({ page }) => {
    const errors = await fixture(page)
    await page.getByRole('button', { name: 'Preview page', exact: true }).first().click()
    await page.getByRole('button', { name: 'Preview page', exact: true }).nth(1).click()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([`/products/${productId}?source=creator&preview=true`, `/products/${productId}?source=creator&preview=true`])
    expect(errors).toEqual([])
})

test('pending, rejected and uncertain saves never show Saved or allow a stale preview', async ({ page }) => {
    await fixture(page)
    for (const status of ['saving', 'failed', 'conflict', 'outcomeUnknown']) {
        await page.evaluate(status => window.updateCreatorStatus(status), status)
        await expect(page.getByText('Saved', { exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Preview page', exact: true }).first()).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Preview page', exact: true }).nth(1)).toBeDisabled()
    }
    await page.evaluate(() => window.updateCreatorStatus('saved'))
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Preview page', exact: true }).first()).toBeEnabled()
})

test('direct creator explicitly discards only its invalid local payment draft and returns to the exact offering', async ({ page }) => {
    const operations = []
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) operations.push(request.url()) })
    const errors = await fixture(page, { initialPayPal: savedPayPal })
    const code = page.getByRole('textbox', { name: 'PayPal button code', exact: true })
    await code.fill('Synthetic unsaved payment code')
    await expect(page.getByRole('button', { name: 'Save payment button', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Preview page', exact: true }).first()).toBeDisabled()
    const back = page.getByRole('link', { name: 'Back', exact: true })
    await expect(back).toHaveAttribute('href', `/dashboard?view=profile&offering=${productId}`)
    await back.click()
    await expect(page.getByRole('alert')).toContainText('Your draft is still here')
    await expect(code).toHaveValue('Synthetic unsaved payment code')
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    await page.getByRole('button', { name: 'Discard local payment draft and go back', exact: true }).click()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([`/dashboard?view=profile&offering=${productId}`])
    expect(await page.evaluate(() => window.fixtureProfile.products[0].paypal_html)).toBe(savedPayPal)
    expect(await page.evaluate(() => window.fixturePatches)).toBe(0)
    expect(operations).toEqual([])
    expect(errors).toEqual([])
})

test('standalone creator cannot leave or discard while a real payment save is pending', async ({ page }) => {
    const errors = await fixture(page, { initialPayPal: savedPayPal })
    let release
    const pending = new Promise(resolve => { release = resolve })
    const operations = []
    await page.route('https://nsso.test/api/products/**/payment', async route => {
        const operation = route.request().postDataJSON()
        operations.push(operation)
        await pending
        return route.fulfill({ status: 409, json: { status: 'conflict', operationId: operation.operationId, revision: 1, changes: [] } })
    })
    const code = page.getByRole('textbox', { name: 'PayPal button code', exact: true })
    await code.fill(savedPayPal.replace('AB12CD34EF56G', 'XY12CD34EF56G'))
    await page.getByRole('link', { name: 'Back', exact: true }).click()
    const discard = page.getByRole('button', { name: 'Discard local payment draft and go back', exact: true })
    await expect(discard).toBeEnabled()
    await page.getByRole('button', { name: 'Save payment button', exact: true }).click()
    await expect.poll(() => operations.length).toBe(1)
    await expect(page.getByRole('button', { name: 'Back to offering', exact: true })).toBeDisabled()
    await expect(discard).toBeDisabled()
    const back = page.getByRole('link', { name: 'Back', exact: true })
    await expect(back).toHaveAttribute('aria-disabled', 'true')
    // A normal Playwright click intentionally waits for aria-disabled to clear,
    // which would let the real request deadline expire. Exercise the native
    // keyboard guard while the held save is still pending instead.
    await back.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('alert').filter({ hasText: 'Wait for the payment save' })).toBeVisible()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    release()
    await expect(page.getByRole('button', { name: 'Refresh for review', exact: true })).toBeEnabled()
    await expect(discard).toBeEnabled()
    await expect(page.getByRole('alert').filter({ hasText: 'Your draft is still here' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Wait for the payment save' })).toHaveCount(0)
    await discard.click()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([`/dashboard?view=profile&offering=${productId}`])
    expect(operations).toHaveLength(1)
    expect(await page.evaluate(() => window.fixtureProfile.products[0].paypal_html)).toBe(savedPayPal)
    expect(await page.evaluate(() => window.fixturePatches)).toBe(0)
    expect(errors).toEqual([])
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
