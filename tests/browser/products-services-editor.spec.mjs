import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const account = '22222222-2222-4222-8222-222222222222'
const paypal = '<form action="https://www.paypal.com/ncp/payment/AB12CD34EF56G" method="post"><input type="submit" value="Buy Now"></form>'
const changedPaypal = paypal.replace('AB12CD34EF56G', 'XY12CD34EF56G')
let bundle, css

// The actual editor, material controls, tooltips, confirmation and cropper run
// together. Only the authenticated provider and network boundary are fixtures.
test.beforeAll(async () => {
    const files = [
        'src/app/dashboard/components/AdvancedModeCard.tsx',
        'src/app/dashboard/components/ProductsServicesEditor.tsx',
        'src/app/dashboard/components/DashboardGlassCard.tsx',
        'src/app/dashboard/components/ConfirmDeleteDialog.tsx',
        'src/app/dashboard/components/SectionHelp.tsx',
        'src/components/payments/PayPalCodeEditor.tsx',
        'src/components/ui/GlassCard.tsx',
        'src/components/ui/ImageCropperModal.tsx',
        'src/components/ui/PayPalSmartButton.tsx',
        'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx',
        'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx',
        'src/components/ui/tahoe-glass/TahoeGlassField.tsx',
    ]
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root, onDependency() {} })
    css = compiler.build(candidates) + '\nhtml{background:#4d6b7b}body{background:linear-gradient(150deg,#51788f,#535c74 60%,#97858a);background-attachment:fixed}#root{max-width:1100px;margin:auto;padding:120px 16px 80px}#fixture-header{position:fixed;inset:0 0 auto;height:88px;z-index:200;background:rgba(58,79,95,.96);color:white;padding:24px;font-weight:700;border-bottom:1px solid #ffffff55}button,input,textarea,select{font:inherit}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'offerings-provider-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:@\/components\/providers\/ProfileProvider|@\/components\/ui\/Toast|next\/image)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path.endsWith('ProfileProvider') ? 'import {useSyncExternalStore} from "react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,window.fixtureSnapshot,window.fixtureSnapshot);'
                    : path === 'next/image' ? 'export default ({priority,fill,...props})=><img {...props}/>;'
                        : 'export const useToast=()=>({showToast:message=>window.fixtureToasts.push(message)});' }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';
            import Editor from './src/app/dashboard/components/AdvancedModeCard';
            import {TahoeGlassEngineContext} from './src/components/providers/TahoeGlassProvider';
            const listeners=new Set();window.fixtureToasts=[];window.fixtureWrites=[];window.fixturePatchFails=false;window.fixtureDeleteFails=false;window.fixtureCreateFails=false;window.fixturePendingPatch=null;
            const count=Number(new URLSearchParams(location.search).get('count')??2);
            let snapshot;const emit=patch=>{snapshot={...snapshot,...patch};for(const listener of listeners)listener()};
            window.fixtureSubscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};window.fixtureSnapshot=()=>snapshot;window.fixtureUpdate=emit;
            const offering=index=>({id:'offering-'+index,user_id:'${account}',name:'Fixture offering '+index,price:'GBP '+(index*10),description:'A clearly described synthetic offering for testing.',image_url:index===1?'/fixture-thumb.svg':null,purchase_link_active:true,purchase_link:'https://seller.example.test/offering-'+index,paypal_active:true,paypal_html:${JSON.stringify(paypal)},sales_page_active:false,sales_page_published:false});
            const settlePatch=async pending=>{if(window.fixtureHoldPatches)await new Promise(resolve=>{window.fixtureReleasePatch=resolve});await new Promise(resolve=>setTimeout(resolve,90));if(window.fixturePatchFails){emit({mutationState:{status:'failed',message:'Changes could not be saved. Your changes are still here.'}});return false}emit({products:snapshot.products.map(item=>item.id===pending.id?{...item,...pending.patch}:item),mutationState:{status:'saved',message:''}});window.fixturePendingPatch=null;return true};
            snapshot={products:Array.from({length:count},(_,index)=>offering(index+1)),experiences:[],qualifications:[],projects:[],loading:false,loadError:null,mutationState:{status:'saved',message:''},getRevision:()=>snapshot.revision??0,
                patchEntity:async(kind,id,patch)=>{window.fixtureWrites.push({kind:'patch',entity:kind,id,patch});window.fixturePendingPatch={id,patch};emit({products:snapshot.products.map(item=>item.id===id?{...item,...patch}:item),mutationState:{status:'saving',message:'Saving changes…'}});return settlePatch(window.fixturePendingPatch)},
                retryPending:async()=>{if(!window.fixturePendingPatch)return;emit({mutationState:{status:'saving',message:'Saving changes…'}});await settlePatch(window.fixturePendingPatch)},
                createEntity:async(kind,values)=>{window.fixtureWrites.push({kind:'create',entity:kind,values});emit({mutationState:{status:'saving',message:'Saving changes…'}});await new Promise(resolve=>setTimeout(resolve,60));if(window.fixtureCreateFails){emit({mutationState:{status:'failed',message:'Offering could not be created.'}});return{status:'rejected',changes:[]}}const row={...offering(100),...values,id:'created-offering'};emit({products:[...snapshot.products,row],mutationState:{status:'saved',message:''}});return{status:'applied',operationId:'fixture-create',revision:1,changes:[{entity:'products',id:row.id,row}]}},
                removeEntity:async(kind,id)=>{window.fixtureWrites.push({kind:'remove',entity:kind,id});await new Promise(resolve=>setTimeout(resolve,60));if(window.fixtureDeleteFails)return false;emit({products:snapshot.products.filter(item=>item.id!==id)});return true},
                refreshProfile:async()=>true,reorderExperiences:async()=>true,reorderQualifications:async()=>true,reorderProjects:async()=>true};
            const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'offerings-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            createRoot(document.getElementById('root')).render(<TahoeGlassEngineContext.Provider value={fallback}><div id="fixture-header">nsso · Profile editor</div><main><Editor userId="${account}"/></main></TahoeGlassEngineContext.Provider>);
        ` },
    })
    bundle = result.outputFiles[0].text
})

async function mount(page, { count = 2, payment } = {}) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') throw new Error(`Unexpected external request from isolated offerings fixture: ${url.origin}`)
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (url.pathname === '/fixture-thumb.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#5798ad"/><circle cx="150" cy="150" r="80" fill="#edd7b6"/></svg>' })
        if (url.pathname.startsWith('/api/products/') && url.pathname.endsWith('/payment')) {
            if (payment) return payment(route)
            throw new Error('A payment save was not expected in this fixture.')
        }
        if (url.pathname === '/api/profile/operations') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'not_found', operationId: url.searchParams.get('operationId') }) })
        if (url.pathname === '/api/profile/media') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ accountId: account, url: 'https://nsso.test/fixture-thumb.svg?cropped', path: account + '/product/fixture.jpg' }) })
        if (url.pathname === '/offerings-fixture') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
        throw new Error(`Unexpected fixture request: ${url.pathname}`)
    })
    await page.goto(`https://nsso.test/offerings-fixture?count=${count}`)
    await page.getByRole('button', { name: /^Products & Services/ }).click()
}

const productToggle = page => page.getByRole('button', { name: /^Products & Services/ })
const choose = (page, index) => page.getByRole('button', { name: new RegExp(`Edit Fixture offering ${index}$`) })
const writes = page => page.evaluate(() => window.fixtureWrites)
async function expectTooltipFits(page) {
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toBeVisible()
    const bounds = await tooltip.boundingBox()
    const width = page.viewportSize().width
    expect(bounds.x).toBeGreaterThanOrEqual(15)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 15)
}

test('empty overview and named creation do not publish placeholders', async ({ page }, testInfo) => {
    await mount(page, { count: 0 })
    await expect(page.getByText('Share what you offer', { exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('offerings-empty.png'), fullPage: true })
    await page.getByRole('button', { name: 'Add product or service', exact: true }).click()
    expect(await writes(page)).toEqual([])
    const name = page.getByRole('textbox', { name: /(?:Offering|Product).*name|Name your offering/i })
    await expect(name).toBeFocused()
    await name.fill('   ')
    const create = page.getByRole('button', { name: 'Add to public profile', exact: true })
    await create.click()
    expect(await writes(page)).toEqual([])
    await name.fill('  Personal portfolio review  ')
    await name.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Personal portfolio review')
    expect(await writes(page)).toEqual([expect.objectContaining({ kind: 'create', entity: 'product', values: expect.objectContaining({ name: 'Personal portfolio review' }) })])
    expect(JSON.stringify(await writes(page))).not.toContain('New Product')
})

test('creation cancellation is write-free and a failed named creation retains the entered name', async ({ page }) => {
    await mount(page, { count: 0 })
    const add = page.getByRole('button', { name: 'Add product or service', exact: true })
    await add.click()
    await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('Synthetic coaching session')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(await writes(page)).toEqual([])
    await expect(add).toBeFocused()
    await add.click()
    await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('Synthetic coaching session')
    await page.evaluate(() => { window.fixtureCreateFails = true })
    await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Offering name', exact: true })).toHaveValue('Synthetic coaching session')
    expect(await page.evaluate(() => window.fixtureSnapshot().products)).toEqual([])
})

test('overview items are explicit edit actions and do not expose row deletion', async ({ page }, testInfo) => {
    await mount(page, { count: 1 })
    await expect(page.getByText('Choose an offering to edit.', { exact: true })).toBeVisible()
    await expect(choose(page, 1)).toBeVisible()
    await expect(page.getByRole('button', { name: /Delete|Remove/ })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Products & Services', exact: true })).toHaveCount(1)
    await page.screenshot({ path: testInfo.outputPath('offerings-overview.png'), fullPage: true })
    await choose(page, 1).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Fixture offering 1')
    await expect(page.getByRole('group', { name: 'Offering details', exact: true })).toBeVisible()
    for (const name of ['Image', 'Purchase options', 'Optional sales page']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('offerings-focused-editor.png'), fullPage: true })
})

test('mobile selection replaces a long list, moves focus and returns to its list position', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page, { count: 18 })
    await choose(page, 16).scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => window.scrollY)
    await choose(page, 16).click()
    const back = page.getByRole('button', { name: 'Back to your offerings', exact: true })
    await expect(back).toBeVisible()
    await expect(choose(page, 1)).toBeHidden()
    const name = page.getByRole('textbox', { name: 'Product name', exact: true })
    await expect(name).toHaveValue('Fixture offering 16')
    const focusedEditor = await page.evaluate(() => document.activeElement?.closest('[data-offering-editor]') !== null)
    expect(focusedEditor).toBe(true)
    const bounds = await back.boundingBox()
    expect(bounds.y).toBeGreaterThanOrEqual(80)
    expect(bounds.y).toBeLessThan(300)
    await page.screenshot({ path: testInfo.outputPath('offerings-mobile-focused.png') })
    await back.click()
    await expect(choose(page, 16)).toBeFocused()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(before, 0)
})

test('narrow mobile creation and purchase controls fit without horizontal overflow', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 740 })
    await mount(page, { count: 1 })
    await choose(page, 1).click()
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const control of await page.getByRole('switch').all()) {
        const bounds = await control.boundingBox()
        expect(bounds.height).toBeGreaterThanOrEqual(44)
        expect(bounds.width).toBeGreaterThanOrEqual(44)
    }
    await page.screenshot({ path: testInfo.outputPath('offerings-320px-editor.png'), fullPage: true })
    for (const title of ['Purchase URL', 'PayPal checkout', 'nsso sales page']) {
        await page.getByRole('button', { name: 'About ' + title, exact: true }).first().click()
        await expectTooltipFits(page)
        await page.keyboard.press('Escape')
    }
    await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await page.getByRole('button', { name: 'Coming soon', exact: true }).click()
    await page.getByRole('button', { name: 'About Facebook Pixel', exact: true }).click()
    await expectTooltipFits(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('desktop keeps labelled list and selected editor visible together', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await mount(page, { count: 8 })
    await choose(page, 3).click()
    await expect(choose(page, 1)).toBeVisible()
    const list = await choose(page, 1).boundingBox()
    const field = await page.getByRole('textbox', { name: 'Product name', exact: true }).boundingBox()
    expect(field.x).toBeGreaterThan(list.x + list.width)
    await page.screenshot({ path: testInfo.outputPath('offerings-desktop-list-editor.png'), fullPage: true })
})

test('future features stay collapsed and inactive while compact disclosure and tooltips support the keyboard', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    const future = page.getByRole('button', { name: 'Coming soon', exact: true })
    await expect(future).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByText('Web3 wallet', { exact: true })).toBeHidden()
    await future.focus()
    await page.keyboard.press('Enter')
    await expect(future).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByText('Web3 wallet', { exact: true })).toBeVisible()
    await expect(page.getByText('Facebook Pixel', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'About Web3 wallet', exact: true }).click()
    await expect(page.getByRole('tooltip')).toContainText('This integration is not active.')
    await expectTooltipFits(page)
    expect(await writes(page)).toEqual([])
    await choose(page, 1).click()
    for (const [name, explanation] of [['Purchase URL', 'existing shop, booking page or checkout'], ['PayPal checkout', 'PayPal controls the recipient'], ['nsso sales page', 'does not process payments or deliver products']]) {
        const help = page.getByRole('button', { name: 'About ' + name, exact: true }).first()
        await help.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByRole('tooltip')).toBeVisible()
        await expect(page.getByRole('tooltip')).toContainText(explanation)
        await expectTooltipFits(page)
        await page.keyboard.press('Escape')
        await expect(page.getByRole('tooltip')).toBeHidden()
    }
})

test('ordinary edits expose saving, failure, preserved input and a successful retry', async ({ page }) => {
    await mount(page)
    await choose(page, 1).click()
    await page.evaluate(() => { window.fixturePatchFails = true; window.fixtureHoldPatches = true })
    const description = page.getByRole('textbox', { name: 'Product description', exact: true })
    await description.fill('Synthetic updated description')
    await expect(page.getByRole('status').filter({ hasText: /Saving/ })).toBeVisible()
    await page.evaluate(() => { window.fixtureHoldPatches = false; window.fixtureReleasePatch() })
    await expect(page.getByRole('status').filter({ hasText: /could not be saved|not saved/i })).toBeVisible()
    await expect(description).toHaveValue('Synthetic updated description')
    await page.evaluate(() => { window.fixturePatchFails = false })
    await page.getByRole('button', { name: /Check status and retry|Retry saving/i }).click()
    await expect(page.getByRole('status').filter({ hasText: /changes saved/i })).toBeVisible()
    await expect(description).toHaveValue('Synthetic updated description')
})

test('selected-offering deletion requires confirmation and retains the item when cancelled or failed', async ({ page }) => {
    await mount(page)
    await choose(page, 1).click()
    const deletion = page.getByRole('button', { name: /Delete (?:this )?(?:offering|product)/i })
    await deletion.click()
    const dialog = page.getByRole('dialog', { name: 'Delete Fixture offering 1?', exact: true })
    await expect(dialog.getByRole('button', { name: 'Keep item', exact: true })).toBeFocused()
    await dialog.getByRole('button', { name: 'Keep item', exact: true }).click()
    expect(await writes(page)).toEqual([])
    await deletion.click()
    await page.evaluate(() => { window.fixtureDeleteFails = true })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Removal could not be confirmed')
    await expect(page.locator('input[aria-label="Product name"]')).toHaveValue('Fixture offering 1')
    await page.evaluate(() => { window.fixtureDeleteFails = false })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect((await page.evaluate(() => window.fixtureSnapshot().products)).map(item => item.id)).toEqual(['offering-2'])
})

test('the actual cropper supports product image selection and preserves crop on upload failure', async ({ page }) => {
    await mount(page, { count: 1 })
    await choose(page, 1).click()
    const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width=300; canvas.height=300; const context=canvas.getContext('2d'); context.fillStyle='#e19a72'; context.fillRect(0,0,300,300); return canvas.toDataURL('image/png').split(',')[1] })
    await page.getByLabel('Upload image for Fixture offering 1', { exact: true }).setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
    const cropper = page.getByRole('dialog', { name: 'Crop Image', exact: true })
    await expect(cropper).toHaveAttribute('data-tahoe-readable-overlay', 'true')
    await expect(cropper.getByRole('slider', { name: 'Zoom', exact: true })).toBeVisible()
    await page.route('**/api/profile/media', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic upload unavailable' }) }))
    await cropper.getByRole('button', { name: 'Apply Crop', exact: true }).click()
    await expect(cropper.getByRole('alert')).toContainText('crop is still here')
    await page.unroute('**/api/profile/media')
    await cropper.getByRole('button', { name: 'Apply Crop', exact: true }).click()
    await expect(cropper).toHaveCount(0)
    expect(await writes(page)).toContainEqual(expect.objectContaining({ kind: 'patch', id: 'offering-1', patch: expect.objectContaining({ image_url: 'https://nsso.test/fixture-thumb.svg?cropped' }) }))
})

test('unsaved PayPal code belongs to each offering through switching, returning and collapsing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await choose(page, 1).click()
    const code = page.getByRole('textbox', { name: 'PayPal button code', exact: true })
    await code.fill('<invalid local payment draft>')
    await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await choose(page, 2).click()
    await expect(code).toHaveValue(paypal)
    await code.fill(changedPaypal)
    await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await productToggle(page).click()
    await productToggle(page).click()
    await choose(page, 1).click()
    await expect(code).toHaveValue('<invalid local payment draft>')
    await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await choose(page, 2).click()
    await expect(code).toHaveValue(changedPaypal)
    expect(await writes(page)).toEqual([])
})

test('an in-flight PayPal save finishes for its original offering without replacing another offering draft', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    let release, requested
    const gate = new Promise(resolve => { release = resolve })
    const started = new Promise(resolve => { requested = resolve })
    await mount(page, { payment: async route => { const operation=route.request().postDataJSON(); requested(); await gate; await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'applied', operationId: operation.operationId, revision: 1, changes: [] }) }) } })
    await choose(page, 1).click()
    const code = page.getByRole('textbox', { name: 'PayPal button code', exact: true })
    await code.fill(changedPaypal)
    await page.getByRole('button', { name: 'Save payment button', exact: true }).click()
    await started
    await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await choose(page, 2).click()
    await code.fill('Another offering owns this unsaved draft')
    release()
    await expect(code).toHaveValue('Another offering owns this unsaved draft')
    await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await choose(page, 1).click()
    await expect(code).toHaveValue(changedPaypal)
    await expect(page.getByRole('status').filter({ hasText: /^Payment button saved\.$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save payment button', exact: true })).toBeDisabled()
})
