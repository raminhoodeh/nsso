import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const ownerId = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222', productId = '33333333-3333-4333-8333-333333333333'
const action = 'https://www.paypal.com/ncp/payment/AB12CD34EF56G'
const product = { id: productId, user_id: ownerId, name: 'Fixture product', headline: 'Published fixture sales page', tagline: 'Fixture tagline', intro_text: 'Published fixture content', price: 'GBP 12', description: '', benefits: ['One benefit'], testimonials: [], video_url: '', image_url: '', purchase_link: 'https://seller.example.test/purchase', purchase_link_active: true, paypal_active: true, sales_page_published: true, payment_config: { version: 1, kind: 'payment-form', action, fields: [], label: 'Buy fixture product' } }
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://product-fixture.supabase.co"', 'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': '"synthetic-anonymous-key"' },
        plugins: [{ name: 'product-page-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/(?:providers\/UserProvider|ui\/tahoe-glass))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? `export const useParams=()=>({id:'${productId}'}),useRouter=()=>window.fixtureRouter,useSearchParams=()=>new URLSearchParams(window.location.search);`
                    : path === 'next/image' ? 'import React from "react";export default ({src,alt})=><img src={src} alt={alt}/>;'
                        : path === 'next/link' ? 'import React from "react";export default ({href,children})=><a href={href}>{children}</a>;'
                            : path.endsWith('UserProvider') ? 'import {useSyncExternalStore} from "react";export const useUser=()=>useSyncExternalStore(fn=>{window.fixtureListeners.add(fn);return()=>window.fixtureListeners.delete(fn)},()=>window.fixtureAccount);'
                                : path.endsWith('tahoe-glass') ? 'import React from "react";export const TahoeGlassSurface=({as:Tag="div",children,href,target,rel})=><Tag href={href} target={target} rel={rel}>{children}</Tag>;export const TahoeGlassButton=({children,onClick,...props})=><button onClick={onClick}>{children}</button>;'
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

async function fixture(page, { published = true, account = { user: null, loading: false, error: null }, privateMode = 'ok', failPublicOnce = false, malformedArrays = false, search = '' } = {}) {
    const requests = [], errors = []
    let failures = failPublicOnce ? 1 : 0
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin === 'https://nsso.test') return route.fulfill({ contentType: url.pathname.endsWith('.png') ? 'image/png' : 'text/html', body: url.pathname.endsWith('.png') ? '' : '<div id="root"></div>' })
        if (url.origin !== 'https://product-fixture.supabase.co') throw new Error('Unexpected product fixture destination')
        requests.push({ path: url.pathname, authorization: route.request().headers().authorization })
        if (url.pathname.startsWith('/auth/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic Auth outage"}' })
        expect(route.request().headers().authorization).toBe('Bearer synthetic-anonymous-key')
        let data
        if (url.pathname === '/rest/v1/rpc/get_product_details') {
            if (failures-- > 0) return route.abort('failed')
            data = published ? { ...product, ...(malformedArrays ? { benefits: [null, {}, 'Readable benefit'], testimonials: [{ name: 'Valid', text: 'Readable quote' }, null, {}] } : {}) } : null
        } else if (url.pathname === '/rest/v1/contacts') data = [{ method: 'Email', value: 'public-fixture@example.test' }]
        else if (url.pathname === '/rest/v1/users') data = { username: 'fixture-seller' }
        else throw new Error('Unexpected public product query')
        return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) })
    })
    await page.goto('https://nsso.test/products/' + productId + search)
    await page.evaluate(({ account, privateMode, draft }) => {
        window.fixtureAccount = account; window.fixturePrivateMode = privateMode; window.fixtureDraft = draft
        localStorage.setItem('sb-product-fixture-auth-token', JSON.stringify({ access_token: 'expired-synthetic-token', refresh_token: 'synthetic-refresh-token', expires_at: 1, user: { id: 'previous-private-account' } }))
    }, { account, privateMode, draft: { ...product, sales_page_published: false, headline: 'PRIVATE owner draft', intro_text: 'PRIVATE unsaved sales copy' } })
    await page.addScriptTag({ content: bundle })
    return { requests, errors }
}

test('published checkout and public creator details load with expired persisted Auth and no session dependency', async ({ page }) => {
    const { requests, errors } = await fixture(page)
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    await expect(page.locator('form')).toHaveCount(2)
    for (const form of await page.locator('form').all()) await expect(form).toHaveAttribute('action', action)
    await expect(page.getByRole('link', { name: 'Link to Purchase' })).toHaveCount(2)
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
    await expect(page.getByRole('link', { name: 'Link to Purchase' })).toHaveCount(0)
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
    await expect(page.getByRole('button', { name: 'Link to Purchase', exact: true })).toHaveCount(2)
    await page.getByRole('button', { name: 'Link to Purchase', exact: true }).first().press('Enter')
    await expect(page.getByRole('status')).toHaveText('Checkout is disabled during profile preview')
    await page.getByRole('button', { name: 'Back to Sales Page Creator' }).click()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([`/dashboard/products/${productId}/creator`])
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
