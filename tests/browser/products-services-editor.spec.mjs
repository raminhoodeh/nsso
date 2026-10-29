import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expectOpaqueLightPanel, minimumTextContrast } from './helpers/light-panel-assertions.mjs'
import { expectCompactSwitch } from './helpers/switch-assertions.mjs'

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
        'src/components/ui/AskDeityButton.tsx',
        'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts',
        'src/components/ui/GlassSwitch.tsx',
        'src/components/ui/light-panel.ts',
        'src/components/products/SalesPageCreator.tsx',
        'src/components/payments/PayPalCodeEditor.tsx',
        'src/components/ui/GlassCard.tsx',
        'src/components/ui/ImageCropperModal.tsx',
        'src/components/ui/PayPalSmartButton.tsx',
        'src/components/ui/PreviewCheckoutButton.tsx',
        'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx',
        'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx',
        'src/components/ui/tahoe-glass/TahoeGlassField.tsx',
    ]
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
    css = compiler.build(candidates) + '\nhtml{background:#4d6b7b}body{background:linear-gradient(150deg,#51788f,#535c74 60%,#97858a);background-attachment:fixed}#root{max-width:1100px;margin:auto;padding:120px 16px 80px}#fixture-header{position:fixed;inset:0 0 auto;height:88px;z-index:200;background:rgba(58,79,95,.96);color:white;padding:24px;font-weight:700;border-bottom:1px solid #ffffff55}button,input,textarea,select{font:inherit}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'offerings-provider-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|link)|@\/lib\/supabase\/client|@\/components\/providers\/ProfileProvider|@\/components\/ui\/Toast|next\/image)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const useRouter=()=>window.fixtureRouter;'
                    : path === 'next/link' ? 'export default ({children,href,onClick,...props})=><a {...props} href={href} onClick={onClick}>{children}</a>;'
                    : path.endsWith('supabase/client') ? 'export const createClient=()=>({auth:{getUser:async()=>({data:{user:null},error:null})}});'
                    : path.endsWith('ProfileProvider') ? 'import {useSyncExternalStore} from "react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,window.fixtureSnapshot,window.fixtureSnapshot);'
                    : path === 'next/image' ? 'export default ({priority,fill,...props})=><img {...props}/>;'
                        : 'export const useToast=()=>({showToast:message=>window.fixtureToasts.push(message)});' }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';
            import Editor from './src/app/dashboard/components/AdvancedModeCard';
            import {TahoeGlassEngineContext} from './src/components/providers/TahoeGlassProvider';
            const listeners=new Set();window.fixtureToasts=[];window.fixtureWrites=[];window.fixturePatchFails=false;window.fixtureDeleteFails=false;window.fixtureCreateFails=false;window.fixturePendingPatch=null;
            const routeListeners=new Set();const notifyRoute=()=>{for(const listener of routeListeners)listener()};window.addEventListener('popstate',notifyRoute);window.fixtureNavigations=[];window.fixturePopups=[];window.open=(...args)=>{window.fixturePopups.push(args);return null};
            window.fixtureRouter={push:(href,options)=>{window.fixtureNavigations.push({kind:'push',href,options});history.pushState(null,'',href);notifyRoute()},replace:(href,options)=>{window.fixtureNavigations.push({kind:'replace',href,options});history.replaceState(null,'',href);notifyRoute()}};
            const count=Number(new URLSearchParams(location.search).get('count')??2);
            let snapshot;const emit=patch=>{snapshot={...snapshot,...patch};for(const listener of listeners)listener()};
            window.fixtureSubscribe=listener=>{listeners.add(listener);return()=>listeners.delete(listener)};window.fixtureSnapshot=()=>snapshot;window.fixtureUpdate=emit;
            const offering=index=>({id:'offering-'+index,user_id:'${account}',name:'Fixture offering '+index,price:'GBP '+(index*10),description:'A clearly described synthetic offering for testing.',image_url:index===1?'/fixture-thumb.svg':null,purchase_link_active:true,purchase_link:'https://seller.example.test/offering-'+index,paypal_active:true,paypal_html:${JSON.stringify(paypal)},sales_page_active:false,sales_page_published:false});
            const settlePatch=async pending=>{if(window.fixtureHoldPatches)await new Promise(resolve=>{window.fixtureReleasePatch=resolve});await new Promise(resolve=>setTimeout(resolve,90));if(window.fixturePatchFails){emit({mutationState:{status:'failed',message:'Changes could not be saved. Your changes are still here.'}});return false}emit({products:snapshot.products.map(item=>item.id===pending.id?{...item,...pending.patch}:item),mutationState:{status:'saved',message:''}});window.fixturePendingPatch=null;return true};
            snapshot={products:Array.from({length:count},(_,index)=>offering(index+1)),experiences:[],qualifications:[],projects:[],loading:false,loadError:null,mutationState:{status:'saved',message:''},getRevision:()=>snapshot.revision??0,
                patchEntity:async(kind,id,patch)=>{window.fixtureWrites.push({kind:'patch',entity:kind,id,patch});window.fixturePendingPatch={id,patch};emit({products:snapshot.products.map(item=>item.id===id?{...item,...patch}:item),mutationState:{status:'saving',message:'Saving changes…'}});return settlePatch(window.fixturePendingPatch)},
                retryPending:async()=>{if(!window.fixturePendingPatch)return;emit({mutationState:{status:'saving',message:'Saving changes…'}});await settlePatch(window.fixturePendingPatch)},
                createEntity:async(kind,values,position='bottom')=>{window.fixtureWrites.push({kind:'create',entity:kind,values,position});emit({mutationState:{status:'saving',message:'Saving changes…'}});if(window.fixtureHoldCreate)await new Promise(resolve=>{window.fixtureReleaseCreate=resolve});await new Promise(resolve=>setTimeout(resolve,60));if(window.fixtureCreateFails){emit({mutationState:{status:'failed',message:'Offering could not be created.'}});return{status:'rejected',operationId:'fixture-create',changes:[]}}const row={...offering(100),...values,id:'created-offering-'+window.fixtureWrites.filter(write=>write.kind==='create').length};emit({products:position==='top'?[row,...snapshot.products]:[...snapshot.products,row],mutationState:{status:'saved',message:''}});return{status:'applied',operationId:'fixture-create',revision:1,changes:[{entity:'products',id:row.id,row}]}},
                removeEntity:async(kind,id)=>{window.fixtureWrites.push({kind:'remove',entity:kind,id});await new Promise(resolve=>setTimeout(resolve,60));if(window.fixtureDeleteFails)return false;emit({products:snapshot.products.filter(item=>item.id!==id)});return true},
                refreshProfile:async()=>true,reorderExperiences:async()=>true,reorderQualifications:async()=>true,reorderProjects:async()=>true};
            const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'offerings-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            function RouteEditor(){const current=React.useSyncExternalStore(listener=>{routeListeners.add(listener);return()=>routeListeners.delete(listener)},()=>location.href);const query=new URL(current).searchParams;return <Editor userId="${account}" requestedOffering={query.get('offering')} requestedCreator={query.get('offeringView')==='creator'}/>}
            createRoot(document.getElementById('root')).render(<TahoeGlassEngineContext.Provider value={fallback}><div id="fixture-header">nsso · Profile editor</div><main><RouteEditor/></main></TahoeGlassEngineContext.Provider>);
        ` },
    })
    bundle = result.outputFiles[0].text
    if (process.env.NSSO_EXPORT_EDITOR_FIXTURE === '1') {
        const directory = root + 'private/editor-product-preview'
        mkdirSync(directory, { recursive: true, mode: 0o700 })
        writeFileSync(directory + '/fixture.js', bundle, { mode: 0o600 })
        writeFileSync(directory + '/fixture.css', css, { mode: 0o600 })
        writeFileSync(directory + '/fixture-thumb.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#5798ad"/><circle cx="150" cy="150" r="80" fill="#edd7b6"/></svg>', { mode: 0o600 })
        writeFileSync(directory + '/index.html', '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>', { mode: 0o600 })
    }
})

async function mount(page, { count = 2, payment, offering, creator = false } = {}) {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') throw new Error(`Unexpected external request from isolated offerings fixture: ${url.origin}`)
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (url.pathname === '/fixture-thumb.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#5798ad"/><circle cx="150" cy="150" r="80" fill="#edd7b6"/></svg>' })
        if (url.pathname === '/guide-paypal.png') return route.fulfill({ contentType: 'image/png', body: readFileSync(root + 'public/guide-paypal.png') })
        if (url.pathname.startsWith('/api/products/') && url.pathname.endsWith('/payment')) {
            if (payment) return payment(route)
            throw new Error('A payment save was not expected in this fixture.')
        }
        if (url.pathname === '/api/profile/operations') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'not_found', operationId: url.searchParams.get('operationId') }) })
        if (url.pathname === '/api/profile/media') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ accountId: account, url: 'https://nsso.test/fixture-thumb.svg?cropped', path: account + '/product/fixture.jpg' }) })
        if (url.pathname === '/offerings-fixture' || url.pathname === '/dashboard') return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
        throw new Error(`Unexpected fixture request: ${url.pathname}`)
    })
    await page.goto(`https://nsso.test/offerings-fixture?count=${count}${offering ? '&offering=' + encodeURIComponent(offering) : ''}${creator ? '&offeringView=creator' : ''}`)
    const toggle = page.getByRole('button', { name: /^Products & Services/ })
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
}

const productToggle = page => page.getByRole('button', { name: /^Products & Services/ })
const choose = (page, index) => page.getByRole('button', { name: new RegExp(`Edit Fixture offering ${index}$`) })
const writes = page => page.evaluate(() => window.fixtureWrites)

async function expectWhiteAction(page, action, { icon = false } = {}) {
    await action.scrollIntoViewIfNeeded()
    await expect(action).toHaveAttribute('data-nsso-control', 'white')
    await expectOpaqueLightPanel(page, action)
    const content = action.locator('[data-light-button-content]')
    const ink = (await content.textContent()).trim() ? content : action.locator('svg').first()
    expect(await minimumTextContrast(ink)).toBeGreaterThanOrEqual(4.5)
    const bounds = await action.boundingBox()
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    expect(bounds.width).toBeGreaterThanOrEqual(44)
    if (icon) {
        expect(bounds.height).toBe(44)
        expect(bounds.width).toBe(44)
        await expect(action).toHaveCSS('opacity', '1')
        await expect(action.locator('svg')).toHaveAttribute('width', '18')
        await expect(action.locator('svg')).toHaveAttribute('height', '18')
    }
}

async function expectNativeUploadFocus(page, input) {
    const label = input.locator('..')
    await label.scrollIntoViewIfNeeded()
    await expectOpaqueLightPanel(page, label)
    await page.keyboard.press('Tab')
    await input.focus()
    await expect(input).toBeFocused()
    await expect(label).toHaveCSS('outline-style', 'solid')
    await expect(label).toHaveCSS('outline-width', '2px')
    expect((await label.boundingBox()).height).toBeGreaterThanOrEqual(44)
}

async function expectTooltipFits(page) {
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toBeVisible()
    const bounds = await tooltip.boundingBox()
    const width = page.viewportSize().width
    expect(bounds.x).toBeGreaterThanOrEqual(15)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 15)
}

test('white offering controls preserve native upload focus, selection and distinct switch states', async ({ page }, testInfo) => {
    await mount(page, { count: 2 })
    const add = page.getByRole('button', { name: 'Add product or service', exact: true })
    await expectWhiteAction(page, add)
    await choose(page, 1).click()
    await expect(page.getByRole('button', { name: 'Edit Fixture offering 1', exact: true, includeHidden: true })).toHaveAttribute('aria-current', 'true')
    await expect(page.getByRole('button', { name: 'Edit Fixture offering 2', exact: true, includeHidden: true })).not.toHaveAttribute('aria-current')
    await expectNativeUploadFocus(page, page.getByLabel('Upload image for Fixture offering 1', { exact: true }))
    await page.getByRole('button', { name: 'Where do I find the code?', exact: true }).press('Enter')
    const close = page.getByRole('button', { name: 'Close PayPal guide', exact: true })
    await expectWhiteAction(page, close, { icon: true })
    await close.press('Enter')
    for (const [name, before, patch] of [
        ['Enable purchase link', true, { purchase_link_active: false }],
        ['Enable PayPal button code', true, { paypal_active: false }],
        ['Enable product sales page', false, { sales_page_active: true, sales_page_published: true }],
    ]) {
        const control = page.getByRole('switch', { name, exact: true })
        await control.scrollIntoViewIfNeeded()
        const initial = await expectCompactSwitch(control, { checked: before })
        await control.press('Space')
        await expect(control).toHaveAttribute('aria-checked', String(!before))
        const changed = await expectCompactSwitch(control, { checked: !before })
        expect(changed.track.background).not.toEqual(initial.track.background)
        expect(changed.thumb.background).toEqual(initial.thumb.background)
        expect(Math.abs(changed.left - initial.left), JSON.stringify({ initial, changed })).toBeCloseTo(24, 3)
        expect((await writes(page)).at(-1)).toMatchObject({ kind: 'patch', entity: 'product', id: 'offering-1', patch })
    }
    expect((await writes(page)).length).toBe(3)
    await page.screenshot({ path: testInfo.outputPath('white-offering-controls.png'), fullPage: true })
})

test('purchase label hints follow edits in the offering and creator without changing checkout settings', async ({ page }, testInfo) => {
    await mount(page, { count: 1 })
    await choose(page, 1).click()
    const link = page.getByRole('textbox', { name: 'Purchase link', exact: true })
    const scenarios = [
        ['https://www.etsy.com/listing/123456/synthetic-guide', 'Buy on Etsy'],
        ['https://synthetic-shop.myshopify.com/products/guide', 'Buy on Shopify'],
        ['https://seller.example.test/guide?provider=etsy.com', 'View purchase page'],
        ['https://etsy.com.attacker.example/guide', 'View purchase page'],
        ['javascript:alert(1)', null],
    ]
    for (const [url, label] of scenarios) {
        await link.fill(url)
        await expect(link).toHaveValue(url)
        if (label) await expect(page.getByText('Button preview: ' + label, { exact: true })).toBeVisible()
        else await expect(page.getByText(/^Button preview:/)).toHaveCount(0)
    }
    const etsy = scenarios[0][0], shopify = scenarios[1][0]
    await link.fill(etsy)
    await expect(page.getByText('Button preview: Buy on Etsy', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Open Sales Page Creator', exact: true }).click()
    const creator = page.locator('[data-sales-page-creator]')
    await expect(creator.getByText('Button preview: Buy on Etsy', { exact: true })).toBeVisible()
    const creatorLink = creator.getByRole('textbox', { name: 'Purchase Link', exact: true })
    await creatorLink.fill(shopify)
    await expect(creator.getByText('Button preview: Buy on Shopify', { exact: true })).toBeVisible()
    await creator.getByRole('button', { name: 'Back to offering', exact: true }).press('Enter')
    await expect(link).toHaveValue(shopify)
    await expect(page.getByText('Button preview: Buy on Shopify', { exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'PayPal button code', exact: true })).toHaveValue(paypal)
    const merchant = page.getByRole('button', { name: 'Buy Now', exact: true })
    await expect(merchant).toHaveCSS('background-color', 'rgb(255, 196, 57)')
    await expect(merchant).toHaveAttribute('type', 'button')
    await expect(page.locator('form[action]')).toHaveCount(0)
    await merchant.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Checkout is disabled during profile preview' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Enable purchase link', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('switch', { name: 'Enable PayPal button code', exact: true })).toHaveAttribute('aria-checked', 'true')
    expect(await writes(page)).toEqual([...scenarios.map(([url]) => url), etsy, shopify].map(url => ({ kind: 'patch', entity: 'product', id: 'offering-1', patch: { purchase_link: url } })))
    expect(await page.evaluate(() => window.fixturePopups)).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('purchase-label-hint-editor.png'), fullPage: true })
})

test('creator actions and visible 44px remove controls retain exact benefit and testimonial edits', async ({ page }, testInfo) => {
    await mount(page, { count: 1 })
    await choose(page, 1).click()
    await page.getByRole('button', { name: 'Open Sales Page Creator', exact: true }).click()
    const creator = page.locator('[data-sales-page-creator]')
    await expectWhiteAction(page, creator.getByRole('button', { name: 'Back to offering', exact: true }))
    await expectWhiteAction(page, creator.getByRole('button', { name: 'Copy AI Prompt', exact: true }).first())
    await expectNativeUploadFocus(page, creator.getByLabel('Upload image for Fixture offering 1', { exact: true }))
    await creator.getByRole('button', { name: 'Add benefit', exact: true }).press('Enter')
    const benefit = creator.getByRole('button', { name: 'Remove benefit 1', exact: true })
    await page.mouse.move(0, 0)
    await expectWhiteAction(page, benefit, { icon: true })
    await benefit.focus()
    await expect(benefit).toHaveCSS('outline-style', 'solid')
    await expect(benefit).toHaveCSS('outline-width', '2px')
    await benefit.locator('..').screenshot({ path: testInfo.outputPath('creator-benefit-white-X.png') })
    await benefit.press('Space')
    await expect(creator.getByRole('textbox', { name: 'Benefit 1', exact: true })).toHaveCount(0)
    await creator.getByRole('button', { name: 'Add testimonial', exact: true }).press('Enter')
    const testimonial = creator.getByRole('button', { name: 'Remove testimonial 1', exact: true })
    await page.mouse.move(0, 0)
    await expectWhiteAction(page, testimonial, { icon: true })
    const field = creator.getByRole('textbox', { name: 'Testimonial 1 text', exact: true })
    const [buttonBox, fieldBox] = await Promise.all([testimonial.boundingBox(), field.boundingBox()])
    expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(fieldBox.y)
    await testimonial.locator('..').screenshot({ path: testInfo.outputPath('creator-testimonial-white-X.png') })
    await testimonial.press('Enter')
    await expect(field).toHaveCount(0)
    expect((await writes(page)).map(write => write.patch)).toEqual([{ benefits: [''] }, { benefits: [] }, { testimonials: [{ name: '', text: '' }] }, { testimonials: [] }])
    await page.screenshot({ path: testInfo.outputPath('white-creator-controls.png'), fullPage: true })
})

test('the PayPal guide uses the opaque white help family without changing links or payment drafts', async ({ page }) => {
    await mount(page, { count: 1 })
    await choose(page, 1).click()
    const code = page.getByRole('textbox', { name: 'PayPal button code', exact: true })
    await code.fill('<kept local synthetic payment draft>')
    const trigger = page.getByRole('button', { name: 'Where do I find the code?', exact: true })
    await trigger.press('Enter')
    const guide = page.locator('#paypal-guide')
    await expect(guide).toBeVisible()
    await expect(guide).toHaveAttribute('data-tahoe-readable-overlay', 'true')
    await expect(guide.locator('[data-tahoe-chromium-optics]')).toHaveCount(0)
    const content = guide.locator(':scope > div').last()
    await content.evaluate(element => element.scrollIntoView({ block: 'center' }))
    await expectOpaqueLightPanel(page, content)
    expect(await minimumTextContrast(guide.getByText('PayPal Dashboard > Copy Code', { exact: true }))).toBeGreaterThanOrEqual(4.5)
    const close = guide.getByRole('button', { name: 'Close PayPal guide', exact: true })
    await close.focus()
    await page.keyboard.press('Tab')
    const tutorial = guide.getByRole('link')
    await expect(tutorial).toBeFocused()
    expect(await tutorial.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
    await expect(tutorial).toHaveAttribute('href', 'https://youtu.be/9KihkWujsaI?si=hwAHbrQDLvOog6U8&t=28')
    await expect(tutorial).toHaveAttribute('rel', 'noopener noreferrer')
    await close.click()
    await expect(guide).toHaveCount(0)
    await expect(code).toHaveValue('<kept local synthetic payment draft>')
    expect(await writes(page)).toEqual([])
})

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

test('a held navigation frame cannot replace a newer focus inside the selected offering', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mount(page)
    // Pause browser frames after mounting. A direct native click lets React
    // mount the requested editor while its heading-focus frame remains queued.
    await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') })
    await page.clock.pauseAt(new Date('2026-10-27T12:00:00.100Z'))
    await choose(page, 2).evaluate(button => button.click())
    const field = page.getByRole('textbox', { name: 'Product name', exact: true })
    await expect(field).toHaveValue('Fixture offering 2')
    await field.evaluate(input => input.focus({ preventScroll: true }))
    await expect(field).toBeFocused()
    const before = await page.evaluate(() => scrollY)
    await page.clock.runFor(64)
    await expect(field).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(before)
    expect(await writes(page)).toEqual([])
})

test('automatic offering recovery cannot focus or scroll behind an active Deity-style modal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await choose(page, 1).click()
    await expect(page.getByRole('heading', { name: 'Fixture offering 1', exact: true })).toBeFocused()
    await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') })
    await page.clock.pauseAt(new Date('2026-10-27T12:00:00.100Z'))
    await page.evaluate(() => window.fixtureUpdate({ products: window.fixtureSnapshot().products.filter(product => product.id !== 'offering-1') }))
    await expect(choose(page, 1)).toHaveCount(0)
    await page.evaluate(() => {
        const modal = document.createElement('section')
        modal.setAttribute('role', 'dialog')
        modal.setAttribute('aria-modal', 'true')
        modal.setAttribute('aria-label', 'Deity fixture')
        Object.assign(modal.style, { position: 'fixed', inset: '0', zIndex: '10000', background: '#11161d' })
        const close = document.createElement('button')
        close.type = 'button'
        close.textContent = 'Close Deity fixture'
        modal.append(close)
        document.body.append(modal)
        close.focus({ preventScroll: true })
    })
    const close = page.getByRole('button', { name: 'Close Deity fixture', exact: true })
    await expect(close).toBeFocused()
    const before = await page.evaluate(() => scrollY)
    await page.clock.runFor(64)
    await expect(close).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(before)
})

test('automatic offering recovery preserves focus in an unrelated profile field', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page)
    await choose(page, 1).click()
    await expect(page.getByRole('heading', { name: 'Fixture offering 1', exact: true })).toBeFocused()
    await page.clock.install({ time: new Date('2026-10-27T12:00:00Z') })
    await page.clock.pauseAt(new Date('2026-10-27T12:00:00.100Z'))
    await page.evaluate(() => {
        const field = document.createElement('input')
        field.setAttribute('aria-label', 'Unrelated profile full name')
        field.value = 'Fixture owner'
        Object.assign(field.style, { position: 'fixed', top: '0', right: '0', zIndex: '10000' })
        document.body.append(field)
        window.fixtureUpdate({ products: window.fixtureSnapshot().products.filter(product => product.id !== 'offering-1') })
        field.focus({ preventScroll: true })
    })
    await expect(choose(page, 1)).toHaveCount(0)
    const field = page.getByRole('textbox', { name: 'Unrelated profile full name', exact: true })
    await expect(field).toBeFocused()
    const before = await page.evaluate(() => scrollY)
    await page.clock.runFor(64)
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('Fixture owner')
    expect(await page.evaluate(() => scrollY)).toBe(before)
})

for (const destination of ['another offering', 'collapsed section']) {
    test(`a delayed creation preserves navigation and focus in ${destination}`, async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await mount(page)
        await page.getByRole('button', { name: 'Add product or service', exact: true }).click()
        await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('Delayed synthetic offering')
        await page.evaluate(() => { window.fixtureHoldCreate = true })
        await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
        await expect.poll(() => page.evaluate(() => window.fixtureWrites.filter(write => write.kind === 'create').length)).toBe(1)
        let target
        if (destination === 'another offering') {
            await choose(page, 2).click()
            target = page.getByRole('textbox', { name: 'Product name', exact: true })
            await target.focus()
            await expect(target).toHaveValue('Fixture offering 2')
        } else {
            target = productToggle(page)
            await target.click()
            await target.focus()
            await expect(target).toHaveAttribute('aria-expanded', 'false')
        }
        const before = await page.evaluate(() => scrollY)
        await page.evaluate(() => window.fixtureReleaseCreate())
        await expect.poll(() => page.evaluate(() => window.fixtureSnapshot().products.some(product => product.name === 'Delayed synthetic offering'))).toBe(true)
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await expect(target).toBeFocused()
        expect(await page.evaluate(() => scrollY)).toBe(before)
        if (destination === 'another offering') await expect(target).toHaveValue('Fixture offering 2')
        else {
            await expect(target).toHaveAttribute('aria-expanded', 'false')
            await target.click()
            await expect(page.getByRole('button', { name: 'Edit Delayed synthetic offering', exact: true })).toBeVisible()
            await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveCount(0)
        }
        expect((await writes(page)).filter(write => write.kind === 'create')).toHaveLength(1)
    })
}

test('a reconciled creation receipt does not replace another offering the user chose while retry was unresolved', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mount(page)
    await page.getByRole('button', { name: 'Add product or service', exact: true }).click()
    await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('Reconciled synthetic offering')
    await page.evaluate(() => { window.fixtureCreateFails = true })
    await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await choose(page, 2).click()
    const field = page.getByRole('textbox', { name: 'Product name', exact: true })
    await field.focus()
    const before = await page.evaluate(() => scrollY)
    await page.evaluate(() => {
        const row = { ...window.fixtureSnapshot().products[0], id: 'receipt-created-offering', name: 'Reconciled synthetic offering' }
        window.fixtureUpdate({ products: [row, ...window.fixtureSnapshot().products], productCreationResults: { 'fixture-create': { status: 'applied', changes: [{ entity: 'products', id: row.id, row }] } } })
    })
    await expect(choose(page, 2)).toHaveAttribute('aria-current', 'true')
    await expect(field).toHaveValue('Fixture offering 2')
    await expect(field).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(before)
})

test('top and bottom offering controls retain their intended position through named creation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await mount(page, { count: 18 })
    const original = await page.evaluate(() => window.fixtureSnapshot().products.map(item => item.id))
    await page.getByRole('button', { name: 'Add product or service', exact: true }).click()
    expect(await writes(page)).toEqual([])
    await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('Top synthetic offering')
    await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Top synthetic offering')
    await expect(page.getByRole('heading', { name: 'Top synthetic offering', exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Edit Top synthetic offering', exact: true })).toBeFocused()
    const bottom = page.getByRole('button', { name: 'Add product or service at bottom', exact: true })
    await bottom.scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => window.scrollY)
    await bottom.click()
    await expect(page.getByRole('textbox', { name: 'Offering name', exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(bottom).toBeFocused()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeCloseTo(before, 0)
    expect(await writes(page)).toHaveLength(1)
    await bottom.click()
    await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('Bottom synthetic offering')
    await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Bottom synthetic offering')
    await expect(page.getByRole('heading', { name: 'Bottom synthetic offering', exact: true })).toBeFocused()
    const rows = await page.evaluate(() => window.fixtureSnapshot().products.map(item => item.id))
    expect(rows).toEqual(['created-offering-1', ...original, 'created-offering-2'])
    expect((await writes(page)).filter(write => write.kind === 'create').map(write => write.position)).toEqual(['top', 'bottom'])
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
        await expectCompactSwitch(control)
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
    // Keyboard focus scrolls each help trigger into view. Keep the pointer on
    // the fixed header so that scroll cannot introduce an unrelated hover.
    await page.mouse.move(0, 0)
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
    await expect(page.locator('[data-offering-save-status]')).toHaveCount(0)
    await expect(description).toHaveValue('Synthetic updated description')
})

test('query reconciliation preserves deliberately created selection and reopens that exact editor after reload', async ({ page }) => {
    await mount(page)
    await choose(page, 1).click()
    await expect(page).toHaveURL(/offering=offering-1/)
    if (await page.getByRole('button', { name: 'Back to your offerings', exact: true }).isVisible()) await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await page.getByRole('button', { name: 'Add product or service', exact: true }).click()
    await expect(page).not.toHaveURL(/offering=/)
    await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('Deliberately selected new offering')
    await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Deliberately selected new offering')
    await expect(page).toHaveURL(/offering=created-offering-1/)
    await page.evaluate(() => window.fixtureUpdate({ products: [...window.fixtureSnapshot().products, { ...window.fixtureSnapshot().products[0], id: 'independent-new-row', name: 'Independent offering receipt' }] }))
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Deliberately selected new offering')
    if (await page.getByRole('button', { name: 'Back to your offerings', exact: true }).isVisible()) await page.getByRole('button', { name: 'Back to your offerings', exact: true }).click()
    await choose(page, 2).click()
    await page.reload()
    await expect(page.getByRole('button', { name: /^Products & Services/ })).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('Fixture offering 2')
})

test('same-tab creator and browser history retain the offering payment draft and restore editor/list position', async ({ page }) => {
    await mount(page, { count: 18 })
    await choose(page, 16).scrollIntoViewIfNeeded()
    await choose(page, 16).click()
    const code = page.getByRole('textbox', { name: 'PayPal button code', exact: true })
    await code.fill('An unsaved, offering-owned PayPal draft')
    const originalEditor = await code.elementHandle()
    const open = page.getByRole('button', { name: 'Open Sales Page Creator', exact: true })
    await open.scrollIntoViewIfNeeded()
    const before = await page.evaluate(() => ({ windowY: scrollY, listY: document.querySelector('[data-offerings-list]').scrollTop }))
    await open.click()
    await expect(page.getByRole('heading', { name: 'Sales Page Creator', exact: true })).toBeVisible()
    await expect(page).toHaveURL(/offering=offering-16&offeringView=creator/)
    expect(await page.evaluate(() => window.fixturePopups)).toEqual([])
    await expect(page.getByRole('textbox', { name: 'PayPal button code', exact: true })).toHaveCount(0)
    const previews = page.getByRole('button', { name: 'Preview page', exact: true })
    await expect(previews).toHaveCount(2)
    for (const preview of await previews.all()) await expect(preview).toBeDisabled()
    await page.getByRole('link', { name: 'Back', exact: true }).click()
    await expect(page).toHaveURL(/offering=offering-16$/)
    await expect(code).toHaveValue('An unsaved, offering-owned PayPal draft')
    expect(await code.evaluate((element, original) => element === original, originalEditor)).toBe(true)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(before.windowY, 0)
    expect(await page.locator('[data-offerings-list]').evaluate(element => element.scrollTop)).toBe(before.listY)
    await open.click()
    await page.goBack()
    await expect(code).toBeVisible()
    await expect(code).toHaveValue('An unsaved, offering-owned PayPal draft')
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Sales Page Creator', exact: true })).toBeVisible()
    for (const preview of await page.getByRole('button', { name: 'Preview page', exact: true }).all()) await expect(preview).toBeDisabled()
    await productToggle(page).click()
    await expect(productToggle(page)).toHaveAttribute('aria-expanded', 'false')
    await page.goBack()
    await expect(productToggle(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(code).toBeVisible()
    await page.goForward()
    await expect(page.getByRole('heading', { name: 'Sales Page Creator', exact: true })).toBeVisible()
    expect(await writes(page)).toEqual([])
})

for (const newerTarget of ['offering field', 'modal']) test(`deferred creator return respects a newer ${newerTarget} focus without scrolling`, async ({ page }) => {
    await mount(page)
    await choose(page, 1).click()
    await page.getByRole('button', { name: 'Open Sales Page Creator', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Sales Page Creator', exact: true })).toBeVisible()
    await page.clock.install({ time: new Date('2026-10-28T12:00:00Z') })
    await page.clock.pauseAt(new Date('2026-10-28T12:00:00.100Z'))
    await page.getByRole('link', { name: 'Back', exact: true }).evaluate(link => link.click())
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toBeVisible()
    let target = page.getByRole('textbox', { name: 'Product name', exact: true })
    if (newerTarget === 'modal') {
        await page.evaluate(() => {
            const modal = document.createElement('section')
            modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Newer Deity fixture')
            Object.assign(modal.style, { position: 'fixed', inset: '0', zIndex: '10000', background: '#11161d' })
            const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close newer Deity fixture'; modal.append(close); document.body.append(modal); close.focus({ preventScroll: true })
        })
        target = page.getByRole('button', { name: 'Close newer Deity fixture', exact: true })
    } else await target.evaluate(input => input.focus({ preventScroll: true }))
    await expect(target).toBeFocused()
    const before = await page.evaluate(() => scrollY)
    await page.clock.runFor(64)
    await expect(target).toBeFocused()
    expect(await page.evaluate(() => scrollY)).toBe(before)
    expect(await writes(page)).toEqual([])
})

test('query switching creators clears the previous product crop state without writing either product', async ({ page }) => {
    await mount(page, { offering: 'offering-1', creator: true })
    await expect(page.getByRole('heading', { name: 'Sales Page Creator', exact: true })).toBeVisible()
    const image = await page.screenshot({ type: 'png' })
    await page.locator('[data-sales-page-creator] input[type="file"]').setInputFiles({ name: 'synthetic-product.png', mimeType: 'image/png', buffer: image })
    await expect(page.getByRole('dialog', { name: 'Crop Image', exact: true })).toBeVisible()
    await page.evaluate(() => window.fixtureRouter.push('/dashboard?view=profile&offering=offering-2&offeringView=creator', { scroll: false }))
    await expect(page.getByText('Editing: Fixture offering 2', { exact: true })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Crop Image', exact: true })).toHaveCount(0)
    expect(await writes(page)).toEqual([])
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

test('the actual cropper supports product image selection and preserves crop on upload failure', async ({ page }, testInfo) => {
    let stage = 'open image cropper'
    const mediaResponses = [], pageErrors = []
    const isMediaResponse = response => {
        const url = new URL(response.url())
        return response.request().method() === 'POST' && url.origin === 'https://nsso.test' && url.pathname === '/api/profile/media'
    }
    page.on('response', response => { if (isMediaResponse(response)) mediaResponses.push(response.status()) })
    page.on('pageerror', error => pageErrors.push(error.message))
    const cropper = page.getByRole('dialog', { name: 'Crop Image', exact: true })
    try {
        await mount(page, { count: 1 })
        await choose(page, 1).click()
        const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width=300; canvas.height=300; const context=canvas.getContext('2d'); context.fillStyle='#e19a72'; context.fillRect(0,0,300,300); return canvas.toDataURL('image/png').split(',')[1] })
        await page.getByLabel('Upload image for Fixture offering 1', { exact: true }).setInputFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
        await expect(cropper).toHaveAttribute('data-tahoe-readable-overlay', 'true')
        await expect(cropper.getByRole('slider', { name: 'Zoom', exact: true })).toBeVisible()
        await page.route('**/api/profile/media', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic upload unavailable' }) }))
        stage = 'receive rejected upload'
        const [rejectedUpload] = await Promise.all([
            page.waitForResponse(isMediaResponse, { timeout: 5000 }),
            cropper.getByRole('button', { name: 'Apply Crop', exact: true }).click(),
        ])
        expect(rejectedUpload.status()).toBe(503)
        stage = 'retain crop after rejected upload'
        await expect(cropper.getByRole('alert')).toContainText('crop is still here')
        await page.unroute('**/api/profile/media')
        stage = 'receive successful retry upload'
        const [retryUpload] = await Promise.all([
            page.waitForResponse(isMediaResponse, { timeout: 5000 }),
            cropper.getByRole('button', { name: 'Apply Crop', exact: true }).click(),
        ])
        expect(retryUpload.status()).toBe(200)
        stage = 'submit retried image patch'
        await expect.poll(() => writes(page)).toContainEqual(expect.objectContaining({ kind: 'patch', id: 'offering-1', patch: expect.objectContaining({ image_url: 'https://nsso.test/fixture-thumb.svg?cropped' }) }))
        stage = 'close cropper after saved image'
        await expect(cropper).toHaveCount(0)
    } catch (error) {
        const diagnostics = {
            stage, mediaResponses, pageErrors,
            fixture: await page.evaluate(() => ({ toasts: window.fixtureToasts, writes: window.fixtureWrites, mutation: window.fixtureSnapshot?.().mutationState })).catch(error => ({ captureError: error.message })),
            dialogCount: await cropper.count().catch(() => null),
            dialogAlerts: await cropper.getByRole('alert').allTextContents().catch(() => []),
        }
        console.error('Crop retry diagnostics:', JSON.stringify(diagnostics))
        await testInfo.attach('crop-retry-diagnostics', { body: JSON.stringify(diagnostics, null, 2), contentType: 'application/json' })
        throw error
    }
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
