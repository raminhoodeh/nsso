import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { expectOpaqueLightPanel, minimumTextContrast } from './helpers/light-panel-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const actor = '11111111-1111-4111-8111-111111111111'
let bundle, renderPublicProfile, publicCss
test.beforeAll(async () => {
    const files = ['src/app/[username]/page.tsx', 'src/app/preview/page.tsx', 'src/components/profile/profileLayout.ts', 'src/components/profile/ProfileGlassCard.tsx', 'src/components/layout/Header.tsx', 'src/components/layout/NssoTopBar.tsx', 'src/components/ui/ProfileQRCodeToggle.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-panel.ts', 'src/components/ui/PreviewCheckoutButton.tsx', 'src/components/ui/PayPalSmartButton.tsx']
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
    publicCss = compiler.build(candidates) + '\nbody{margin:0;background:#43628c;color:white;font-family:Arial}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'preview-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/(?:providers\/(?:UserProvider|ProfileProvider)|ui\/(?:Toast|CreateProfileButton|tahoe-glass)))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const useRouter=()=>window.fixtureRouter;export const usePathname=()=>"/preview";export const useSearchParams=()=>new URLSearchParams();'
                    : path === 'next/image' ? 'export default ({priority,fill,...props})=><img {...props}/>;'
                    : path === 'next/link' ? 'import React from "react";export default ({href,children,onClick,...props})=><a href={href} {...props} onClick={event=>{onClick?.(event);if(!event.defaultPrevented){event.preventDefault();window.fixtureRouter.push(href)}}}>{children}</a>;'
                        : path.endsWith('UserProvider') ? 'import {useSyncExternalStore} from "react";export const useUser=()=>useSyncExternalStore(window.fixtureSubscribe,()=>window.fixtureAccount);'
                            : path.endsWith('ProfileProvider') ? 'import {useSyncExternalStore} from "react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,()=>window.fixtureProfile);'
                                : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});'
                                    : path.endsWith('CreateProfileButton') ? 'export default ()=>null;'
                                        : path.endsWith('tahoe-glass') ? 'import React from "react";export const TahoeGlassSurface=({as:Tag="div",children,href,role,tabIndex,onClick,onKeyDown,className,contentClassName,style,...props})=><Tag href={href} role={role} tabIndex={tabIndex} onClick={onClick} onKeyDown={onKeyDown} className={className} style={style} aria-label={props["aria-label"]} aria-pressed={props["aria-pressed"]}><div className={contentClassName}>{children}</div></Tag>;export const TahoeBackdropHeader=({children,className,style})=><header className={className} style={style}>{children}</header>;export const TahoeGlassButton=({children,onClick,disabled,...props})=><button onClick={onClick} disabled={disabled} aria-label={props["aria-label"]}>{children}</button>;export const TahoeGlassDialog=({open,children,...props})=>open?<div role="dialog" aria-label={props["aria-label"]}>{children}</div>:null;'
                                            : 'export const createClient=()=>({auth:{signOut:async()=>{window.fixtureAuthCalls++;return{error:null}}}});' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';import Preview from './src/app/preview/page';
            window.fixtureListeners=new Set();window.fixtureSubscribe=fn=>{window.fixtureListeners.add(fn);return()=>window.fixtureListeners.delete(fn)};
            window.fixtureRouter={push:path=>window.fixtureNavigation.push(path),prefetch(){}};
            window.updatePreviewFixture=(account,profile)=>{if(account)window.fixtureAccount=account;if(profile)window.fixtureProfile=profile;window.fixtureListeners.forEach(fn=>fn())};
            window.fixtureRefreshes=0;window.fixtureNavigation=[];window.fixtureToasts=[];window.fixtureAuthCalls=0;
            window.fixtureAccount={user:{id:'${actor}',username:'fixture'},loading:false,error:null,refreshUser:async()=>{window.fixtureRefreshes++}};
            window.fixtureProfile={profile:{user_id:'${actor}',full_name:'Fixture creator',headline:'Current draft headline',bio:'Current local bio',profile_pic_url:'/avatar.jpg'},links:[],contacts:[],experiences:[],qualifications:[],projects:[],products:[{id:'product-fixture',name:'Fixture offer',price:'£12',description:'Offering',sales_page_active:true,sales_page_published:true,purchase_link_active:true,purchase_link:window.fixturePurchaseUrl,paypal_active:true,payment_config:{version:1,kind:'payment-form',action:'https://www.paypal.com/ncp/payment/AB12CD34EF56G',fields:[],label:'Buy fixture offer'}}],loading:false,mutationState:{status:'saved',message:''},refreshProfile:async()=>{window.fixtureRefreshes++},retryPending:async()=>{window.fixtureRefreshes++}};
            createRoot(document.getElementById('root')).render(<Preview/>);
        ` } })
    bundle = result.outputFiles[0].text
    // Render the actual server profile route with synthetic reads. Client-only
    // chrome is omitted; native purchase actions and the real PayPal form remain intact.
    const publicResult = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'public-profile-synthetic-reads', setup(builder) {
            builder.onResolve({ filter: /^(?:@\/lib\/public-profile|next\/(?:headers|navigation|link)|@\/components\/(?:profile\/(?:ProfileGlassCard|ExpandableBio)|layout\/Header|logic\/QRScanHandler|analytics\/MetaPixelConsent|ui\/(?:tahoe-glass|ProfileQRCodeToggle|CreateProfileButton|AddToMyNssoButton)))$/ }, args => ({ path: args.path, namespace: 'public-fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'public-fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === '@/lib/public-profile' ? 'let profile;export const setPublicFixture=value=>{profile=value};export const loadPublicProfile=async()=>profile;export const loadPublicProfileMetadata=async()=>null;export const loadPublicProfileViewer=async()=>({viewer:null,connectionExists:false});'
                    : path === 'next/headers' ? 'export const cookies=async()=>({get:()=>undefined});'
                        : path === 'next/navigation' ? 'export const notFound=()=>{throw Error("Unexpected missing synthetic profile")};'
                            : path === 'next/link' ? 'export default({children,href,...props})=><a href={href} {...props}>{children}</a>;'
                                : path.endsWith('/tahoe-glass') ? 'export const TahoeGlassSurface=({as:Tag="div",children,href,target,rel,className,contentClassName,style,...props})=><Tag href={href} target={target} rel={rel} className={className} style={style} aria-label={props["aria-label"]}><div className={contentClassName}>{children}</div></Tag>;export const TahoeGlassButton=({children})=><button type="button">{children}</button>;'
                                    : path.endsWith('/ProfileGlassCard') ? 'export default({children,className,style})=><div className={className} style={style}>{children}</div>;'
                                        : path.endsWith('/ExpandableBio') ? 'export default({text})=><p>{text}</p>;'
                                            : 'export default()=>null;' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import{renderToStaticMarkup}from'react-dom/server';import PublicProfile from'./src/app/[username]/page';import{setPublicFixture}from'@/lib/public-profile';
            export async function render(purchaseUrl){setPublicFixture({user:{id:'${actor}',username:'fixture-public',is_premium:true},profile:{user_id:'${actor}',full_name:'Fixture creator',headline:'Synthetic public profile',bio:'Synthetic public bio',profile_pic_url:null},links:[],contacts:[],experiences:[],qualifications:[],projects:[],products:[{id:'product-fixture',name:'Fixture offer',price:'GBP 12',description:'Synthetic public offering',sales_page_active:false,sales_page_published:false,purchase_link_active:true,purchase_link:purchaseUrl,paypal_active:true,payment_config:{version:1,kind:'payment-form',action:'https://www.paypal.com/ncp/payment/AB12CD34EF56G',fields:[],label:'Buy fixture offer'}}]});return renderToStaticMarkup(await PublicProfile({params:Promise.resolve({username:'fixture-public'})}));}
        ` } })
    const fixtureModule = { exports: {} }
    new Function('require', 'module', 'exports', publicResult.outputFiles[0].text)(createRequire(root + 'package.json'), fixtureModule, fixtureModule.exports)
    renderPublicProfile = fixtureModule.exports.render
})

async function expectOneLineWhitePurchase(page, purchase) {
    await purchase.scrollIntoViewIfNeeded()
    await expect(purchase).toHaveAttribute('data-nsso-control', 'white')
    const background = await page.evaluate(() => document.body.style.background)
    try { await expectOpaqueLightPanel(page, purchase) }
    finally { await page.evaluate(value => { document.body.style.background = value }, background) }
    const text = purchase.locator('[data-light-button-content]')
    expect(await minimumTextContrast(text)).toBeGreaterThanOrEqual(4.5)
    const geometry = await text.evaluate(element => {
        const rectangles = [], walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent.trim()) continue
            const range = document.createRange(); range.selectNodeContents(node)
            for (const rectangle of range.getClientRects()) if (rectangle.width && rectangle.height) rectangles.push({ top: Math.round(rectangle.top * 1000) / 1000, left: rectangle.left, right: rectangle.right })
        }
        const target = element.closest('a,button').getBoundingClientRect()
        const context = document.createElement('canvas').getContext('2d')
        context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1)
        return { lines: [...new Set(rectangles.map(rectangle => rectangle.top))], textLeft: Math.min(...rectangles.map(rectangle => rectangle.left)), textRight: Math.max(...rectangles.map(rectangle => rectangle.right)), left: target.left, right: target.right, width: target.width, height: target.height, ink: [...context.getImageData(0, 0, 1, 1).data] }
    })
    expect(geometry.lines).toHaveLength(1)
    expect(Number(geometry.width.toFixed(3))).toBeGreaterThanOrEqual(44)
    expect(Number(geometry.height.toFixed(3))).toBeGreaterThanOrEqual(44)
    expect(geometry.textLeft).toBeGreaterThanOrEqual(geometry.left - .001)
    expect(geometry.textRight).toBeLessThanOrEqual(geometry.right + .001)
    expect(Math.max(...geometry.ink.slice(0, 3))).toBeLessThan(100)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

for (const [store, purchaseUrl, label] of [
    ['Etsy', 'https://shop.etsy.com/listing/12345/synthetic?ref=nsso', 'Buy on Etsy'],
    ['Shopify', 'https://fixture-shop.myshopify.com/products/synthetic', 'Buy on Shopify'],
    ['generic', 'https://shop.example.test/synthetic', 'View purchase page'],
    ['lookalike', 'https://etsy.com.evil.example.test/synthetic', 'View purchase page'],
]) test(`${store} public profile renders the store label and exact safe native purchase link`, async ({ page }, testInfo) => {
    const html = await renderPublicProfile(purchaseUrl), unexpected = []
    await page.route('**/*', route => {
        if (route.request().url() !== 'https://nsso.test/public-profile') { unexpected.push(route.request().url()); return route.abort() }
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1">' + html })
    })
    await page.goto('https://nsso.test/public-profile')
    await page.addStyleTag({ content: publicCss })
    expect(await page.evaluate(() => innerWidth)).toBe(page.viewportSize().width)
    const purchase = page.getByRole('link', { name: `${label}: Fixture offer`, exact: true })
    await expect(purchase).toHaveText(label)
    await expect(purchase).toHaveAttribute('href', purchaseUrl)
    await expect(purchase).toHaveAttribute('target', '_blank')
    await expect(purchase).toHaveAttribute('rel', 'noopener noreferrer')
    await expectOneLineWhitePurchase(page, purchase)
    await purchase.screenshot({ path: testInfo.outputPath('public-purchase-cta.png') })
    const merchant = page.getByRole('button', { name: 'Buy fixture offer', exact: true })
    await expect(merchant).toBeVisible()
    await expect(merchant).toHaveCSS('background-color', 'rgb(255, 196, 57)')
    await expect(merchant).not.toHaveAttribute('data-nsso-control')
    await expect(page.locator('form')).toHaveAttribute('action', 'https://www.paypal.com/ncp/payment/AB12CD34EF56G')
    await expect(page.locator('script[src*="paypal"]')).toHaveCount(0)
    expect(unexpected).toEqual([])
})

test('invalid public profile purchase URL remains non-executable while PayPal form stays unchanged', async ({ page }) => {
    const html = await renderPublicProfile('javascript:alert(1)')
    await page.setContent(html)
    await expect(page.getByRole('link', { name: /^(?:Buy on Etsy|Buy on Shopify|View purchase page): Fixture offer$/ })).toHaveCount(0)
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
    await expect(page.locator('form')).toHaveAttribute('action', 'https://www.paypal.com/ncp/payment/AB12CD34EF56G')
})

async function fixture(page, { purchaseUrl = 'https://seller.example.test/pay', styled = false } = {}) {
    const errors = [], unexpected = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') { unexpected.push(url.origin); return route.abort() }
        return route.fulfill({ contentType: url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'text/html', body: url.pathname.endsWith('.jpg') ? '' : (styled ? '<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div>' : '<div id="root"></div>') })
    })
    await page.goto('https://nsso.test/preview')
    if (styled) await page.addStyleTag({ content: publicCss })
    await page.evaluate(value => { window.fixturePurchaseUrl = value }, purchaseUrl)
    await page.addScriptTag({ content: bundle })
    return { errors, unexpected }
}

for (const [store, purchaseUrl, label] of [
    ['Etsy', 'https://etsy.com/listing/12345/synthetic', 'Buy on Etsy'],
    ['Shopify', 'https://fixture-shop.myshopify.com/products/synthetic', 'Buy on Shopify'],
    ['generic', 'https://shop.example.test/synthetic', 'View purchase page'],
]) test(`${store} profile-preview labels remain inert for external purchase and PayPal attempts`, async ({ page }, testInfo) => {
    const { errors, unexpected } = await fixture(page, { purchaseUrl, styled: true })
    expect(await page.evaluate(() => innerWidth)).toBe(page.viewportSize().width)
    const purchase = page.getByRole('button', { name: label, exact: true })
    await expectOneLineWhitePurchase(page, purchase)
    await purchase.screenshot({ path: testInfo.outputPath('preview-purchase-cta.png') })
    await purchase.press('Enter')
    await expect(page.getByRole('status')).toHaveText('Checkout is disabled during profile preview')
    await page.getByRole('button', { name: 'Buy fixture offer', exact: true }).press('Space')
    await expect(page.getByRole('status')).toHaveCount(2)
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('a').filter({ hasText: label })).toHaveCount(0)
    await expect(page.locator('script[src*="paypal"]')).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
    expect(await page.evaluate(() => window.fixtureAuthCalls)).toBe(0)
    expect(errors).toEqual([])
    expect(unexpected).toEqual([])
})

test('invalid profile-preview purchase URLs expose no executable purchase action', async ({ page }) => {
    const { errors, unexpected } = await fixture(page, { purchaseUrl: 'javascript:alert(1)' })
    await expect(page.getByRole('heading', { name: "I'm Fixture creator" })).toBeVisible()
    await expect(page.getByRole('button', { name: /Buy on Etsy|Buy on Shopify|View purchase page/ })).toHaveCount(0)
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0)
    await expect(page.locator('form')).toHaveCount(0)
    expect(errors).toEqual([])
    expect(unexpected).toEqual([])
})

test('profile preview uses autosaved content, shows no banner, and explains checkout only on an attempt', async ({ page }) => {
    const { errors, unexpected } = await fixture(page)
    await expect(page.getByRole('navigation', { name: 'Profile preview' })).toBeVisible()
    await expect(page.getByRole('heading', { name: "I'm Fixture creator" })).toBeVisible()
    await expect(page.getByText('Current local bio')).toBeVisible()
    await expect(page.getByText('Profile preview — checkout is disabled. Unsaved changes are not yet public.', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Checkout is disabled during profile preview', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'View purchase page', exact: true }).press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Checkout is disabled during profile preview' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Buy fixture offer', exact: true }).press('Space')
    await expect(page.getByRole('status').filter({ hasText: 'Checkout is disabled during profile preview' })).toHaveCount(2)
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('a[href="https://seller.example.test/pay"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Fixture offer' })).toHaveAttribute('href', '/products/product-fixture?preview=true')
    await page.getByRole('button', { name: "Show Fixture creator's QR code" }).press('Enter')
    await expect(page.getByRole('button', { name: "Show Fixture creator's profile photo" })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Open account menu', exact: true }).press('Enter')
    await page.getByRole('link', { name: 'Edit Profile', exact: true }).press('Enter')
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual(['/dashboard?view=profile'])
    expect(await page.evaluate(() => window.fixtureAuthCalls)).toBe(0)
    expect(errors).toEqual([]); expect(unexpected).toEqual([])
})

test('preview follows account/profile changes and never shows a prior account during verification', async ({ page }) => {
    await fixture(page)
    await expect(page.getByText('Current local bio')).toBeVisible()
    await page.evaluate(() => window.updatePreviewFixture({ ...window.fixtureAccount, user: null, loading: true }, { ...window.fixtureProfile, loading: true }))
    await expect(page.getByText('Current local bio')).toHaveCount(0)
    await page.evaluate(() => window.updatePreviewFixture({ ...window.fixtureAccount, user: { id: 'other-actor', username: 'other' }, loading: false }, { ...window.fixtureProfile, loading: false, profile: { user_id: 'other-actor', full_name: 'Other creator', bio: 'Other draft' }, products: [] }))
    await expect(page.getByText('Other draft')).toBeVisible()
    await expect(page.getByText('Current local bio')).toHaveCount(0)
})

test('missing profile and account verification errors offer recovery instead of a hung preview', async ({ page }) => {
    await fixture(page)
    await page.evaluate(() => window.updatePreviewFixture(null, { ...window.fixtureProfile, profile: null, mutationState: { status: 'failed', message: 'Your profile could not be refreshed. Your draft has been kept.' } }))
    await expect(page.getByRole('button', { name: 'Retry preview', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Retry preview', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureRefreshes)).toBeGreaterThan(0)
    await page.evaluate(() => window.updatePreviewFixture({ ...window.fixtureAccount, user: null, error: 'Account unavailable' }))
    await expect(page.getByRole('button', { name: 'Retry preview', exact: true })).toBeVisible()
    expect(await page.evaluate(() => window.fixtureNavigation)).toEqual([])
})

test('clipboard failures are reported without a false success toast', async ({ page }) => {
    await fixture(page)
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Synthetic denied clipboard') } } }))
    await page.getByRole('button', { name: 'Copy page URL', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureToasts)).toEqual([{ message: 'Could not copy the profile URL. Please try again.', type: 'error' }])
})
