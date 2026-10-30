import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { controlMaterial, renderedControlContrast } from './helpers/white-control-assertions.mjs'

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
                    : path === 'next/image' ? 'import React from "react";export default ({src,alt,fill,className})=><img src={src} alt={alt} className={className} style={fill?{position:"absolute",inset:0,width:"100%",height:"100%"}:undefined}/>;'
                        : path === 'next/link' ? 'import React from "react";export default ({href,children,...props})=><a href={href} {...props}>{children}</a>;'
                            : path.endsWith('UserProvider') ? 'import {useSyncExternalStore} from "react";export const useUser=()=>useSyncExternalStore(fn=>{window.fixtureListeners.add(fn);return()=>window.fixtureListeners.delete(fn)},()=>window.fixtureAccount);'
                                : path.endsWith('tahoe-glass') ? 'import React from "react";export const TahoeGlassSurface=({as:Tag="div",children,href,target,rel,className,contentClassName,style,role,"data-product-purchase-card":position})=><Tag href={href} target={target} rel={rel} role={role} data-product-purchase-card={position} className={className} style={{position:"relative",isolation:"isolate",...style}}><div className={contentClassName} style={{position:"relative",zIndex:20}}>{children}</div></Tag>;export const TahoeGlassButton=({children,onClick,...props})=><button onClick={onClick}>{children}</button>;'
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

async function fixture(page, { published = true, account = { user: null, loading: false, error: null }, privateMode = 'ok', failPublicOnce = false, malformedArrays = false, deferPublic = false, search = '', styled = false, withTestimonials = false, purchaseUrl = product.purchase_link, secondaryPurchaseUrl = null, purchaseActive = true, purchaseLabel = null, secondaryPurchaseLabel = null, imageUrl = '', paypalActive = true, paymentConfig = product.payment_config, valueProposition = '', benefits = product.benefits, videoUrl = '' } = {}) {
    const requests = [], errors = []
    const pendingPublic = []
    let publicReleased = false
    let failures = failPublicOnce ? 1 : 0
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', async route => {
        const url = new URL(route.request().url())
        if (url.origin === 'https://www.youtube.com' && url.pathname === '/embed/Synthetic12') return route.fulfill({ contentType: 'text/html', body: '<title>Fixture video</title>' })
        if (url.origin === 'https://nsso.test' && url.pathname === '/fixture-product.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#5d8fbb"/></svg>' })
        if (url.origin === 'https://nsso.test') return route.fulfill({ contentType: url.pathname.endsWith('.png') ? 'image/png' : 'text/html', body: url.pathname.endsWith('.png') ? '' : (styled ? '<meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div>' : '<div id="root"></div>') })
        if (url.origin !== 'https://product-fixture.supabase.co') throw new Error('Unexpected product fixture destination')
        requests.push({ path: url.pathname, authorization: route.request().headers().authorization })
        if (url.pathname.startsWith('/auth/')) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Synthetic Auth outage"}' })
        expect(route.request().headers().authorization).toBe('Bearer synthetic-anonymous-key')
        let data
        if (url.pathname === '/rest/v1/rpc/get_product_details') {
            if (deferPublic && !publicReleased) await new Promise(resolve => pendingPublic.push(resolve))
            if (failures-- > 0) return route.abort('failed')
            data = published ? { ...product, purchase_link: purchaseUrl, secondary_purchase_link: secondaryPurchaseUrl, purchase_link_active: purchaseActive, purchase_button_label: purchaseLabel, secondary_purchase_button_label: secondaryPurchaseLabel, image_url: imageUrl, paypal_active: paypalActive, payment_config: paymentConfig, value_proposition: valueProposition, benefits, video_url: videoUrl, ...(withTestimonials ? { testimonials: [{ name: 'First customer', text: 'First synthetic quote' }, { name: 'Second customer', text: 'Second synthetic quote' }] } : {}), ...(malformedArrays ? { benefits: [null, {}, 'Readable benefit'], testimonials: [{ name: 'Valid', text: 'Readable quote' }, null, {}] } : {}) } : null
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
    }, { account, privateMode, draft: { ...product, purchase_link: purchaseUrl, secondary_purchase_link: secondaryPurchaseUrl, purchase_link_active: purchaseActive, purchase_button_label: purchaseLabel, secondary_purchase_button_label: secondaryPurchaseLabel, image_url: imageUrl, paypal_active: paypalActive, payment_config: paymentConfig, value_proposition: valueProposition, benefits, video_url: videoUrl, sales_page_published: false, headline: 'PRIVATE owner draft', intro_text: 'PRIVATE unsaved sales copy' } })
    await page.addScriptTag({ content: bundle })
    return { requests, errors, releasePublic: () => { publicReleased = true; pendingPublic.splice(0).forEach(resolve => resolve()) } }
}

// Existing presentation/security checks cover the original responsive pair;
// the closing mobile repetition is verified independently below.
const primaryCards = page => page.locator('[data-product-purchase-card^="primary-"]')

async function expectEqualPurchaseWidths(purchase, paypal, { purchaseMayWrap = false } = {}) {
    const [purchaseBox, paypalBox] = await Promise.all([purchase.boundingBox(), paypal.boundingBox()])
    for (const box of [purchaseBox, paypalBox]) {
        expect(Math.abs(box.width - 240)).toBeLessThanOrEqual(.05)
        expect(Number(box.height.toFixed(3))).toBeGreaterThanOrEqual(44)
    }
    expect(Math.abs(purchaseBox.width - paypalBox.width)).toBeLessThanOrEqual(.05)
    expect(Math.abs(purchaseBox.x - paypalBox.x)).toBeLessThanOrEqual(.05)
    for (const control of [purchase, paypal]) {
        const label = await control.evaluate(element => {
            const text = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (!node.textContent.trim()) continue
                const range = document.createRange(); range.selectNodeContents(node)
                text.push(...[...range.getClientRects()].filter(rect => rect.width && rect.height))
            }
            const box = element.getBoundingClientRect()
            return { lines: [...new Set(text.map(rect => Math.round(rect.top * 1000) / 1000))], left: Math.min(...text.map(rect => rect.left)), right: Math.max(...text.map(rect => rect.right)), targetLeft: box.left, targetRight: box.right }
        })
        if (control === purchase && purchaseMayWrap) {
            expect(label.lines.length).toBeGreaterThanOrEqual(1)
            expect(label.lines.length).toBeLessThanOrEqual(2)
        } else expect(label.lines).toHaveLength(1)
        expect(label.left).toBeGreaterThanOrEqual(label.targetLeft - .05)
        expect(label.right).toBeLessThanOrEqual(label.targetRight + .05)
    }
}

for (const [store, purchaseUrl, label] of [
    ['Etsy', 'https://www.etsy.com/listing/12345/synthetic?ref=nsso#details', 'Buy on Etsy'],
    ['Shopify', 'https://fixture-shop.myshopify.com/products/synthetic?variant=123', 'Buy on Shopify'],
    ['Amazon UK', 'https://www.amazon.co.uk/dp/B0SYNTHETIC?tag=nsso#details', 'Buy on Amazon'],
    ['App Store', 'https://apps.apple.com/gb/app/synthetic-dream-journal/id123456789', 'Download on the App Store'],
    ['nsso signup', 'https://www.nsso.me/sign-up', 'Sign up to nsso'],
    ['booking', 'https://calendar.app.google/syntheticBooking', 'Book a call'],
    ['generic', 'https://shop.example.test/products/synthetic', 'View purchase page'],
    ['lookalike', 'https://etsy.com.evil.example.test/listing/12345', 'View purchase page'],
]) test(`${store} sales-page purchase labels preserve the exact destination and inert preview`, async ({ page }) => {
    const { requests, errors } = await fixture(page, { purchaseUrl, styled: true })
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    const links = primaryCards(page).getByRole('link', { name: label, exact: true, includeHidden: true })
    await expect(links).toHaveCount(2)
    await expect(primaryCards(page).getByRole('link', { name: label, exact: true })).toHaveCount(1)
    for (const link of await links.all()) {
        await expect(link).toHaveAttribute('href', purchaseUrl)
        await expect(link).toHaveAttribute('target', '_blank')
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    const merchant = primaryCards(page).locator('form button').filter({ visible: true })
    await expect(merchant).toHaveText('Buy via PayPal')
    await expect(merchant).toHaveCSS('background-color', 'rgb(255, 196, 57)')
    await expect(merchant.locator('..')).toHaveAttribute('action', action)
    await expect(merchant.locator('..')).toHaveAttribute('method', 'post')
    await expect(merchant.locator('..')).toHaveAttribute('target', '_top')
    // These are the two real responsive purchase placements: mobile content
    // card and desktop context card. Only the appropriate one is displayed.
    const visibleIndex = page.viewportSize().width >= 1024 ? 1 : 0
    await expect(links.nth(visibleIndex)).toBeVisible()
    await expect(links.nth(1 - visibleIndex)).toBeHidden()
    await expectEqualPurchaseWidths(links.nth(visibleIndex), merchant, { purchaseMayWrap: store === 'App Store' })
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    expect(requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
    expect(errors).toEqual([])

    const preview = await fixture(page, { purchaseUrl, search: '?preview=true', styled: true })
    await expect(primaryCards(page).getByRole('button', { name: label, exact: true, includeHidden: true })).toHaveCount(2)
    await expect(primaryCards(page).getByRole('button', { name: 'Buy via PayPal', exact: true, includeHidden: true })).toHaveCount(2)
    const previewPurchase = primaryCards(page).getByRole('button', { name: label, exact: true }).filter({ visible: true })
    const previewPaypal = primaryCards(page).getByRole('button', { name: 'Buy via PayPal', exact: true }).filter({ visible: true })
    await expectEqualPurchaseWidths(previewPurchase, previewPaypal, { purchaseMayWrap: store === 'App Store' })
    await expect(previewPaypal).toHaveAttribute('type', 'button')
    await previewPurchase.press('Enter')
    await expect(page.getByRole('status')).toHaveText('Checkout is disabled during profile preview')
    await previewPaypal.press('Space')
    await expect(page.getByRole('status')).toHaveCount(2)
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('a').filter({ hasText: label })).toHaveCount(0)
    await expect(page.locator('script[src*="paypal"]')).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    expect(preview.requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
    expect(preview.errors).toEqual([])
})


const courseTerms = 'Enrolment, pricing and refunds are handled by the course platform. Review its terms before enrolling.'
const coursePrimary = 'https://www.udemy.com/course/synthetic-ai-product/?couponCode=FIXTURE'
const courseSecondary = 'https://www.coursera.org/learn/synthetic-ai-product'

test('two course destinations remain ordered and equal-width while live PayPal and every preview action stay unchanged', async ({ page }, testInfo) => {
    const state = await fixture(page, { purchaseUrl: coursePrimary, secondaryPurchaseUrl: courseSecondary, styled: true })
    const merchant = primaryCards(page).locator('form button').filter({ visible: true })
    await expect(merchant).toHaveText('Buy via PayPal')
    await expect(merchant).toHaveCSS('background-color', 'rgb(255, 196, 57)')
    await expect(merchant.locator('..')).toHaveAttribute('action', action)
    await expect(merchant.locator('..')).toHaveAttribute('method', 'post')
    await expect(merchant.locator('..')).toHaveAttribute('target', '_top')
    for (const [label, url] of [['Buy on Udemy', coursePrimary], ['Buy on Coursera', courseSecondary]]) {
        const copies = primaryCards(page).getByRole('link', { name: label, exact: true, includeHidden: true })
        await expect(copies).toHaveCount(2)
        for (const link of await copies.all()) {
            await expect(link).toHaveAttribute('href', url)
            await expect(link).toHaveAttribute('target', '_blank')
            await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
        }
        const visible = copies.filter({ visible: true })
        await expect(visible).toHaveAttribute('data-nsso-control', 'white')
        await expectEqualPurchaseWidths(visible, merchant)
    }
    const visibleLabels = await primaryCards(page).getByRole('link', { name: /^Buy on (Udemy|Coursera)$/, exact: true }).allTextContents()
    expect(visibleLabels.map(text => text.trim())).toEqual(['Buy on Udemy', 'Buy on Coursera'])
    await expect(page.getByText(courseTerms, { exact: true })).toBeVisible()
    await expect(page.getByText(/100% Guaranteed Satisfaction/)).toHaveCount(0)
    await expect(page.getByRole('img', { name: 'Guarantee', exact: true })).toHaveCount(0)
    expect(state.errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('two-course-purchase-actions.png'), fullPage: true })

    const preview = await fixture(page, { purchaseUrl: coursePrimary, secondaryPurchaseUrl: courseSecondary, styled: true, search: '?preview=true' })
    const previewPaypal = primaryCards(page).getByRole('button', { name: 'Buy via PayPal', exact: true }).filter({ visible: true })
    for (const label of ['Buy on Udemy', 'Buy on Coursera']) {
        const control = primaryCards(page).getByRole('button', { name: label, exact: true }).filter({ visible: true })
        await expectEqualPurchaseWidths(control, previewPaypal)
        await control.press('Enter')
    }
    await previewPaypal.press('Space')
    await expect(page.getByRole('status')).toHaveCount(3)
    await expect(page.locator('form,script[src*="paypal"]')).toHaveCount(0)
    await expect(primaryCards(page).getByRole('link', { name: /^Buy on (Udemy|Coursera)$/ })).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    expect(preview.requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
    expect(preview.errors).toEqual([])
})

test('second sales-page destinations deduplicate, reject unsafe links and obey the shared activation boundary', async ({ page }) => {
    for (const scenario of [
        { purchaseUrl: ' HTTPS://WWW.UDEMY.COM:443/course/synthetic-ai-product/ ', secondaryPurchaseUrl: 'https://www.udemy.com/course/synthetic-ai-product/', expected: [['Buy on Udemy', 'https://www.udemy.com/course/synthetic-ai-product/']] },
        { purchaseUrl: 'javascript:alert(1)', secondaryPurchaseUrl: courseSecondary, expected: [['Buy on Coursera', courseSecondary]] },
        { purchaseUrl: coursePrimary, secondaryPurchaseUrl: 'https://seller.example/\nunsafe', expected: [['Buy on Udemy', coursePrimary]] },
        { purchaseUrl: coursePrimary, secondaryPurchaseUrl: courseSecondary, purchaseActive: false, expected: [] },
    ]) {
        const state = await fixture(page, { ...scenario, styled: true })
        await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
        const links = primaryCards(page).getByRole('link', { name: /^Buy on (Udemy|Coursera)$/, exact: true })
        await expect(links).toHaveCount(scenario.expected.length)
        for (const [label, href] of scenario.expected) await expect(primaryCards(page).getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href)
        await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
        await expect(primaryCards(page).locator('form button').filter({ visible: true })).toHaveText('Buy via PayPal')
        await expect(page.getByText(courseTerms, { exact: true })).toBeVisible()
        await expect(page.getByText(/100% Guaranteed Satisfaction/)).toHaveCount(0)
        expect(state.errors).toEqual([])
    }
})

test('per-destination sales-page button text preserves safe URL order, fallback and inert preview', async ({ page }) => {
    const primary = 'https://apps.apple.com/gb/app/synthetic-dream-journal/id123456789'
    const secondary = 'https://www.nsso.me/sign-up'
    for (const scenario of [
        { purchaseUrl: primary, secondaryPurchaseUrl: secondary, purchaseLabel: 'Get my app', secondaryPurchaseLabel: 'Create a profile', expected: [['Get my app', primary], ['Create a profile', secondary]] },
        { purchaseUrl: primary, secondaryPurchaseUrl: secondary, purchaseLabel: '   ', secondaryPurchaseLabel: '', expected: [['Download on the App Store', primary], ['Sign up to nsso', secondary]] },
        { purchaseUrl: 'javascript:alert(1)', secondaryPurchaseUrl: secondary, purchaseLabel: 'Untrusted action', secondaryPurchaseLabel: 'Create a profile', expected: [['Create a profile', secondary]] },
        { purchaseUrl: secondary, secondaryPurchaseUrl: ' HTTPS://WWW.NSSO.ME:443/sign-up ', purchaseLabel: 'Primary signup', secondaryPurchaseLabel: 'Duplicate signup', expected: [['Primary signup', secondary]] },
        { purchaseUrl: primary, secondaryPurchaseUrl: secondary, purchaseLabel: 'Get my app', secondaryPurchaseLabel: 'Create a profile', purchaseActive: false, expected: [] },
    ]) {
        const state = await fixture(page, { ...scenario, styled: true })
        await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
        const links = primaryCards(page).locator('a[data-nsso-control="white"]').filter({ visible: true })
        expect((await links.allTextContents()).map(text => text.trim())).toEqual(scenario.expected.map(([label]) => label))
        for (const [label, url] of scenario.expected) await expect(primaryCards(page).getByRole('link', { name: label, exact: true }).filter({ visible: true })).toHaveAttribute('href', url)
        await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
        await expect(page.getByRole('link', { name: 'Untrusted action', exact: true })).toHaveCount(0)
        await expect(primaryCards(page).locator('form button').filter({ visible: true })).toHaveText('Buy via PayPal')
        expect(state.errors).toEqual([])

        const preview = await fixture(page, { ...scenario, search: '?preview=true', styled: true })
        await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
        for (const [label] of scenario.expected) await primaryCards(page).getByRole('button', { name: label, exact: true }).filter({ visible: true }).press('Enter')
        await expect(page.getByRole('status')).toHaveCount(scenario.expected.length)
        await expect(page.locator('form,a[href^="javascript:"]')).toHaveCount(0)
        expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
        expect(preview.errors).toEqual([])
    }
})

test('long custom sales-page button text wraps on narrow screens without changing its target or PayPal', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 844 })
    const label = 'A'.repeat(60)
    const target = 'https://seller.example.test/purchase'
    const state = await fixture(page, { purchaseUrl: target, purchaseLabel: label, styled: true })
    const link = primaryCards(page).getByRole('link', { name: label, exact: true }).filter({ visible: true })
    await expect(link).toHaveAttribute('href', target)
    await expect(link).toHaveText(label)
    await link.scrollIntoViewIfNeeded()
    expect(await link.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    const bounds = await link.boundingBox()
    expect(bounds.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(primaryCards(page).locator('form button').filter({ visible: true })).toHaveText('Buy via PayPal')
    await link.screenshot({ path: testInfo.outputPath('custom-sales-page-action-320.png') })
    expect(state.errors).toEqual([])
    const preview = await fixture(page, { purchaseUrl: target, purchaseLabel: label, search: '?preview=true', styled: true })
    const control = primaryCards(page).getByRole('button', { name: label, exact: true }).filter({ visible: true })
    await control.scrollIntoViewIfNeeded()
    expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await control.press('Space')
    await expect(page.getByRole('status')).toContainText('Checkout is disabled during profile preview')
    await expect(page.locator('form')).toHaveCount(0)
    expect(preview.errors).toEqual([])
})

test('course terms depend on a validated provider hostname while ordinary seller refund presentation is preserved', async ({ page }) => {
    for (const scenario of [
        { purchaseUrl: 'https://seller.example.test/course', secondaryPurchaseUrl: courseSecondary, course: true },
        { purchaseUrl: coursePrimary, secondaryPurchaseUrl: null, purchaseActive: false, course: true },
        { purchaseUrl: 'https://www.etsy.com/listing/synthetic', secondaryPurchaseUrl: null, course: false },
        { purchaseUrl: 'https://udemy.com.attacker.example/course', secondaryPurchaseUrl: 'https://seller.example.test/?site=coursera.org', course: false },
    ]) {
        await fixture(page, { ...scenario, styled: true })
        await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
        await expect(page.getByText(courseTerms, { exact: true })).toHaveCount(scenario.course ? 1 : 0)
        await expect(page.getByText(/100% Guaranteed Satisfaction/)).toHaveCount(scenario.course ? 0 : 1)
        await expect(page.getByRole('img', { name: 'Guarantee', exact: true })).toHaveCount(scenario.course ? 0 : 1)
    }
})

for (const purchaseUrl of ['javascript:alert(1)', 'https://seller.example.test/\nunsafe']) {
    test(`invalid sales-page purchase URL ${JSON.stringify(purchaseUrl)} remains guarded`, async ({ page }) => {
        const { errors } = await fixture(page, { purchaseUrl })
        await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
        await expect(page.getByRole('link', { name: /Buy on Etsy|Buy on Shopify|View purchase page/ })).toHaveCount(0)
        await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
        await expect(primaryCards(page).locator('form')).toHaveCount(2)
        for (const form of await page.locator('form').all()) await expect(form).toHaveAttribute('action', action)
        expect(errors).toEqual([])
    })
}

test('public product actions share white controls while merchant checkout and guarded destinations remain intact', async ({ page }, testInfo) => {
    const checkMaterial = async action => {
        await action.scrollIntoViewIfNeeded()
        await expect(action).toHaveAttribute('data-nsso-control', 'white')
        const material = await controlMaterial(action)
        expect(material.background).toBe('rgba(255, 255, 255, 0.28)')
        expect(material.backgroundImage).not.toBe('none')
        await expect(action).toHaveClass(/nsso-glass-control/)
        expect(await renderedControlContrast(action)).toBeGreaterThanOrEqual(4.5)
        const bounds = await action.boundingBox()
        // Mobile compositing may report 43.999992 for an exact 44 CSS px edge.
        expect(Number(bounds.height.toFixed(3))).toBeGreaterThanOrEqual(44)
        expect(Number(bounds.width.toFixed(3))).toBeGreaterThanOrEqual(44)
    }
    const { errors, requests } = await fixture(page, { styled: true, withTestimonials: true })
    expect(await page.evaluate(() => window.innerWidth)).toBe(page.viewportSize().width)
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    const purchase = primaryCards(page).getByRole('link', { name: 'View purchase page', exact: true }).filter({ visible: true })
    await checkMaterial(purchase)
    await expect(purchase).toHaveAttribute('href', product.purchase_link)
    await expect(purchase).toHaveAttribute('target', '_blank')
    await expect(purchase).toHaveAttribute('rel', 'noopener noreferrer')
    const merchant = primaryCards(page).locator('form button').filter({ visible: true })
    await expect(merchant).toHaveText('Buy via PayPal')
    await expect(merchant).toHaveCSS('background-color', 'rgb(255, 196, 57)')
    await expect(merchant).not.toHaveAttribute('data-nsso-control')
    await expect(merchant.locator('..')).toHaveAttribute('action', action)
    await expectEqualPurchaseWidths(purchase, merchant)
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

test('narrow product loading shows only progress while errors and not-found keep their safe exit', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const [state, options] of [
        ['loading', { deferPublic: true }], ['error', { failPublicOnce: true }], ['not-found', { published: false }],
    ]) {
        for (const verified of [false, true]) {
            const { releasePublic } = await fixture(page, { ...options, account: { user: verified ? { id: otherId } : null, loading: false, error: null }, search: '?preview=true&source=creator&next=https%3A%2F%2Funtrusted.example' })
            if (state === 'loading') await expect(page.getByRole('status')).toHaveText('Loading...')
            else if (state === 'error') await expect(page.getByRole('button', { name: 'Retry product', exact: true })).toBeVisible()
            else await expect(page.getByText('Product not found', { exact: true })).toBeVisible()
            const back = page.getByRole('button', { name: verified ? 'Back to profile editor' : 'Back to nsso', exact: true })
            await expect(page.locator('[data-mobile-nav-material]')).toHaveCount(0)
            await expect(page.getByRole('button', { name: 'Back to Sales Page Creator', exact: true })).toHaveCount(0)
            if (state === 'loading') {
                await expect(page.getByRole('button')).toHaveCount(0)
                expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
            } else {
                await expect(back).toBeVisible()
                await back.press('Enter')
                expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([verified ? '/dashboard' : '/'])
            }
            releasePublic()
        }
    }
    const { releasePublic } = await fixture(page, { deferPublic: true, account: { user: { id: ownerId }, loading: false, error: 'Synthetic unverified identity' } })
    await expect(page.getByRole('status')).toHaveText('Loading...')
    await expect(page.getByRole('button')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Back to profile editor', exact: true })).toHaveCount(0)
    releasePublic()
})

test('published checkout and public creator details load with expired persisted Auth and no session dependency', async ({ page }) => {
    const { requests, errors } = await fixture(page)
    await expect(page.getByRole('heading', { name: product.headline })).toBeVisible()
    await expect(primaryCards(page).locator('form')).toHaveCount(2)
    for (const form of await page.locator('form').all()) await expect(form).toHaveAttribute('action', action)
    await expect(primaryCards(page).getByRole('link', { name: 'View purchase page' })).toHaveCount(2)
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
    await expect(primaryCards(page).getByRole('link', { name: 'View purchase page' })).toHaveCount(0)
    await expect(primaryCards(page).getByRole('button', { name: 'Buy via PayPal', exact: true })).toHaveCount(2)
    await expect(page.getByText('Checkout is disabled during profile preview', { exact: true })).toHaveCount(0)
    for (const button of await primaryCards(page).getByRole('button', { name: 'Buy via PayPal', exact: true }).all()) {
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
    await expect(primaryCards(page).getByRole('button', { name: 'Buy via PayPal', exact: true })).toHaveCount(2)
    for (const button of await primaryCards(page).getByRole('button', { name: 'Buy via PayPal', exact: true }).all()) await expect(button).toBeEnabled()
    await expect(primaryCards(page).getByRole('button', { name: 'View purchase page', exact: true })).toHaveCount(2)
    await primaryCards(page).getByRole('button', { name: 'View purchase page', exact: true }).first().press('Enter')
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
    await expect(primaryCards(page).locator('form')).toHaveCount(2)
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

test('mobile closing CTA repeats only the actual image and enabled actions before the final nsso attribution', async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const amazon = 'https://www.amazon.co.uk/dp/B0SYNTHETIC?tag=fixture#details'
    const app = 'https://apps.apple.com/gb/app/synthetic/id123456789'
    const state = await fixture(page, { styled: true, imageUrl: '/fixture-product.svg', purchaseUrl: amazon, secondaryPurchaseUrl: app, withTestimonials: true, videoUrl: 'https://youtu.be/Synthetic12', valueProposition: 'A helpful outcome for one published offering.' })
    await expect(page.getByRole('link', { name: 'nsso.me/fixture-seller', exact: true })).toBeVisible()
    const closing = page.locator('[data-product-purchase-card="closing-mobile"]')
    const early = page.locator('[data-product-purchase-card="primary-mobile"]')
    const attribution = page.locator('footer[data-product-attribution]')
    for (const width of [320, 390, 767, 844]) {
        await page.setViewportSize({ width, height: width === 844 ? 390 : 844 })
        await expect(closing).toBeVisible()
        await expect(early).toBeVisible()
        const image = closing.getByRole('img', { name: product.name, exact: true })
        await expect(image).toHaveAttribute('src', '/fixture-product.svg')
        await expect(image).toHaveCSS('object-fit', 'cover')
        await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true)
        await expect(early.getByRole('img', { name: product.name, exact: true })).toHaveAttribute('src', '/fixture-product.svg')
        const imageBox = await image.boundingBox()
        expect(Math.abs(imageBox.width - imageBox.height)).toBeLessThanOrEqual(.1)
        await expect(closing.locator('h1,h2,h3,[data-product-purchase-support]')).toHaveCount(0)
        await expect(closing).not.toContainText(product.price)
        await expect(closing).not.toContainText(product.intro_text)
        await expect(closing).not.toContainText('A helpful outcome for one published offering.')
        const links = closing.getByRole('link')
        expect((await links.allTextContents()).map(text => text.trim())).toEqual(['Buy on Amazon', 'Download on the App Store'])
        for (const [label, href] of [['Buy on Amazon', amazon], ['Download on the App Store', app]]) {
            const link = closing.getByRole('link', { name: label, exact: true })
            await expect(link).toHaveAttribute('href', href)
            await expect(link).toHaveAttribute('target', '_blank')
            await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
            const box = await link.boundingBox()
            expect(Number(box.height.toFixed(2))).toBeGreaterThanOrEqual(44)
            expect(box.y).toBeGreaterThan(imageBox.y + imageBox.height)
        }
        await expect(closing.locator('form')).toHaveAttribute('action', action)
        await expect(closing.locator('form')).toHaveAttribute('method', 'post')
        await expect(closing.locator('form')).toHaveAttribute('target', '_top')
        await expect(closing.getByRole('button', { name: 'Buy via PayPal', exact: true })).toHaveCSS('background-color', 'rgb(255, 196, 57)')
        const bounds = await closing.boundingBox(), footer = await attribution.boundingBox()
        const video = await page.getByTitle('Product Video').boundingBox()
        const contact = await page.getByRole('heading', { name: 'Contact', exact: true }).boundingBox()
        expect(bounds.y).toBeGreaterThan(video.y + video.height)
        expect(bounds.y).toBeGreaterThan(contact.y + contact.height)
        expect(footer.y).toBeGreaterThan(bounds.y + bounds.height)
        expect(await attribution.evaluate(element => element === element.parentElement.lastElementChild)).toBe(true)
        await expect(attribution.getByRole('link')).toHaveText('Sales page created with nsso →')
        await expect(attribution.getByRole('link')).toHaveAttribute('href', '/')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await closing.scrollIntoViewIfNeeded()
    await page.screenshot({ path: testInfo.outputPath('mobile-closing-purchase-card.png'), fullPage: false })
    await page.setViewportSize({ width: 1024, height: 900 })
    await expect(closing).toBeHidden()
    await expect(page.locator('[data-product-purchase-card="primary-desktop"]')).toBeVisible()
    await expect(attribution).toBeVisible()
    expect(state.errors).toEqual([])
})

test('closing mobile CTA handles missing image and disabled purchase channels without inventing content', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    for (const scenario of [
        { imageUrl: '/fixture-product.svg', purchaseActive: false, paypalActive: false, image: true, links: 0, closing: 1 },
        { imageUrl: '', purchaseActive: true, paypalActive: false, image: false, links: 1, closing: 1 },
        { imageUrl: '', purchaseActive: false, paypalActive: false, image: false, links: 0, closing: 0 },
        { imageUrl: '', purchaseActive: true, purchaseUrl: 'javascript:alert(1)', secondaryPurchaseUrl: 'https://www.amazon.co.uk/dp/B0SYNTHETIC', paypalActive: false, image: false, links: 1, closing: 1 },
    ]) {
        const state = await fixture(page, { styled: true, ...scenario })
        await expect(page.getByRole('heading', { name: product.headline, exact: true })).toBeVisible()
        const closing = page.locator('[data-product-purchase-card="closing-mobile"]')
        await expect(closing).toHaveCount(scenario.closing)
        if (scenario.closing) {
            await expect(closing.getByRole('img')).toHaveCount(scenario.image ? 1 : 0)
            await expect(closing.getByRole('link')).toHaveCount(scenario.links)
            await expect(closing.locator('form')).toHaveCount(0)
            await expect(closing.locator('h1,h2,h3,[data-product-purchase-support]')).toHaveCount(0)
        }
        await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
        await expect(page.locator('footer[data-product-attribution]')).toBeVisible()
        expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
        expect(state.errors).toEqual([])
    }
})

test('both mobile purchase placements keep preview checkout inert with custom labels and safe independent PayPal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const target = 'https://www.amazon.co.uk/dp/B0SYNTHETIC'
    const state = await fixture(page, { styled: true, search: '?preview=true', imageUrl: '/fixture-product.svg', purchaseUrl: target, secondaryPurchaseUrl: 'https://www.nsso.me/sign-up', purchaseLabel: 'Read my book' })
    await expect(page.getByRole('heading', { name: product.headline, exact: true })).toBeVisible()
    for (const position of ['primary-mobile', 'closing-mobile']) {
        const card = page.locator('[data-product-purchase-card="' + position + '"]')
        await expect(card).toBeVisible()
        for (const label of ['Read my book', 'Sign up to nsso', 'Buy via PayPal']) {
            const button = card.getByRole('button', { name: label, exact: true })
            await expect(button).toHaveAttribute('type', 'button')
            await button.press('Enter')
        }
        await expect(card.getByRole('status')).toHaveCount(3)
    }
    await expect(page.locator('form,a[href="' + target + '"],script[src*="paypal"]')).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    expect(state.requests.some(request => request.path.startsWith('/auth/'))).toBe(false)
    expect(state.errors).toEqual([])
})

test('desktop benefits use normal-weight italics while headings retain emphasis and mobile copy is preserved', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const state = await fixture(page, { styled: true, benefits: ['**A clear outcome**', 'Includes: A concise guide'] })
    const benefit = page.getByText('A clear outcome', { exact: true })
    await expect(benefit).toHaveCSS('font-style', 'normal')
    await expect(benefit).toHaveCSS('font-weight', '510')
    await expect(page.getByText('Includes: A concise guide', { exact: true })).toHaveCSS('font-style', 'italic')
    await page.setViewportSize({ width: 1440, height: 900 })
    for (const text of ['A clear outcome', 'Includes: A concise guide']) {
        await expect(page.getByText(text, { exact: true })).toHaveCSS('font-style', 'italic')
        await expect(page.getByText(text, { exact: true })).toHaveCSS('font-weight', '400')
    }
    await expect(page.getByRole('heading', { name: product.headline, exact: true })).toHaveCSS('font-weight', '700')
    expect(state.errors).toEqual([])
})
