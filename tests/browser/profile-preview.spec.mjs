import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const actor = '11111111-1111-4111-8111-111111111111'
let bundle
test.beforeAll(async () => {
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'preview-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|link)|@\/lib\/supabase\/client|@\/components\/(?:providers\/(?:UserProvider|ProfileProvider)|ui\/(?:Toast|CreateProfileButton|tahoe-glass)))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const useRouter=()=>window.fixtureRouter;'
                    : path === 'next/link' ? 'import React from "react";export default ({href,children,...props})=><a href={href} {...props}>{children}</a>;'
                        : path.endsWith('UserProvider') ? 'import {useSyncExternalStore} from "react";export const useUser=()=>useSyncExternalStore(window.fixtureSubscribe,()=>window.fixtureAccount);'
                            : path.endsWith('ProfileProvider') ? 'import {useSyncExternalStore} from "react";export const useProfile=()=>useSyncExternalStore(window.fixtureSubscribe,()=>window.fixtureProfile);'
                                : path.endsWith('Toast') ? 'export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});'
                                    : path.endsWith('CreateProfileButton') ? 'export default ()=>null;'
                                        : path.endsWith('tahoe-glass') ? 'import React from "react";export const TahoeGlassSurface=({as:Tag="div",children,href,role,tabIndex,onClick,onKeyDown,...props})=><Tag href={href} role={role} tabIndex={tabIndex} onClick={onClick} onKeyDown={onKeyDown} aria-label={props["aria-label"]} aria-pressed={props["aria-pressed"]}>{children}</Tag>;export const TahoeGlassButton=({children,onClick,disabled,...props})=><button onClick={onClick} disabled={disabled} aria-label={props["aria-label"]}>{children}</button>;'
                                            : 'export const createClient=()=>{throw new Error("Preview must reuse the current account/profile contracts")};' }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';import Preview from './src/app/preview/page';
            window.fixtureListeners=new Set();window.fixtureSubscribe=fn=>{window.fixtureListeners.add(fn);return()=>window.fixtureListeners.delete(fn)};
            window.fixtureRouter={push:path=>window.fixtureNavigation.push(path)};
            window.updatePreviewFixture=(account,profile)=>{if(account)window.fixtureAccount=account;if(profile)window.fixtureProfile=profile;window.fixtureListeners.forEach(fn=>fn())};
            window.fixtureRefreshes=0;window.fixtureNavigation=[];window.fixtureToasts=[];
            window.fixtureAccount={user:{id:'${actor}',username:'fixture'},loading:false,error:null,refreshUser:async()=>{window.fixtureRefreshes++}};
            window.fixtureProfile={profile:{user_id:'${actor}',full_name:'Fixture creator',headline:'Current draft headline',bio:'Current local bio',profile_pic_url:'/avatar.jpg'},links:[],contacts:[],experiences:[],qualifications:[],projects:[],products:[{id:'product-fixture',name:'Fixture offer',price:'£12',description:'Offering',sales_page_active:true,sales_page_published:true,purchase_link_active:true,purchase_link:'https://seller.example.test/pay',paypal_active:true,payment_config:{version:1,kind:'payment-form',action:'https://www.paypal.com/ncp/payment/AB12CD34EF56G',fields:[],label:'Buy fixture offer'}}],loading:false,mutationState:{status:'saved',message:''},refreshProfile:async()=>{window.fixtureRefreshes++},retryPending:async()=>{window.fixtureRefreshes++}};
            createRoot(document.getElementById('root')).render(<Preview/>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function fixture(page) {
    const errors = [], unexpected = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') { unexpected.push(url.origin); return route.abort() }
        return route.fulfill({ contentType: url.pathname.endsWith('.jpg') ? 'image/jpeg' : 'text/html', body: url.pathname.endsWith('.jpg') ? '' : '<div id="root"></div>' })
    })
    await page.goto('https://nsso.test/preview')
    await page.addScriptTag({ content: bundle })
    return { errors, unexpected }
}

test('profile preview uses autosaved content, shows no banner, and explains checkout only on an attempt', async ({ page }) => {
    const { errors, unexpected } = await fixture(page)
    await expect(page.getByRole('heading', { name: "I'm Fixture creator" })).toBeVisible()
    await expect(page.getByText('Current local bio')).toBeVisible()
    await expect(page.getByText('Profile preview — checkout is disabled. Unsaved changes are not yet public.', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Checkout is disabled during profile preview', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Link to Purchase', exact: true }).press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Checkout is disabled during profile preview' })).toHaveCount(1)
    await page.getByRole('button', { name: 'Buy fixture offer', exact: true }).press('Space')
    await expect(page.getByRole('status').filter({ hasText: 'Checkout is disabled during profile preview' })).toHaveCount(2)
    await expect(page.locator('form')).toHaveCount(0)
    await expect(page.locator('a[href="https://seller.example.test/pay"]')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Fixture offer' })).toHaveAttribute('href', '/products/product-fixture?preview=true')
    await page.getByRole('button', { name: "Show Fixture creator's QR code" }).press('Enter')
    await expect(page.getByRole('button', { name: "Show Fixture creator's profile photo" })).toHaveAttribute('aria-pressed', 'true')
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
    await expect.poll(() => page.evaluate(() => window.fixtureToasts)).toEqual([{ message: 'Your profile URL could not be copied. Please try again.', type: 'error' }])
})
