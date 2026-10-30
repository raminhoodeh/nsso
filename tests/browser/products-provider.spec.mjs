import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { compile } from '@tailwindcss/node'
import { expectCompactSwitch } from './helpers/switch-assertions.mjs'

// Real editor + real ProfileProvider + real mutation client. Only the remote
// database/HTTP boundary is synthetic; no customer account is used by this suite.
const root = fileURLToPath(new URL('../../', import.meta.url))
const actor = '11111111-1111-4111-8111-111111111111'
const first = '22222222-2222-4222-8222-222222222222'
const second = '33333333-3333-4333-8333-333333333333'
let bundle, css

test.beforeAll(async () => {
    const files = ['src/components/ui/GlassSwitch.tsx', 'src/components/ui/light-panel.ts', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/AskDeityButton.tsx', 'src/components/products/SalesPageCreator.tsx', 'src/app/dashboard/components/AdvancedModeCard.tsx', 'src/app/dashboard/components/ProductsServicesEditor.tsx', 'src/app/dashboard/components/ConfirmDeleteDialog.tsx', 'src/app/dashboard/components/SectionHelp.tsx', 'src/components/profile/ProfileSaveStatus.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx', 'src/components/ui/tahoe-glass/TahoeGlassField.tsx', 'src/components/payments/PayPalCodeEditor.tsx']
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates) + '\nbody{background:#344956;color:white;font-family:Arial}#root{margin:auto;max-width:1100px;padding:24px}button,input,textarea{font:inherit}[data-testid="provider-products"]{display:none}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'product-provider-boundaries', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|link)|\.\/UserProvider|\.\/DashboardGlassCard|@\/(?:lib\/supabase\/client|components\/providers\/UserProvider|components\/ui\/Toast|components\/ui\/ImageCropperModal|app\/dashboard\/components\/DashboardGlassCard))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const useRouter=()=>({push(){},replace(){}});'
                    : path === 'next/link' ? 'export default ({children,href,onClick,...props})=><a {...props} href={href} onClick={onClick}>{children}</a>;'
                    : path.endsWith('UserProvider') ? `const user={id:'${actor}',username:'qa-fixture'};export const useUser=()=>({user,loading:false});`
                    : path.endsWith('supabase/client') ? 'export const createClient=()=>window.fixtureDatabase;'
                        : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:()=>{}});'
                            : /PayPalCodeEditor|ImageCropperModal/.test(path) ? 'export default ()=>null;'
                                : 'export default ({children})=><div>{children}</div>;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';
            import {ProfileProvider,useProfile} from './src/components/providers/ProfileProvider';
            import Advanced from './src/app/dashboard/components/AdvancedModeCard';
            import {TahoeGlassEngineContext} from './src/components/providers/TahoeGlassProvider';
            import SaveStatus from './src/components/profile/ProfileSaveStatus';
            window.fixtureState={revision:0,profile:{user_id:'${actor}',full_name:'Synthetic creator',bio:'',headline:''},links:[],contacts:[],experiences:[],qualifications:[],projects:[],products:window.fixtureSeed};
            window.fixtureJournal={};window.fixturePosts=[];window.fixtureMode='applied';
            window.fixtureDatabase={rpc:name=>({abortSignal:async()=>({data:name==='get_profile_snapshot'?structuredClone(window.fixtureState):{},error:window.fixtureReadFails?{message:'Synthetic read failure'}:null})})};
            window.fixtureApply=body=>{
                window.fixturePosts.push(structuredClone(body));
                const state=window.fixtureState;
                if(window.fixtureJournal[body.operationId])return window.fixtureJournal[body.operationId];
                if(window.fixtureMode==='rejected')return {status:'rejected',code:'TARGET_NOT_FOUND',operationId:body.operationId,revision:state.revision,changes:[]};
                if(body.expectedRevision!==state.revision)return {status:'conflict',operationId:body.operationId,revision:state.revision,changes:[]};
                const changes=[];
                for(const change of body.changes){
                    if(change.kind==='product.add'){
                        const row={id:crypto.randomUUID(),user_id:'${actor}',created_at:new Date().toISOString(),name:'',price:null,description:null,image_url:null,purchase_link:null,purchase_link_active:false,paypal_html:null,paypal_active:false,sales_page_active:false,sales_page_published:false,...change.values};
                        const ranks=state.products.map(row=>row.display_order??0);
                        row.display_order=change.position==='top'?Math.min(1,...ranks)-1:Math.max(-1,...ranks)+1;
                        state.products.push(row);state.products.sort((a,b)=>(a.display_order??0)-(b.display_order??0)||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));changes.push({entity:'products',id:row.id,row});
                    }else if(change.kind==='product.patch'){
                        const row=state.products.find(row=>row.id===change.id);if(!row)throw new Error('Fixture target missing');Object.assign(row,change.patch);changes.push({entity:'products',id:row.id,row:change.patch});
                    }else if(change.kind==='product.remove'){
                        state.products=state.products.filter(row=>row.id!==change.id);changes.push({entity:'products',id:change.id,row:null});
                    }else throw new Error('Unexpected fixture mutation');
                }
                return window.fixtureJournal[body.operationId]={status:'applied',operationId:body.operationId,revision:++state.revision,changes};
            };
            function App(){const p=useProfile();return <><button onClick={()=>void p.refreshProfile()}>Refresh fixture snapshot</button><button onClick={()=>void p.createEntity('product',{name:'QA unresolved'},'top')}>Probe top add</button><button onClick={()=>void p.createEntity('product',{name:'QA unresolved'},'bottom')}>Probe bottom add</button><output data-testid="provider-products">{JSON.stringify(p.products)}</output><div data-testid="global-save-status"><SaveStatus/></div><Advanced userId="${actor}"/></>};
            const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'provider-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            createRoot(document.getElementById('root')).render(<React.StrictMode><TahoeGlassEngineContext.Provider value={fallback}><ProfileProvider><App/></ProfileProvider></TahoeGlassEngineContext.Provider></React.StrictMode>);
        ` } })
    bundle = result.outputFiles[0].text
})

const product = (id, name) => ({ id, user_id: actor, name, price: 'USD 20', description: 'Synthetic offering', image_url: null, purchase_link: null, purchase_link_active: false, paypal_html: null, paypal_active: false, sales_page_active: false, sales_page_published: false, created_at: '2026-10-27T00:00:00Z' })

async function mount(page, products = [product(first, 'QA consultation'), product(second, 'QA guide')]) {
    await page.route('https://nsso.test/**', async route => {
        const request = route.request(), url = new URL(request.url())
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: `<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>window.fixtureSeed=${JSON.stringify(products)}</script><script src="/fixture.js"></script>` })
        if (url.pathname === '/api/profile/operations') {
            expect(request.headers()['x-nsso-account']).toBe(actor)
            if (request.method() === 'GET') {
                const operationId = url.searchParams.get('operationId')
                const receipt = await page.evaluate(operationId => window.fixtureJournal[operationId] || { status: 'not_found', operationId, revision: window.fixtureState.revision, changes: [] }, operationId)
                return route.fulfill({ json: receipt })
            }
            if (await page.evaluate(() => window.fixtureMode === 'unknown')) {
                await page.evaluate(body => window.fixturePosts.push(body), request.postDataJSON())
                return route.abort('failed')
            }
            const result = await page.evaluate(body => window.fixtureApply(body), request.postDataJSON())
            return route.fulfill({ status: result.status === 'rejected' ? 422 : result.status === 'conflict' ? 409 : 200, json: result })
        }
        if (url.pathname.startsWith('/api/products/') && url.pathname.endsWith('/payment')) {
            expect(request.headers()['x-nsso-account']).toBe(actor)
            const body = request.postDataJSON()
            return route.fulfill({ status: 409, json: { status: 'conflict', operationId: body.operationId, revision: 2, changes: [] } })
        }
        throw new Error(`Unexpected synthetic request: ${url.pathname}`)
    })
    await page.goto('https://nsso.test/fixture')
    await expect(page.getByTestId('provider-products')).toContainText(products[0]?.name || '[]')
    await page.getByRole('button', { name: 'Products & Services', exact: true }).click()
}

async function select(page, name) {
    await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue(name)
}

test('real provider coalesces offering autosave, preserves rejected input across navigation and explicitly retries', async ({ page }) => {
    await mount(page)
    await select(page, 'QA consultation')
    await page.evaluate(() => { window.fixtureMode = 'rejected' })
    const description = page.getByRole('textbox', { name: 'Product description', exact: true })
    await description.fill('First local edit')
    await description.fill('Final local edit')
    await expect(page.getByRole('status').filter({ hasText: /could not be accepted|not saved/ }).first()).toBeVisible()
    expect(await page.evaluate(() => window.fixturePosts)).toHaveLength(1)
    expect(await page.evaluate(() => window.fixtureState.products[0].description)).toBe('Synthetic offering')
    const back = page.getByRole('button', { name: 'Back to your offerings', exact: true })
    if (await back.isVisible()) await back.click()
    else await page.getByRole('button', { name: 'Edit QA guide', exact: true }).click()
    await select(page, 'QA consultation')
    await expect(description).toHaveValue('Final local edit')
    await page.evaluate(() => { window.fixtureMode = 'applied' })
    await page.getByRole('button', { name: 'Check status and retry', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureState.products[0].description)).toBe('Final local edit')
    await page.getByRole('button', { name: 'Refresh fixture snapshot' }).click()
    await expect(description).toHaveValue('Final local edit')
    const posts = await page.evaluate(() => window.fixturePosts)
    expect(posts).toHaveLength(2)
    expect(posts[0].changes).toEqual([{ kind: 'product.patch', id: first, patch: { description: 'Final local edit' } }])
})

test('real provider creates only a deliberately named public offering and retains it after refresh', async ({ page }) => {
    await mount(page, [])
    await page.getByRole('button', { name: 'Add product or service', exact: true }).click()
    expect(await page.evaluate(() => window.fixturePosts)).toEqual([])
    await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('QA named workshop')
    await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('QA named workshop')
    const posts = await page.evaluate(() => window.fixturePosts)
    expect(posts).toHaveLength(1)
    expect(posts[0].changes[0].kind).toBe('product.add')
    expect(posts[0].changes[0].values.name).toBe('QA named workshop')
    expect(JSON.stringify(posts)).not.toContain('New Product')
    await page.getByRole('button', { name: 'Refresh fixture snapshot' }).click()
    await expect(page.getByTestId('provider-products')).toContainText('QA named workshop')
})

test('real provider preserves explicit top and bottom placement after snapshot refresh', async ({ page }) => {
    await mount(page)
    for (const [position, name] of [['top', 'QA first offering'], ['bottom', 'QA last offering']]) {
        await page.getByRole('button', { name: position === 'top' ? 'Add product or service' : 'Add product or service at bottom', exact: true }).click()
        await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill(name)
        await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
        await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue(name)
        const back=page.getByRole('button', {name:'Back to your offerings',exact:true})
        if(await back.isVisible())await back.click()
    }
    const names=()=>page.evaluate(()=>window.fixtureState.products.map(row=>row.name))
    expect(await names()).toEqual(['QA first offering','QA consultation','QA guide','QA last offering'])
    await page.getByRole('button',{name:'Refresh fixture snapshot'}).click()
    const visible=page.locator('button[aria-label^="Edit QA "]')
    expect((await visible.allTextContents()).map(text=>text.trim())).toEqual(['QA first offering','QA consultation','QA guide','QA last offering'])
    const posts=await page.evaluate(()=>window.fixturePosts)
    expect(posts.map(body=>body.changes[0].position)).toEqual(['top','bottom'])
})

test('opposite-end clicks cannot duplicate an uncertain add or change its original placement', async ({ page }) => {
    await mount(page)
    await page.evaluate(()=>{window.fixtureMode='unknown'})
    await page.getByRole('button',{name:'Probe top add',exact:true}).click()
    await expect(page.getByTestId('global-save-status')).toContainText('not confirmed')
    await page.getByRole('button',{name:'Probe bottom add',exact:true}).click()
    await expect.poll(()=>page.evaluate(()=>window.fixturePosts.length)).toBe(2)
    await page.evaluate(()=>{window.fixtureMode='applied'})
    await page.getByTestId('global-save-status').getByRole('button',{name:'Check status and retry my draft',exact:true}).click()
    await expect.poll(()=>page.evaluate(()=>window.fixtureState.products.filter(row=>row.name==='QA unresolved').length)).toBe(1)
    const posts=await page.evaluate(()=>window.fixturePosts)
    expect(new Set(posts.map(body=>body.operationId)).size).toBe(1)
    expect(posts.every(body=>body.changes[0].position==='top')).toBe(true)
    expect(await page.evaluate(()=>window.fixtureState.products[0].name)).toBe('QA unresolved')
})

test('real provider sends no delete on cancellation, retains failed deletion, then confirms removal after refresh', async ({ page }) => {
    await mount(page)
    await select(page, 'QA consultation')
    await page.getByRole('button', { name: 'Delete offering', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Keep item', exact: true }).click()
    expect(await page.evaluate(() => window.fixturePosts)).toEqual([])
    await page.evaluate(() => { window.fixtureMode = 'rejected' })
    await page.getByRole('button', { name: 'Delete offering', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Removal could not be confirmed')
    expect(await page.evaluate(() => window.fixtureState.products.length)).toBe(2)
    await page.evaluate(() => { window.fixtureMode = 'applied' })
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await page.getByRole('button', { name: 'Refresh fixture snapshot' }).click()
    await expect(page.getByTestId('provider-products')).not.toContainText('QA consultation')
    expect(await page.evaluate(() => window.fixtureState.products.length)).toBe(1)
})

test('a successful edit to another offering cannot hide a retained failed offering draft', async ({ page }) => {
    await mount(page)
    await select(page, 'QA consultation')
    await page.evaluate(() => { window.fixtureMode = 'rejected' })
    await page.getByRole('textbox', { name: 'Product description', exact: true }).fill('Unsaved first offering edit')
    await expect(page.locator('[data-offering-save-status]')).toContainText('could not be accepted')
    const back = page.getByRole('button', { name: 'Back to your offerings', exact: true })
    if (await back.isVisible()) await back.click()
    await select(page, 'QA guide')
    await page.evaluate(() => { window.fixtureMode = 'applied' })
    await page.getByRole('textbox', { name: 'Price (include the currency)', exact: true }).fill('USD 30')
    await expect.poll(() => page.evaluate(() => window.fixtureState.products.find(row => row.id === '33333333-3333-4333-8333-333333333333').price)).toBe('USD 30')
    await expect(page.locator('[data-offering-save-status]')).toContainText('could not be accepted')
    await expect(page.locator('[data-offering-save-status]').getByRole('button', { name: 'Check status and retry', exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.fixtureState.products[0].description)).toBe('Synthetic offering')
    if (await back.isVisible()) await back.click()
    await select(page, 'QA consultation')
    await page.getByRole('button', { name: 'Open Sales Page Creator', exact: true }).click()
    await expect(page.getByText('Not saved', { exact: true })).toBeVisible()
    for (const preview of await page.getByRole('button', { name: 'Preview page', exact: true }).all()) await expect(preview).toBeDisabled()
    await page.getByRole('link', { name: 'Back', exact: true }).click()
    await page.locator('[data-offering-save-status]').getByRole('button', { name: 'Check status and retry', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureState.products[0].description)).toBe('Unsaved first offering edit')
    await expect(page.locator('[data-offering-save-status]')).toHaveCount(0)
})

test('an unrelated same-name row cannot resolve a rejected creation; global retry selects its exact receipt ID', async ({ page }) => {
    await mount(page, [])
    await page.getByRole('button', { name: 'Add product or service', exact: true }).click()
    await page.getByRole('textbox', { name: 'Offering name', exact: true }).fill('QA same-name session')
    await page.evaluate(() => { window.fixtureMode = 'rejected' })
    await page.getByRole('button', { name: 'Add to public profile', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Offering name', exact: true })).toBeDisabled()
    await page.evaluate(row => { window.fixtureState.products.push(row) }, product(second, 'QA same-name session'))
    await page.getByRole('button', { name: 'Refresh fixture snapshot' }).click()
    await expect(page.getByRole('textbox', { name: 'Offering name', exact: true })).toBeDisabled()
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toBeHidden()
    await page.evaluate(() => { window.fixtureMode = 'applied' })
    await page.getByTestId('global-save-status').getByRole('button', { name: 'Check status and retry my draft', exact: true }).click()
    await expect(page.getByRole('textbox', { name: 'Product name', exact: true })).toHaveValue('QA same-name session')
    const createdId = await page.evaluate(() => Object.values(window.fixtureJournal).find(result => result.changes.some(change => change.entity === 'products'))?.changes[0].id)
    expect(createdId).not.toBe(second)
    const rows = await page.evaluate(() => window.fixtureState.products.map(row => row.id))
    expect(rows).toContain(createdId)
    expect(rows).toContain(second)
    // Identical visible names are insufficient proof of selection. The next
    // actual provider patch must target the ID from the verified receipt.
    await page.getByRole('textbox', { name: 'Price (include the currency)', exact: true }).fill('USD 42')
    await expect.poll(() => page.evaluate(() => window.fixturePosts.at(-1)?.changes[0]?.id)).toBe(createdId)
})

test('actual provider read failure keeps PayPal conflict locked until a verified refresh succeeds', async ({ page }) => {
    const html = '<form action="https://www.paypal.com/ncp/payment/AB12CD34EF56G" method="post"><input type="submit" value="Buy Now"></form>'
    await mount(page, [{ ...product(first, 'QA PayPal offering'), paypal_active: true, paypal_html: html }])
    await select(page, 'QA PayPal offering')
    const code = page.getByRole('textbox', { name: 'PayPal button code', exact: true })
    await code.fill(html.replace('AB12CD34EF56G', 'XY12CD34EF56G'))
    await page.getByRole('button', { name: 'Save payment button', exact: true }).click()
    await page.evaluate(() => { window.fixtureReadFails = true })
    await page.getByRole('button', { name: 'Refresh for review', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Could not load the latest settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh for review', exact: true })).toBeEnabled()
    await page.evaluate(() => { window.fixtureReadFails = false })
    await page.getByRole('button', { name: 'Refresh for review', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Latest settings loaded' })).toBeVisible()
})

test('sales-page publication control reflects explicit visibility rather than a stale active flag', async ({ page }) => {
    await mount(page, [{ ...product(first, 'QA public sales page'), sales_page_active: false, sales_page_published: true }])
    await select(page, 'QA public sales page')
    const toggle = page.getByRole('switch', { name: 'Enable product sales page', exact: true })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expectCompactSwitch(toggle, { checked: true })
    await expect(page.getByText('Sales page is public', { exact: true })).toBeVisible()
    await toggle.click()
    await expect.poll(() => page.evaluate(() => window.fixtureState.products[0].sales_page_published)).toBe(false)
    expect(await page.evaluate(() => window.fixtureState.products[0].sales_page_active)).toBe(false)
    await expectCompactSwitch(toggle, { checked: false })
    await expect(page.getByText('Sales page is not published', { exact: true })).toBeVisible()
})


test('real provider persists the second course destination from both editors across snapshot refreshes', async ({ page }) => {
    const primary = 'https://www.udemy.com/course/synthetic-primary/'
    const secondary = 'https://www.coursera.org/learn/synthetic-secondary'
    const replacement = 'https://www.coursera.org/learn/synthetic-updated'
    await mount(page, [{ ...product(first, 'QA course'), purchase_link: primary, purchase_link_active: true }])
    await select(page, 'QA course')
    const input = page.getByRole('textbox', { name: 'Second button destination (optional)', exact: true })
    await input.fill(secondary)
    await expect.poll(() => page.evaluate(() => window.fixtureState.products[0].secondary_purchase_link)).toBe(secondary)
    await page.getByRole('button', { name: 'Refresh fixture snapshot', exact: true }).click()
    await expect(input).toHaveValue(secondary)
    await page.getByRole('button', { name: 'Open Sales Page Creator', exact: true }).click()
    const creator = page.locator('[data-sales-page-creator]')
    const creatorInput = creator.getByRole('textbox', { name: 'Second button destination (optional)', exact: true })
    await expect(creatorInput).toHaveValue(secondary)
    await creatorInput.fill(replacement)
    await expect.poll(() => page.evaluate(() => window.fixtureState.products[0].secondary_purchase_link)).toBe(replacement)
    await page.getByRole('button', { name: 'Refresh fixture snapshot', exact: true }).click()
    await expect(creatorInput).toHaveValue(replacement)
    await creator.getByRole('button', { name: 'Back to offering', exact: true }).press('Enter')
    await expect(input).toHaveValue(replacement)
    await expect(page.getByRole('textbox', { name: 'Button destination', exact: true })).toHaveValue(primary)
    expect(await page.evaluate(() => window.fixtureState.products[0].purchase_link)).toBe(primary)
    expect(await page.evaluate(() => window.fixtureState.products[0].paypal_active)).toBe(false)
    const posts = await page.evaluate(() => window.fixturePosts)
    expect(posts).toHaveLength(2)
    expect(posts.map(body => body.changes)).toEqual([secondary, replacement].map(url => [{ kind: 'product.patch', id: first, patch: { secondary_purchase_link: url } }]))
    expect(posts.every(body => body.version === 1)).toBe(true)
})

test('real provider journals custom button text from both editors and clearing restores automatic labels', async ({ page }) => {
    const primary = 'https://apps.apple.com/gb/app/synthetic-dream-journal/id123456789'
    const secondary = 'https://www.nsso.me/sign-up'
    await mount(page, [{ ...product(first, 'QA app'), purchase_link: primary, secondary_purchase_link: secondary, purchase_link_active: true }])
    await select(page, 'QA app')
    const primaryText = page.getByRole('textbox', { name: 'Button text (optional)', exact: true })
    const secondaryText = page.getByRole('textbox', { name: 'Second button text (optional)', exact: true })
    await primaryText.fill('Get my app')
    await secondaryText.fill('Create a profile')
    await expect.poll(() => page.evaluate(() => ({ primary: window.fixtureState.products[0].purchase_button_label, secondary: window.fixtureState.products[0].secondary_purchase_button_label }))).toEqual({ primary: 'Get my app', secondary: 'Create a profile' })
    await page.getByRole('button', { name: 'Refresh fixture snapshot', exact: true }).click()
    await expect(primaryText).toHaveValue('Get my app')
    await expect(secondaryText).toHaveValue('Create a profile')
    await page.getByRole('button', { name: 'Open Sales Page Creator', exact: true }).click()
    const creator = page.locator('[data-sales-page-creator]')
    await expect(creator.getByRole('textbox', { name: 'Button text (optional)', exact: true })).toHaveValue('Get my app')
    await creator.getByRole('textbox', { name: 'Button text (optional)', exact: true }).fill('')
    await creator.getByRole('textbox', { name: 'Second button text (optional)', exact: true }).fill('Join nsso')
    await expect.poll(() => page.evaluate(() => ({ primary: window.fixtureState.products[0].purchase_button_label, secondary: window.fixtureState.products[0].secondary_purchase_button_label }))).toEqual({ primary: '', secondary: 'Join nsso' })
    await page.getByRole('button', { name: 'Refresh fixture snapshot', exact: true }).click()
    await expect(creator.getByText('Button preview: Download on the App Store', { exact: true })).toBeVisible()
    await expect(creator.getByText('Button preview: Join nsso', { exact: true })).toBeVisible()
    await creator.getByRole('button', { name: 'Back to offering', exact: true }).press('Enter')
    await expect(primaryText).toHaveValue('')
    await expect(secondaryText).toHaveValue('Join nsso')
    const row = await page.evaluate(() => window.fixtureState.products[0])
    expect(row.purchase_link).toBe(primary)
    expect(row.secondary_purchase_link).toBe(secondary)
    expect(row.paypal_active).toBe(false)
    expect(row.sales_page_published).toBe(false)
    const posts = await page.evaluate(() => window.fixturePosts)
    expect(posts.length).toBeGreaterThanOrEqual(2)
    for (const body of posts) {
        expect(body.version).toBe(1)
        for (const change of body.changes) {
            expect(change.kind).toBe('product.patch')
            expect(change.id).toBe(first)
            expect(Object.keys(change.patch).every(key => ['purchase_button_label', 'secondary_purchase_button_label'].includes(key))).toBe(true)
        }
    }
})

test('an older destination save response preserves the newer destination and button text draft', async ({ page }) => {
    const olderUrl = 'https://www.etsy.com/listing/123456/synthetic-guide'
    const newerUrl = 'https://apps.apple.com/gb/app/synthetic-dream-journal/id123456789'
    await mount(page, [{ ...product(first, 'QA app'), purchase_link: 'https://seller.example.test/app', purchase_link_active: true }])
    await select(page, 'QA app')

    const requests = [], release = []
    await page.route('https://nsso.test/api/profile/operations', async route => {
        if (route.request().method() !== 'POST') return route.fallback()
        expect(route.request().headers()['x-nsso-account']).toBe(actor)
        const body = route.request().postDataJSON()
        const index = requests.length
        const gate = new Promise(resolve => { release[index] = resolve })
        requests.push(body)
        // The server has accepted the first edit, but its response is held.
        // Hold the next request before applying it so the later assertions
        // prove the real provider's draft overlay, not a fresh server value.
        let result = index === 0 ? await page.evaluate(body => window.fixtureApply(body), body) : null
        await gate
        result ??= await page.evaluate(body => window.fixtureApply(body), body)
        await route.fulfill({ status: 200, json: result })
    })

    const destination = page.getByRole('textbox', { name: 'Button destination', exact: true })
    const text = page.getByRole('textbox', { name: 'Button text (optional)', exact: true })
    await destination.fill(olderUrl)
    await text.fill('Older saved text')
    await expect.poll(() => requests.length).toBe(1)
    expect(requests[0].changes).toEqual([{ kind: 'product.patch', id: first, patch: { purchase_link: olderUrl, purchase_button_label: 'Older saved text' } }])

    await destination.fill(newerUrl)
    await text.fill('Get the latest app')
    await expect(destination).toHaveValue(newerUrl)
    await expect(text).toHaveValue('Get the latest app')
    release[0]()
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1].expectedRevision).toBe(1)
    expect(requests[1].operationId).not.toBe(requests[0].operationId)
    expect(await page.evaluate(() => ({ url: window.fixtureState.products[0].purchase_link, label: window.fixtureState.products[0].purchase_button_label }))).toEqual({ url: olderUrl, label: 'Older saved text' })
    await expect(destination).toHaveValue(newerUrl)
    await expect(text).toHaveValue('Get the latest app')
    await expect(page.getByText('Button preview: Get the latest app', { exact: true })).toBeVisible()
    await expect(page.locator('[data-offering-save-status]')).toContainText('Saving')

    release[1]()
    await expect.poll(() => page.evaluate(() => window.fixtureState.revision)).toBe(2)
    await expect(page.locator('[data-offering-save-status]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Refresh fixture snapshot', exact: true }).click()
    await expect(destination).toHaveValue(newerUrl)
    await expect(text).toHaveValue('Get the latest app')
    expect(requests[1].changes).toEqual([{ kind: 'product.patch', id: first, patch: { purchase_link: newerUrl, purchase_button_label: 'Get the latest app' } }])
    expect(await page.evaluate(() => window.fixtureState.products[0].paypal_active)).toBe(false)
    expect(await page.evaluate(() => window.fixtureState.products[0].sales_page_published)).toBe(false)
})
