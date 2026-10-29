import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expectOpaqueLightPanel, minimumTextContrast } from './helpers/light-panel-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const ownerId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222', productId = '33333333-3333-4333-8333-333333333333'
const action = 'https://www.paypal.com/ncp/payment/AB12CD34EF56G'
const product = { id: productId, user_id: ownerId, name: 'Fixture product', headline: 'Published fixture sales page', tagline: 'Fixture tagline', intro_text: 'Published fixture content', price: 'GBP 12', description: '', benefits: ['One benefit'], testimonials: [], video_url: '', image_url: '', purchase_link: 'https://seller.example.test/purchase', purchase_link_active: true, paypal_active: true, sales_page_published: true, payment_config: { version: 1, kind: 'payment-form', action, fields: [], label: 'Buy fixture product' } }
let bundle, css
test.beforeAll(async () => {
    const files = ['src/app/products/[id]/page.tsx', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/light-panel.ts', 'src/components/ui/PreviewCheckoutButton.tsx', 'src/components/ui/PayPalSmartButton.tsx']
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
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://product-fixture.supabase.co"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"synthetic-anonymous-key"' },
        plugins: [{ name: 'product-page-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/(?:providers\/UserProvider|ui\/tahoe-glass))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? `export const useParams=()=>({id:'${productId}'}),useRouter=()=>window.fixtureRouter,useSearchParams=()=>new URLSearchParams(window.location.search);`
                    : path === 'next/image' ? 'import React from "react";export default ({src,alt})=><img src={src} alt={alt}/>;'
                        : path === 'next/link' ? 'import React from "react";export default ({href,children})=><a href={href}>{children}</a>;'
                            : path.endsWith('UserProvider') ? 'import {useSyncExternalStore} from "react";export const useUser=()=>useSyncExternalStore(fn=>{window.fixtureListeners.add(fn);return()=>window.fixtureListeners.delete(fn)},()=>window.fixtureAccount);'
                                : path.endsWith('tahoe-glass') ? 'import React from "react";export const TahoeGlassSurface=({as:Tag="div",children,href,target,rel,className,contentClassName,style})=><Tag href={href} target={target} rel={rel} className={className} style={style}><div className={contentClassName}>{children}</div></Tag>;export const TahoeGlassButton=({children,onClick,...props})=><button onClick={onClick}>{children}</button>;'
                                    : 'export const createClient=()=>{window.fixtureSessionClients++;return window.fixtureSession};' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';import Page from './src/app/products/[id]/page';
            window.fixtureListeners=new Set();window.fixturePrivateCalls=[];window.fixtureSessionClients=0;window.fixturePending=[];window.fixtureNavigation=[];
            window.fixtureRouter={push:path=>window.fixtureNavigation.push(path),back:()=>window.fixtureNavigation.push('back')};
            window.setFixtureAccount=account=>{window.fixtureAccount=account;window.fixtureListeners.forEach(fn=>fn())};
            window.fixtureSession={rpc(name,args){return{abortSignal:async signal=>{const accountId=window.fixtureAccount.user?.id;window.fixturePrivateCalls.push({name,args,accountId});if(window.fixturePrivateMode==='reject')throw new Error('Synthetic private network failure');if(window.fixturePrivateMode==='defer')return new Promise(resolve=>window.fixturePending.push(()=>resolve({data:window.fixtureDraft,error:null})));return{data:accountId==='${ownerId}'?window.fixtureDraft:null,error:null};}}}};
            window.releaseFixturePrivate=()=>window.fixturePending.splice(0).forEach(resolve=>resolve());
            createRoot(document.getElementById('root')).render(<Page/>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function fixture(page, { published = true, account = { user: null, loading: false, error: null }, privateMode = 'ok', failPublicOnce = false, malformedArrays = false, deferPublic = false, search = '', styled = false, withTestimonials = false, purchaseUrl = product.purchase_link } = {}) {
    const requests = [], errors = []
    const pendingPublic = []
    let publicReleased = false
    let failures = failPublicOnce ? 1 : 0
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin === 'https://nsso.test') return route.fulfill({ contentType: url.pathname.endsWith('.png') ? 'image/png' : 'text/html', body: url.pathname.endsWith('.png') ? '' : (styled ? '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>' : '<div id="root"></div>') })
        if (url.origin !== 'https://product-fixture.supabase.co') throw new Error('Unexpected product fixture destination')
        requests.push({ path: url.pathname, authorization: route.request().headers().authorization })
        if (url.pathname.startsWith('/auth/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic Auth outage"}' })
        expect(route.request().headers().authorization).toBe('Bearer synthetic-anonymous-key')
        let data
        if (url.pathname === '/rest/v1/rpc/get_product_details') {
            if (deferPublic && !publicReleased) await new Promise(resolve => pendingPublic.push(resolve))
            if (failures-- > 0) return route.abort('failed')
            data = published ? { ...product, purchase_link: purchaseUrl, ...(withTestimonials ? { testimonials: [{ name: 'First customer', text: 'First synthetic quote' }, { name: 'Second customer', text: 'Second synthetic quote' }] } : {}), ...(malformedArrays ? { benefits: [null, {}, 'Readable benefit'], testimonials: [{ name: 'Valid', text: 'Readable quote' }, null, {}] } : {}) } : null
        } else if (url.pathname === '/rest/v1/contacts') data = [{ method: 'Email', value: 'public-fixture@example.test' }]
        else if (url.pathname === '/rest/v1/users') data = { username: 'fixture-seller' }
        else throw new Error('Unexpected public product query')
        return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) })
    })
    await page.goto('https://nsso.test/products/' + productId + search)
    if (styled) await page.addStyleTag({ content: css + '\nbody{margin:0;background:#43628c;color:white;font-family:Arial}button{font:inherit}' })
    await page.evaluate(({ account, privateMode, draft }) => {
        window.fixtureAccount = account; window.fixturePrivateMode = privateMode; window.fixtureDraft = draft
        localStorage.setItem('sb-product-fixture-auth-token', JSON.stringify({ access_token: 'expired-synthetic-token', refresh_token: 'synthetic-refresh-token', expires_at: 1, user: { id: 'previous-private-account' } }))
    }, { account, privateMode, draft: { ...product, purchase_link: purchaseUrl, sales_page_published: false, headline: 'PRIVATE owner draft', intro_text: 'PRIVATE unsaved sales copy' } })
    await page.addScriptTag({ content: bundle })
    return { requests, errors, releasePublic: () => { publicReleased = true; pendingPublic.splice(0).forEach(resolve => resolve()) } }
}

for (const [store, purchaseUrl, label] of [
    ['Etsy', 'https://www.etsy.com/listing/12345/synthetic?ref=nsso#details', 'Buy on Etsy'],
    ['Shopify', 'https://fixture-shop.myshopify.com/products/synthetic?variant=123', 'Buy on Shopify'],
    ['generic', 'https://shop.example.test/products/synthetic', 'View purchase page'],
    ['lookalike', 'https://etsy.com.evil.example.test/listing/12345', 'View purchase page'],
]) test(`${store} sales-page purchase labels preserve the exact destination and inert preview`, async ({ page }) => {
    const { requests, errors } = await fixture(page, { purchaseUrl, styled: true })
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    const links = page.getByRole('link', { name: label, exact: true, includeHidden: true })
    await expect(links).toHaveCount(2)
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(1)
    for (const link of await links.all()) {
        await expect(link).toHaveAttribute('href', purchaseUrl)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    const merchant = page.locator('form button').filter({ visible: true })
    await expect(merchant).toHaveCSS('background-color', 'rgb(255, 196, 57)')
    await expect(merchant.locator('..')).toHaveAttribute('action', action)
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    expect(requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
    expect(errors).toEqual([])

    const preview = await fixture(page, { purchaseUrl, search: '?preview=true' })
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(2)
    await page.getByRole('button', { name: label, exact: true }).first().press('Enter')
    await expect(page.getByRole('status')).toHaveText('Checkout is disabled during profile preview')
    await page.getByRole('button', { name: 'Buy fixture product', exact: true }).first().press('Space')
    await expect(page.getByRole('status')).toHaveCount(2)
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('a').filter({ hasText: label })).toHaveCount(0)
    await expect(page.locator('script[src*="paypal"]')).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    expect(preview.requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
    expect(preview.errors).toEqual([])
})

for (const purchaseUrl of ['javascript:alert(1)', 'https://seller.example.test/\nunsafe']) {
    test(`invalid sales-page purchase URL ${JSON.stringify(purchaseUrl)} remains guarded`, async ({ page }) => {
        const { errors } = await fixture(page, { purchaseUrl })
        await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
        await expect(page.getByRole('link', { name: /Buy on Etsy|Buy on Shopify|View purchase page/ })).toHaveCount(0)
        await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
        await expect(page.locator('form')).toHaveCount(2)
        for (const form of await page.locator('form').all()) await expect(form).toHaveAttribute('action', action)
        expect(errors).toEqual([])
    })
}

test('public product actions share white controls while merchant checkout and guarded destinations remain intact', async ({ page }, testInfo) => {
    const checkMaterial = async action => {
        await action.scrollIntoViewIfNeeded()
        await expect(action).toHaveAttribute('data-nsso-control', 'white')
        const backdrop = await page.evaluate(() => document.body.style.background)
        await expectOpaqueLightPanel(page, action)
        await page.evaluate(value => { document.body.style.background = value }, backdrop)
        const content = action.locator('[data-light-button-content]')
        const ink = (await content.textContent()).trim() ? content : action.locator('svg')
        expect(await minimumTextContrast(ink)).toBeGreaterThanOrEqual(4.5)
        const bounds = await action.boundingBox()
        // Mobile compositing may report 43.999992 for an exact 44 CSS px edge.
        expect(Number(bounds.height.toFixed(3))).toBeGreaterThanOrEqual(44)
        expect(Number(bounds.width.toFixed(3))).toBeGreaterThanOrEqual(44)
    }
    const { errors, requests } = await fixture(page, { styled: true, withTestimonials: true })
    expect(await page.evaluate(() => window.innerWidth)).toBe(page.viewportSize().width)
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    const purchase = page.getByRole('link', { name: 'View purchase page', exact: true }).filter({ visible: true })
    await checkMaterial(purchase)
    await expect(purchase).toHaveAttribute('href', product.purchase_link)
    await expect(purchase).toHaveAttribute('target', '_blank')
    await expect(purchase).toHaveAttribute('rel', 'noopener noreferrer')
    const merchant = page.locator('form button').filter({ visible: true })
    await expect(merchant).toHaveCSS('background-color', 'rgb(255, 196, 57)')
    await expect(merchant).not.toHaveAttribute('data-nsso-control')
    await expect(merchant.locator('..')).toHaveAttribute('action', action)
    const next = page.getByRole('button', { name: 'Next testimonial', exact: true })
    const previous = page.getByRole('button', { name: 'Previous testimonial', exact: true })
    await checkMaterial(next)
    await checkMaterial(previous)
    await next.press('Enter')
    await expect(page.getByText('"Second synthetic quote"', { exact: true })).toBeVisible()
    await previous.press('Space')
    await expect(page.getByText('"First synthetic quote"', { exact: true })).toBeVisible()
    const back = page.getByRole('button', { name: 'Back to Profile', exact: true })
    await checkMaterial(back)
    await expect(page.getByRole('link', { name: 'nsso.me/fixture-seller', exact: true })).toBeVisible()
    await back.press('Enter')
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual(['/fixture-seller'])
    expect(requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('white-public-product-actions.png'), fullPage: true })
    await fixture(page, { styled: true, failPublicOnce: true })
    const retry = page.getByRole('button', { name: 'Retry product', exact: true })
    await checkMaterial(retry)
    const recovery = page.getByRole('button', { name: 'Back to nsso', exact: true })
    await checkMaterial(recovery)
    await retry.press('Enter')
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
})

test('narrow product loading, error and not-found states retain a keyboard-accessible safe exit without a bottom bar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const [state, options] of [
        ['loading', { deferPublic: true }], ['error', { failPublicOnce: true }], ['not-found', { published: false }],
    ]) {
        for (const verified of [false, true]) {
            const { releasePublic } = await fixture(page, { ...options, account: { user: verified ? { id: otherId } : null, loading: false, error: null }, search: '?preview=true&source=creator&next=https%3A%2F%2Funtrusted.example' })
            if (state === 'loading') await expect(page.getByText('Loading...', { exact: true })).toBeVisible()
            else if (state === 'error') await expect(page.getByRole('button', { name: 'Retry product', exact: true })).toBeVisible()
            else await expect(page.getByText('Product not found', { exact: true })).toBeVisible()
            const back = page.getByRole('button', { name: verified ? 'Back to profile editor' : 'Back to nsso', exact: true })
            await expect(back).toBeVisible()
            await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
            await expect(page.getByRole('button', { name: 'Back to Sales Page Creator', exact: true })).toHaveCount(0)
            await back.press('Enter')
            expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([verified ? '/dashboard' : '/'])
            releasePublic()
        }
    }
    const { releasePublic } = await fixture(page, { deferPublic: true, account: { user: { id: ownerId }, loading: false, error: 'Synthetic unverified identity' } })
    await expect(page.getByRole('button', { name: 'Back to nsso', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Back to profile editor', exact: true })).toHaveCount(0)
    releasePublic()
})

test('published checkout and public creator details load with expired persisted Auth and no session dependency', async ({ page }) => {
    const { requests, errors } = await fixture(page)
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    await expect(page.locator('form')).toHaveCount(2)
    for (const form of await page.locator('form').all()) await expect(form).toHaveAttribute('action', action)
    await expect(page.getByRole('link', { name: 'View purchase page' })).toHaveCount(2)
    await expect(page.getByText('public-fixture@example.test', { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: 'nsso.me/fixture-seller' })).toHaveAttribute('href', '/fixture-seller')
    expect(requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
    expect(await page.evaluate(() => window.fixtureSessionClients)).toBe(0)
    expect(await page.evaluate(() => window.fixturePrivateCalls)).toEqual([])
    expect(errors).toEqual([])
})

test('an anonymous visitor and an account whose verification failed cannot read a private draft', async ({ page }) => {
    await fixture(page, { published: false, account: { user: { id: ownerId }, loading: false, error: 'Synthetic current-account outage' } })
    await expect(page.getByText('Product not found', { exact: true })).toBeVisible()
    await expect(page.getByText('PRIVATE owner draft', { exact: true })).toHaveCount(0)
    await expect(page.locator('form')).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureSessionClients)).toBe(0)
    await page.evaluate(() => window.setFixtureAccount({ user: null, loading: false, error: null }))
    await expect(page.getByText('Product not found', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.fixturePrivateCalls)).toEqual([])
})

test('an explicit preview stays inert while account verification is pending and grants no owner controls', async ({ page }) => {
    await fixture(page, { account: { user: null, loading: true, error: null }, search: '?preview=true&source=creator' })
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'View purchase page' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Buy fixture product', exact: true })).toHaveCount(2)
    await expect(page.getByText('Checkout is disabled during profile preview', { exact: true })).toHaveCount(0)
    for (const button of await page.getByRole('button', { name: 'Buy fixture product', exact: true }).all()) {
        await expect(button).toBeEnabled()
        await button.click()
    }
    await expect(page.getByRole('status').filter({ hasText: 'Checkout is disabled during profile preview' })).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Back to Sales Page Creator' })).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureSessionClients)).toBe(0)
    await page.evaluate(ownerId => window.setFixtureAccount({ user: { id: ownerId }, loading: false, error: null }), ownerId)
    await expect(page.getByRole('button', { name: 'Back to Sales Page Creator' })).toBeVisible()
    await expect(page.locator('form')).toHaveCount(0)
})

test('a verified owner loads the authenticated draft fallback and every checkout control stays inert', async ({ page }) => {
    const { requests, errors } = await fixture(page, { published: false, account: { user: { id: ownerId }, loading: false, error: null }, search: '?preview=true&source=creator' })
    await expect(page.getByRole('heading', { name: 'PRIVATE owner draft' })).toBeVisible()
    await expect(page.getByText('Draft preview — checkout is disabled.', { exact: true })).toHaveCount(0)
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Buy fixture product', exact: true })).toHaveCount(2)
    for (const button of await page.getByRole('button', { name: 'Buy fixture product', exact: true }).all()) await expect(button).toBeEnabled()
    await expect(page.getByRole('button', { name: 'View purchase page', exact: true })).toHaveCount(2)
    await page.getByRole('button', { name: 'View purchase page', exact: true }).first().press('Enter')
    await expect(page.getByRole('status')).toHaveText('Checkout is disabled during profile preview')
    await page.getByRole('button', { name: 'Back to Sales Page Creator' }).click()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([`/dashboard?view=profile&offering=${productId}&offeringView=creator`])
    expect(await page.evaluate(() => window.fixturePrivateCalls)).toHaveLength(1)
    expect(requests[0].path).toBe('/rest/v1/rpc/get_product_details')
    expect(errors).toEqual([])
})

test('late account A draft responses cannot enter another current account', async ({ page }) => {
    await fixture(page, { published: false, account: { user: { id: ownerId }, loading: false, error: null }, privateMode: 'defer' })
    await page.waitForFunction(() => window.fixturePending.length === 1)
    await page.evaluate(otherId => { window.fixturePrivateMode = 'ok'; window.setFixtureAccount({ user: { id: otherId }, loading: false, error: null }); window.releaseFixturePrivate() }, otherId)
    await expect(page.getByText('Product not found', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'PRIVATE owner draft' })).toHaveCount(0)
    await expect(page.locator('form')).toHaveCount(0)
})

test('rejected public reads leave Loading with a retry that restores the published checkout', async ({ page }) => {
    const { errors } = await fixture(page, { failPublicOnce: true })
    await expect(page.getByRole('button', { name: 'Retry product' })).toBeVisible()
    await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Retry product' }).click()
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    await expect(page.locator('form')).toHaveCount(2)
    expect(errors).toEqual([])
})

test('rejected owner reads and malformed optional arrays cannot leave a hung or crashed sales page', async ({ page }) => {
    await fixture(page, { published: false, account: { user: { id: ownerId }, loading: false, error: null }, privateMode: 'reject' })
    await expect(page.getByRole('button', { name: 'Retry product' })).toBeVisible()
    await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0)
    await page.evaluate(() => { window.fixturePrivateMode = 'ok' })
    await page.getByRole('button', { name: 'Retry product' }).click()
    await expect(page.getByRole('heading', { name: 'PRIVATE owner draft' })).toBeVisible()
    const { errors } = await fixture(page, { malformedArrays: true })
    await expect(page.getByText('Readable benefit')).toBeVisible()
    await expect(page.getByText('"Readable quote"')).toBeVisible()
    expect(errors).toEqual([])
})

test('an owner preview that never settles times out, ignores its late response and can retry', async ({ page }) => {
    await page.clock.install()
    await fixture(page, { published: false, account: { user: { id: ownerId }, loading: false, error: null }, privateMode: 'defer' })
    await page.waitForFunction(() => window.fixturePending.length === 1)
    await page.clock.fastForward(5_001)
    await expect(page.getByRole('button', { name: 'Retry product' })).toBeVisible()
    await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0)
    await page.evaluate(() => window.releaseFixturePrivate())
    await expect(page.getByRole('heading', { name: 'PRIVATE owner draft' })).toHaveCount(0)
    await page.evaluate(() => { window.fixturePrivateMode = 'ok' })
    await page.getByRole('button', { name: 'Retry product' }).click()
    await expect(page.getByRole('heading', { name: 'PRIVATE owner draft' })).toBeVisible()
})
