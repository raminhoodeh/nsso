import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const confirmation = 'Are you sure? All your profile data will be deleted from our database and will be lost forever'
let bundle, css

test.beforeAll(async () => {
    const candidates = ['src/components/layout/Header.tsx', 'src/components/layout/DashboardSidebar.tsx', 'src/components/layout/DeleteProfileDialog.tsx', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx']
        .flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
    css = compiler.build(candidates) + '\nbody{margin:0;background:#344956;color:white;font-family:Arial}main{padding:120px 24px}button{font:inherit}'
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://fixture.supabase.co"' },
        plugins: [{ name: 'profile-deletion-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/providers\/(?:UserProvider|UIProvider)|@\/components\/ui\/(?:Toast|tahoe-glass))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const usePathname=()=>"/dashboard";export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({push(){},prefetch(){}});'
                    : path === 'next/link' ? 'export default props=><a {...props}/>;'
                        : path === 'next/image' ? 'export default ({priority,fill,...props})=><img {...props}/>;'
                            : path.endsWith('supabase/client') ? 'export const createClient=()=>({auth:{signOut:async options=>{const response=await fetch("/fixture-signout",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(options)});if(window.fixtureUnmountOnSignout)window.unmountFixture();return{error:response.ok?null:new Error("Fixture provider unavailable")}}}});'
                                : path.endsWith('UserProvider') ? 'import{useSyncExternalStore}from"react";export const useUser=()=>({user:useSyncExternalStore(listener=>{window.fixtureSubscribers.add(listener);return()=>window.fixtureSubscribers.delete(listener)},()=>window.fixtureUser)});'
                                    : path.endsWith('UIProvider') ? 'export const useUI=()=>({setBackgroundDimmed(){}});'
                                        : path.endsWith('Toast') ? 'export const useToast=()=>({showToast(){}});'
                                            : 'import React from "react";import {TahoeGlassSurface} from "./src/components/ui/tahoe-glass/TahoeGlassSurface";export * from "./src/components/ui/tahoe-glass/index";export const TahoeBackdropHeader=({backdropEnabled,displacementProfile,materialLighting,...props})=><TahoeGlassSurface as="header" {...props}/>;export const TahoeBackdropSurface=({backdropEnabled,displacementProfile,materialLighting,...props})=><TahoeGlassSurface {...props}/>;',
            }))
        } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import{createRoot}from'react-dom/client';
            import Header from './src/components/layout/Header';import Sidebar from './src/components/layout/DashboardSidebar';
            import{TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
            import{stringToBase64URL}from'@supabase/ssr';
            window.fixtureSubscribers=new Set();window.fixtureUser=window.fixtureIdentity;
            window.setFixtureSession=id=>{const token=stringToBase64URL('{}')+'.'+stringToBase64URL(JSON.stringify({sub:id}))+'.signature';document.cookie='sb-fixture-auth-token='+('base64-'+stringToBase64URL(JSON.stringify({access_token:token,user:{id}})))+'; Path=/'};
            window.setFixtureSession(window.fixtureIdentity.id);
            window.switchFixtureAccount=next=>{window.fixtureUser=next;window.fixtureSubscribers.forEach(listener=>listener())};
            const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'layout-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            const app=createRoot(document.getElementById('root'));window.unmountFixture=()=>app.unmount();app.render(<TahoeGlassEngineContext.Provider value={fallback}><Header/><Sidebar/><main><h1>Synthetic private profile editor</h1></main></TahoeGlassEngineContext.Provider>);
        ` },
    })
    bundle = result.outputFiles[0].text
})

async function mount(page, { identity = {}, deleteStatus = 200, invalidReceipt = false, invalidIntent = false, errorCode, errorMessage = 'Fixture write unavailable', logoutStatus = 200, holdDelete, unmountOnSignout = false, deletionDisabled = false } = {}) {
    const records = { deletions: [], signouts: [], deleteStatus }
    const user = { id: 'qa-account', username: 'fixture', email: 'ordinary@example.invalid', user_type: 'standard', permissions: [], ...identity }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('https://nsso.test/**', async route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (path === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (path === '/api/profile') {
            const operationId = route.request().headers()['x-nsso-delete-intent']
            records.deletions.push({ method: route.request().method(), account: route.request().headers()['x-nsso-account'], operationId, body: route.request().postData() })
            if (holdDelete) await holdDelete
            return route.fulfill({ status: records.deleteStatus, contentType: 'application/json', body: JSON.stringify(records.deleteStatus === 200 ? { deleted: true, accountId: invalidReceipt ? 'another-account' : user.id, operationId: invalidIntent ? 'foreign-intent' : operationId } : { error: errorMessage, code: errorCode }) })
        }
        if (path === '/fixture-signout') {
            records.signouts.push(route.request().postDataJSON())
            return route.fulfill({ status: logoutStatus, contentType: 'application/json', body: '{}' })
        }
        if (path === '/') return route.fulfill({ contentType: 'text/html', body: '<h1>Public homepage fixture</h1>' })
        if (path === '/assets/nsso-logo.png') return route.fulfill({ path: root + 'public/assets/nsso-logo.png' })
        if (/\.png$/.test(path)) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="458" height="224"/>' })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script>' + (deletionDisabled ? 'window.process={env:{NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED:"false"}};' : '') + 'window.fixtureUnmountOnSignout=' + JSON.stringify(unmountOnSignout) + ';window.fixtureIdentity=' + JSON.stringify(user) + '</script><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/dashboard')
    return records
}

async function openConfirmation(page) {
    if (await page.getByRole('button', { name: 'Open account menu' }).isVisible()) {
        await page.getByRole('button', { name: 'Open account menu' }).click()
        await page.getByRole('dialog', { name: 'Menu', exact: true }).getByRole('button', { name: 'Delete my profile', exact: true }).click()
    } else await page.getByRole('button', { name: 'Delete my profile', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete my profile?', exact: true })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Menu', exact: true })).toHaveCount(0)
    return dialog
}

test('profile deletion uses a readable browser-native modal and cancellation never writes', async ({ page }, testInfo) => {
    if (testInfo.project.name.includes('mobile')) await page.setViewportSize({ width: 320, height: 568 })
    const records = await mount(page)
    const dialog = await openConfirmation(page)
    await expect(dialog.getByText(confirmation, { exact: true })).toBeVisible()
    expect(await dialog.evaluate(element => element.tagName === 'DIALOG' && element.matches(':modal'))).toBe(true)
    expect(await dialog.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(227, 231, 237)')
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused()
    const bounds = await dialog.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.viewportSize().height)
    await page.screenshot({ path: testInfo.outputPath('native-profile-deletion-confirmation.png') })
    if (testInfo.project.name.includes('mobile')) await page.screenshot({ path: root + `private/test-results/account-release-screenshots/${testInfo.project.name}-native-confirmation.png` })
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const menuTrigger = page.getByRole('button', { name: 'Open account menu' })
    await expect(await menuTrigger.isVisible() ? menuTrigger : page.getByRole('button', { name: 'Delete my profile', exact: true })).toBeFocused()
    await openConfirmation(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(records.deletions).toEqual([])
    expect(records.signouts).toEqual([])
})

test('confirmed deletion targets only the current account, clears its browser credentials, and leaves the private page', async ({ page }) => {
    const records = await mount(page)
    const dialog = await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).evaluate(button => { button.click(); button.click() })
    await expect(page).toHaveURL('https://nsso.test/')
    await expect(page.getByRole('heading', { name: 'Public homepage fixture' })).toBeVisible()
    expect(records.deletions).toEqual([{ method: 'DELETE', account: 'qa-account', operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), body: null }])
    expect(records.signouts).toEqual([])
    expect((await page.context().cookies()).some(cookie => cookie.name === 'sb-fixture-auth-token')).toBe(false)
})

test('a deletion failure keeps the account signed in and permits a deliberate retry', async ({ page }) => {
    const records = await mount(page, { deleteStatus: 503 })
    const dialog = await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Deletion could not be confirmed. Please try again.')
    await expect(dialog.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled()
    expect(records.signouts).toEqual([])
    await expect(page).toHaveURL('https://nsso.test/dashboard')
    records.deleteStatus = 200
    await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/')
    expect(records.deletions).toHaveLength(2)
    expect(records.deletions[1].operationId).toBe(records.deletions[0].operationId)
    expect(records.signouts).toEqual([])
})

test('a mismatched deletion receipt never logs out or redirects a different account', async ({ page }) => {
    const records = await mount(page, { invalidReceipt: true })
    const dialog = await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toBeVisible()
    expect(records.signouts).toEqual([])
    await expect(page).toHaveURL('https://nsso.test/dashboard')
})

test('an account replacement dismisses an in-flight deletion and cannot sign out the new identity', async ({ page }) => {
    let release
    const holdDelete = new Promise(resolve => { release = resolve })
    const records = await mount(page, { holdDelete })
    const dialog = await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect.poll(() => records.deletions.length).toBe(1)
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Deleting…', exact: true })).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await page.evaluate(() => window.switchFixtureAccount({ id: 'different-account', username: 'new-owner', email: 'new@example.invalid', permissions: [] }))
    await expect(dialog).toHaveCount(0)
    release()
    await expect(page).toHaveURL('https://nsso.test/dashboard')
    expect(records.signouts).toEqual([])
    expect(records.deletions).toEqual([{ method: 'DELETE', account: 'qa-account', operationId: expect.stringMatching(/^[0-9a-f-]{36}$/), body: null }])
})

test('an account replacement before confirmation cancels without deleting either identity', async ({ page }) => {
    const records = await mount(page)
    const dialog = await openConfirmation(page)
    await page.evaluate(() => window.switchFixtureAccount({ id: 'different-account', username: 'new-owner', email: 'new@example.invalid', permissions: [] }))
    await expect(dialog).toHaveCount(0)
    expect(records.deletions).toEqual([])
    expect(records.signouts).toEqual([])
})

test('a replacement cookie written while deletion waits is preserved even before user context updates', async ({ page }) => {
    let release
    const holdDelete = new Promise(resolve => { release = resolve })
    const records = await mount(page, { holdDelete })
    const dialog = await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect.poll(() => records.deletions.length).toBe(1)
    await page.evaluate(() => window.setFixtureSession('replacement-cookie-owner'))
    const before = await page.context().cookies()
    release()
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL('https://nsso.test/dashboard')
    expect(await page.context().cookies()).toEqual(before)
    expect(records.signouts).toEqual([])
})

test('unreadable local credentials stay untouched and expose a safe explicit homepage action after confirmed deletion', async ({ page }) => {
    await mount(page)
    await page.evaluate(() => { document.cookie='sb-fixture-auth-token=not-json; Path=/' })
    const before = await page.context().cookies()
    const dialog = await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Your profile and login account were deleted')
    await expect(dialog.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Return to homepage', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    expect(await page.context().cookies()).toEqual(before)
    await dialog.getByRole('button', { name: 'Return to homepage', exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/')
})

test('clearing a deleted account never waits for or calls an unavailable logout provider', async ({ page }) => {
    const records = await mount(page, { logoutStatus: 503 })
    await (await openConfirmation(page)).getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/')
    expect(records.signouts).toEqual([])
})

test('an already cleared browser session still leaves the deleted account editor', async ({ page }) => {
    const records = await mount(page)
    await page.evaluate(() => { document.cookie='sb-fixture-auth-token=; Max-Age=0; Path=/' })
    await (await openConfirmation(page)).getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/')
    expect(records.signouts).toEqual([])
})

test('a foreign deletion intent receipt never logs the current account out', async ({ page }) => {
    const records = await mount(page, { invalidIntent: true })
    const dialog = await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Deletion could not be confirmed. Please try again.')
    expect(records.signouts).toEqual([])
})

test('busy uploads and partial deletion explain what is pending without claiming success', async ({ page }) => {
    for (const [code, message] of [
        ['DELETION_NOT_READY', 'Account deletion is temporarily unavailable. No deletion was started. Please try again shortly.'],
        ['DELETE_BUSY', 'Account deletion has started; an image upload is still finishing. Retry to finish.'],
        ['DELETION_PENDING', 'Deletion is not complete yet. Some profile files may already have been removed. Please try again to finish deleting your profile and login account.'],
    ]) {
        const records = await mount(page, { deleteStatus: 409, errorCode: code })
        const dialog = await openConfirmation(page)
        await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
        await expect(dialog.getByRole('alert')).toHaveText(message)
        expect(records.signouts).toEqual([])
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    }
})

test('desktop-to-mobile transition retains the native dialog and the same uncertain deletion intent', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const records = await mount(page, { deleteStatus: 503 })
    const desktopDialog = await openConfirmation(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(desktopDialog).toBeVisible()
    await desktopDialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(desktopDialog.getByRole('alert')).toBeVisible()
    await desktopDialog.getByRole('button', { name: 'Close', exact: true }).click()
    records.deleteStatus = 200
    await (await openConfirmation(page)).getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page).toHaveURL('https://nsso.test/')
    expect(records.deletions[1].operationId).toBe(records.deletions[0].operationId)
})

test('MFA verification is actionable without weakening deletion or restoring an account security menu option', async ({ page }) => {
    const records = await mount(page, { deleteStatus: 403, errorCode: 'mfa_required' })
    const dialog = await openConfirmation(page)
    await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Verify your account with your authenticator')
    await expect(dialog.getByRole('link', { name: 'Verify my account', exact: true })).toHaveAttribute('href', '/dashboard/security?next=/dashboard')
    expect(records.signouts).toEqual([])
    await expect(page.getByText('Account security', { exact: true })).toHaveCount(0)
})

test('last-admin and shared-asset blockers give a useful reason rather than an endless retry message', async ({ page }) => {
    for (const errorMessage of [
        'Another administrator must remain before this account can be deleted.',
        'This account owns shared app assets. Please contact nsso before deleting it so shared content can be preserved.',
    ]) {
        const records = await mount(page, { deleteStatus: 409, errorCode: 'DELETE_BLOCKED', errorMessage })
        const dialog = await openConfirmation(page)
        await dialog.getByRole('button', { name: 'Yes', exact: true }).click()
        await expect(dialog.getByRole('alert')).toHaveText(errorMessage)
        expect(records.signouts).toEqual([])
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    }
})

test('Admin navigation requires both an eligible email and server-issued permission', async ({ page }, testInfo) => {
    for (const [email, permissions, visible] of [
        ['ordinary@example.invalid', ['nsso:admin'], false],
        ['raminhoodeh@gmail.com', [], false],
        ['raminhoodeh@gmail.com', ['nsso:admin'], true],
        ['troy@nsso.me', ['nsso:admin'], true],
    ]) {
        await mount(page, { identity: { email, permissions, user_type: 'admin' } })
        const menuTrigger = page.getByRole('button', { name: 'Open account menu' })
        if (await menuTrigger.isVisible()) await menuTrigger.click()
        await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(visible ? 1 : 0)
        await expect(page.getByText('Account security', { exact: true })).toHaveCount(0)
        if (email === 'troy@nsso.me' && testInfo.project.name.includes('mobile')) await page.screenshot({ path: root + `private/test-results/account-release-screenshots/${testInfo.project.name}-authorized-admin-menu.png` })
        if (await menuTrigger.isVisible()) await page.keyboard.press('Escape')
    }
})

test('the explicit disabled rollout flag hides deletion while leaving authorized Admin and ordinary navigation available', async ({ page }) => {
    const records = await mount(page, { deletionDisabled: true, identity: { email: 'raminhoodeh@gmail.com', permissions: ['nsso:admin'], user_type: 'admin' } })
    const menuTrigger = page.getByRole('button', { name: 'Open account menu' })
    if (await menuTrigger.isVisible()) await menuTrigger.click()
    await expect(page.getByRole('button', { name: 'Delete my profile', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toBeVisible()
    await expect(page.getByText('Account security', { exact: true })).toHaveCount(0)
    expect(records.deletions).toEqual([])
})
