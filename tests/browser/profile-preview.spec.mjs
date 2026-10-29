import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const actor = '11111111-1111-4111-8111-111111111111'
let bundle, renderPublicProfile
test.beforeAll(async () => {
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
                                        : path.endsWith('tahoe-glass') ? 'import React from "react";export const TahoeGlassSurface=({as:Tag="div",children,href,role,tabIndex,onClick,onKeyDown,...props})=><Tag href={href} role={role} tabIndex={tabIndex} onClick={onClick} onKeyDown={onKeyDown} aria-label={props["aria-label"]} aria-pressed={props["aria-pressed"]}>{children}</Tag>;export const TahoeBackdropHeader=({children,...props})=><header>{children}</header>;export const TahoeGlassButton=({children,onClick,disabled,...props})=><button onClick={onClick} disabled={disabled} aria-label={props["aria-label"]}>{children}</button>;export const TahoeGlassDialog=({open,children,...props})=>open?<div role="dialog" aria-label={props["aria-label"]}>{children}</div>:null;'
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
    // chrome is omitted; ShinyLink and the real PayPal form remain intact.
    const publicResult = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'public-profile-synthetic-reads', setup(builder) {
            builder.onResolve({ filter: /^(?:@\/lib\/public-profile|next\/(?:headers|navigation|link)|@\/components\/(?:profile\/(?:ProfileGlassCard|ExpandableBio)|layout\/Header|logic\/QRScanHandler|analytics\/MetaPixelConsent|ui\/(?:tahoe-glass|ProfileQRCodeToggle|CreateProfileButton|AddToMyNssoButton)))$/ }, args => ({ path: args.path, namespace: 'public-fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'public-fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === '@/lib/public-profile' ? 'let profile;export const setPublicFixture=value=>{profile=value};export const loadPublicProfile=async()=>profile;export const loadPublicProfileMetadata=async()=>null;export const loadPublicProfileViewer=async()=>({viewer:null,connectionExists:false});'
                    : path === 'next/headers' ? 'export const cookies=async()=>({get:()=>undefined});'
                        : path === 'next/navigation' ? 'export const notFound=()=>{throw Error("Unexpected missing synthetic profile")};'
                            : path === 'next/link' ? 'export default({children,href,...props})=><a href={href} {...props}>{children}</a>;'
                                : path.endsWith('/tahoe-glass') ? 'export const TahoeGlassSurface=({as:Tag="div",children,href,target,rel,className,...props})=><Tag href={href} target={target} rel={rel} className={className} aria-label={props["aria-label"]}>{children}</Tag>;export const TahoeGlassButton=({children})=><button type="button">{children}</button>;'
                                    : path.endsWith('/ProfileGlassCard') ? 'export default({children})=><div>{children}</div>;'
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

for (const [store, purchaseUrl, label] of [
    ['Etsy', 'https://shop.etsy.com/listing/12345/synthetic?ref=nsso', 'Buy on Etsy'],
    ['Shopify', 'https://fixture-shop.myshopify.com/products/synthetic', 'Buy on Shopify'],
    ['generic', 'https://shop.example.test/synthetic', 'View purchase page'],
    ['lookalike', 'https://etsy.com.evil.example.test/synthetic', 'View purchase page'],
]) test(`${store} public profile renders the store label and exact safe native purchase link`, async ({ page }) => {
    const html = await renderPublicProfile(purchaseUrl), unexpected = []
    await page.route('**/*', route => {
        if (route.request().url() !== 'https://nsso.test/public-profile') { unexpected.push(route.request().url()); return route.abort() }
        return route.fulfill({ contentType: 'text/html', body: html })
    })
    await page.goto('https://nsso.test/public-profile')
    const purchase = page.getByRole('link', { name: `${label}: Fixture offer`, exact: true })
    await expect(purchase).toHaveText(label)
    await expect(purchase).toHaveAttribute('href', purchaseUrl)
    await expect(purchase).toHaveAttribute('target', '_blank')
    await expect(purchase).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(page.getByRole('button', { name: 'Buy fixture offer', exact: true })).toBeVisible()
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

async function fixture(page, { purchaseUrl = 'https://seller.example.test/pay' } = {}) {
    const errors = [], unexpected = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') { unexpected.push(url.origin); return route.abort() }
        return route.fulfill({ contentType: url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'text/html', body: url.pathname.endsWith('.jpg') ? '' : '<div id="root"></div>' })
    })
    await page.goto('https://nsso.test/preview')
    await page.evaluate(value => { window.fixturePurchaseUrl = value }, purchaseUrl)
    await page.addScriptTag({ content: bundle })
    return { errors, unexpected }
}

for (const [store, purchaseUrl, label] of [
    ['Etsy', 'https://etsy.com/listing/12345/synthetic', 'Buy on Etsy'],
    ['Shopify', 'https://fixture-shop.myshopify.com/products/synthetic', 'Buy on Shopify'],
    ['generic', 'https://shop.example.test/synthetic', 'View purchase page'],
]) test(`${store} profile-preview labels remain inert for external purchase and PayPal attempts`, async ({ page }) => {
    const { errors, unexpected } = await fixture(page, { purchaseUrl })
    const purchase = page.getByRole('button', { name: label, exact: true })
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
