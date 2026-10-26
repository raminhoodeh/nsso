import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'account-journey-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/ui\/Toast|@\/components\/auth\/WalletLogin|@\/components\/providers\/(?:UserProvider|ProfileProvider)|@\/components\/layout\/Header|@\/components\/profile\/ProfileSaveStatus|@\/app\/dashboard\/components\/(?:AdvancedModeCard|EarningsTab))$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const useRouter=()=>window.fixtureRouter; export const useSearchParams=()=>new URLSearchParams(location.search);' :
                path === 'next/image' ? 'export default function Image({fill,unoptimized,priority,...props}){return <img {...props}/>;}' :
                path === 'next/link' ? 'export default function Link(props){return <a {...props}/>;}' :
                path.endsWith('/supabase/client') ? 'export const createClient=()=>window.fixtureSupabase;' :
                path.endsWith('/Toast') ? 'export const useToast=()=>({showToast:(text)=>window.fixtureToasts.push(text)});' :
                path.endsWith('/UserProvider') ? `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.addEventListener('fixture-account',fn);return()=>window.removeEventListener('fixture-account',fn)};export const useUser=()=>useSyncExternalStore(subscribe,()=>window.fixtureAccount);` :
                path.endsWith('/ProfileProvider') ? `import {useSyncExternalStore} from 'react';const subscribe=fn=>{window.addEventListener('fixture-profile',fn);return()=>window.removeEventListener('fixture-profile',fn)};export const useProfile=()=>useSyncExternalStore(subscribe,()=>window.fixtureProfile);` :
                'export default function OptionalFixture(){return null;}'
            }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react'; import {createRoot} from 'react-dom/client';
            import SignIn from './src/app/sign-in/page'; import SignUp from './src/app/sign-up/page';
            import Reset from './src/app/reset-password/page'; import SetPassword from './src/app/set-password/page';
            import Security from './src/app/dashboard/security/page'; import Dashboard from './src/app/dashboard/page';
            window.fixtureCalls=[];window.fixtureNavigation=[];window.fixtureToasts=[];window.fixtureMode=window.fixtureInitialMode || 'ok';window.fixtureSession=false;
            window.fixtureRouter={push:path=>window.fixtureNavigation.push(path),replace:path=>window.fixtureNavigation.push(path),refresh:()=>{}};
            const account=owner=>({user:{id:owner,username:owner,is_premium:true},loading:false,error:null,refreshUser:async()=>{}});
            window.fixtureAccount=account('actor-a');
            const profile=owner=>({profile:{user_id:owner,full_name:owner,headline:owner+' headline',bio:owner+' bio',profile_pic_url:null},links:[],contacts:[],loading:false,refreshProfile:async()=>{},patchProfile:async()=>true,updateField:async()=>true,updateLink:async(id,field,value)=>{window.fixtureProfile={...window.fixtureProfile,links:window.fixtureProfile.links.map(row=>row.id===id?{...row,[field]:value}:row)};window.dispatchEvent(new Event('fixture-profile'));return true;}});
            window.fixtureProfile=profile('actor-a');
            window.fixtureChangeAccount=owner=>{window.fixtureAccount=account(owner);window.fixtureProfile=profile(owner);window.dispatchEvent(new Event('fixture-account'));window.dispatchEvent(new Event('fixture-profile'));};
            async function call(name,args){
                window.fixtureCalls.push({name,args});
                if(window.fixtureMode==='throw')throw Error('PRIVATE_AUTH_DIAGNOSTIC');
                if(window.fixtureMode==='hold')await new Promise(resolve=>window.fixtureRelease=resolve);
                if(window.fixtureMode==='error')return {data:{user:null},error:{message:'Check your sign-in details.'}};
                if(name==='listFactors')return {data:{all:[],totp:[]},error:null};
                if(name==='getAuthenticatorAssuranceLevel')return {data:{currentLevel:'aal1'},error:null};
                if(name==='enroll')return {data:{id:'unverified-fixture-factor',totp:{qr_code:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',secret:'SYNTHETIC_SETUP_KEY'}},error:null};
                return {data:{user:{id:'actor-a'},session:window.fixtureSession?{user:{id:'actor-a'}}:null},error:null};
            }
            window.fixtureSupabase={auth:{signInWithPassword:args=>call('signInWithPassword',args),signInWithOAuth:args=>call('signInWithOAuth',args),signUp:args=>call('signUp',args),resetPasswordForEmail:(email,args)=>call('resetPasswordForEmail',{email,...args}),getUser:()=>call('getUser'),setSession:args=>call('setSession',args),updateUser:args=>call('updateUser',args),signOut:args=>call('signOut',args),mfa:{listFactors:()=>call('listFactors'),getAuthenticatorAssuranceLevel:()=>call('getAuthenticatorAssuranceLevel'),enroll:args=>call('enroll',args),unenroll:args=>call('unenroll',args),challengeAndVerify:args=>call('challengeAndVerify',args)}},rpc:(name,args)=>call(name,args),from(){throw Error('Dashboard must use its scoped providers, not duplicate raw account/profile reads');}};
            const pages={'/sign-in':SignIn,'/sign-up':SignUp,'/reset-password':Reset,'/set-password':SetPassword,'/dashboard/security':Security,'/dashboard':Dashboard};
            const Page=pages[location.pathname];createRoot(document.getElementById('root')).render(<Page/>);
        ` },
    })
    bundle = result.outputFiles[0].text
})

async function fixture(page, path, initialMode = 'ok') {
    const requests = []
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.hostname === 'nsso.test' && !url.pathname.startsWith('/api/')) return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
        if (url.pathname.startsWith('/api/')) {
            requests.push({ path: url.pathname, method: route.request().method(), body: route.request().postData() })
            if (url.pathname === '/api/check-username') return route.fulfill({ json: { available: true } })
            return route.fulfill({ json: { connections: [] } })
        }
        throw new Error('Unexpected nonlocal request in isolated account fixture: ' + url.origin)
    })
    await page.goto('https://nsso.test' + path)
    await page.evaluate(mode => { window.fixtureInitialMode = mode }, initialMode)
    await page.addScriptTag({ content: bundle })
    return requests
}
async function credentials(page, signup = false) {
    await page.getByRole('textbox', { name: 'Email address', exact: true }).fill('fixture@example.invalid')
    await page.getByLabel('Password', { exact: true }).fill('Synthetic-valid-password1!')
    if (signup) await page.getByLabel('Confirm password', { exact: true }).fill('Synthetic-valid-password1!')
}

test('password sign-in honors the protected destination and exposes accessible autofill fields', async ({ page }) => {
    await fixture(page, '/sign-in?next=%2Fdashboard%2Fsecurity%3Fnext%3D%252Fadmin')
    await credentials(page)
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('autocomplete', 'current-password')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureNavigation)).toEqual(['/dashboard/security?next=%2Fadmin'])
})

test('OAuth and email confirmation preserve the requested free URL without claiming it', async ({ page }) => {
    await fixture(page, '/sign-up?name=My_Profile')
    await expect(page.getByText('Check availability and save it after signing in.')).toBeVisible()
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click()
    let args = await page.evaluate(() => window.fixtureCalls.find(call => call.name === 'signInWithOAuth').args)
    expect(new URL(args.options.redirectTo).searchParams.get('next')).toBe('/dashboard?claim=my_profile')
    await credentials(page, true)
    await page.getByRole('button', { name: 'Create Account', exact: true }).click()
    args = await page.evaluate(() => window.fixtureCalls.find(call => call.name === 'signUp').args)
    expect(new URL(args.options.emailRedirectTo).searchParams.get('next')).toBe('/dashboard?claim=my_profile')
    expect(await page.evaluate(() => window.fixtureNavigation.at(-1))).toBe('/sign-in?next=%2Fdashboard%3Fclaim%3Dmy_profile')
    expect(await page.evaluate(() => window.fixtureCalls.some(call => call.name.includes('claim')))).toBe(false)
})

test('an immediate signup session enters the intended dashboard instead of falsely requesting email confirmation', async ({ page }) => {
    await fixture(page, '/sign-up?name=free_profile')
    await page.evaluate(() => { window.fixtureSession = true })
    await credentials(page, true)
    await page.getByRole('button', { name: 'Create Account', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureNavigation)).toEqual(['/dashboard?claim=free_profile'])
    expect(await page.evaluate(() => window.fixtureToasts)).not.toContain('Check your email to confirm your account!')
})

for (const path of ['/sign-in', '/sign-up', '/reset-password']) test(`${path} transport failure preserves fields and enables a truthful retry`, async ({ page }) => {
    await fixture(page, path)
    if (path === '/reset-password') await page.getByLabel('Email address').fill('fixture@example.invalid')
    else await credentials(page, path === '/sign-up')
    await page.evaluate(() => { window.fixtureMode = 'throw' })
    const button = page.getByRole('button', { name: path === '/sign-in' ? 'Sign In' : path === '/sign-up' ? 'Create Account' : 'Send Reset Link', exact: true })
    await button.click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(button).toBeEnabled()
    await expect(page.getByLabel('Email address')).toHaveValue('fixture@example.invalid')
    await expect(page.locator('body')).not.toContainText('PRIVATE_AUTH_DIAGNOSTIC')
    await page.evaluate(() => { window.fixtureMode = 'ok' })
    await button.click()
    if (path === '/reset-password') await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    else await expect.poll(() => page.evaluate(() => window.fixtureNavigation.length)).toBe(1)
})

test('callback errors are visible and external return paths fall back safely', async ({ page }) => {
    await fixture(page, '/sign-in?error=password-link&next=https%3A%2F%2Foutside.invalid')
    await expect(page.getByRole('alert')).toContainText('expired')
    await credentials(page)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect.poll(() => page.evaluate(() => window.fixtureNavigation)).toEqual(['/dashboard'])
})

test('password-link checking has an explicit outage retry and preserves new passwords after a failed save', async ({ page }) => {
    await fixture(page, '/set-password')
    await page.getByLabel('New password', { exact: true }).fill('Synthetic-new-password1!')
    await page.getByLabel('Confirm new password', { exact: true }).fill('Synthetic-new-password1!')
    await page.evaluate(() => { window.fixtureMode = 'throw' })
    await page.getByRole('button', { name: 'Save password', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('entries are kept')
    await expect(page.getByLabel('New password', { exact: true })).toHaveValue('Synthetic-new-password1!')
    await expect(page.getByRole('button', { name: 'Save password', exact: true })).toBeEnabled()
})

test('expired password links cannot use an unrelated existing session to offer password editing', async ({ page }) => {
    await fixture(page, '/set-password#error=access_denied&error_code=otp_expired')
    await expect(page.getByRole('alert')).toContainText('expired')
    await expect(page.getByLabel('New password', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Request a new password reset link' })).toBeVisible()
    expect(await page.evaluate(() => window.fixtureCalls.some(call => call.name === 'getUser'))).toBe(false)
})

test('dashboard uses the scoped profile and preserves a claim draft, then clears it on an account switch', async ({ page }) => {
    await fixture(page, '/dashboard?claim=desired_name')
    await expect(page.getByRole('textbox', { name: 'Profile username' })).toHaveValue('desired_name')
    await expect(page.getByLabel('FULL NAME', {exact:true})).toHaveValue('actor-a')
    await expect(page.getByLabel('FULL NAME', {exact:true})).toHaveAttribute('autocomplete', 'name')
    await expect(page.getByLabel('HEADLINE', {exact:true})).toHaveValue('actor-a headline')
    await expect(page.getByLabel('BIO', {exact:true})).toHaveValue('actor-a bio')
    await page.getByRole('textbox', { name: 'Profile username' }).fill('my_unsaved_name')
    await page.evaluate(() => { window.fixtureProfile = { ...window.fixtureProfile, profile: { ...window.fixtureProfile.profile, bio: 'Updated from Deity' } }; window.dispatchEvent(new Event('fixture-profile')) })
    await expect(page.getByRole('textbox', { name: 'Profile username' })).toHaveValue('my_unsaved_name')
    await page.evaluate(() => { window.fixtureChangeAccount('actor-b') })
    await expect(page.getByLabel('FULL NAME', {exact:true})).toHaveValue('actor-b')
    await expect(page.getByRole('textbox', { name: 'Profile username' })).toHaveValue('actor-b')
})

test('link fields and drag controls are named, and URL status reports syntax without claiming a verified destination', async ({ page }) => {
    await fixture(page, '/dashboard')
    await page.evaluate(() => {
        window.fixtureProfile = { ...window.fixtureProfile, links: [{ id: '11111111-1111-4111-8111-111111111111', user_id: 'actor-a', link_name: 'Portfolio', link_url: 'httpfoobar', display_order: 0 }] }
        window.dispatchEvent(new Event('fixture-profile'))
    })
    await expect(page.getByRole('textbox', {name:'Link name',exact:true})).toHaveValue('Portfolio')
    const url = page.getByRole('textbox', {name:'Link URL',exact:true})
    await expect(url).toHaveAttribute('inputmode', 'url')
    await expect(page.getByRole('img', {name:'Invalid URL format',exact:true})).toBeAttached()
    await url.fill('https://example.test/portfolio')
    await expect(page.getByRole('img', {name:'Valid URL format; destination not checked',exact:true})).toBeAttached()
    await expect(page.getByRole('button', {name:'Drag to reorder Portfolio',exact:true}).first()).toBeVisible()
    await url.fill('https://name:secret@example.test')
    await expect(page.getByRole('img', {name:'Invalid URL format',exact:true})).toBeAttached()
})

test('same-phone MFA enrollment exposes a private manual setup key and can cancel only its unfinished factor', async ({ page }) => {
    await fixture(page, '/dashboard/security')
    await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click()
    await expect(page.getByLabel('Authenticator setup key')).toHaveValue('SYNTHETIC_SETUP_KEY')
    await page.getByRole('button', { name: 'Cancel this setup', exact: true }).click()
    await expect(page.getByLabel('Authenticator setup key')).toHaveCount(0)
    expect(await page.evaluate(() => window.fixtureCalls.filter(call => call.name === 'unenroll').map(call => call.args))).toEqual([{ factorId: 'unverified-fixture-factor' }])
})


test('password-link verification outages leave a retry action instead of an endless spinner', async ({ page }) => {
    await fixture(page, '/set-password', 'throw')
    await expect(page.getByRole('alert')).toContainText('secure link could not be checked')
    await page.evaluate(() => { window.fixtureMode = 'ok' })
    await page.getByRole('button', { name: 'Retry secure link', exact: true }).click()
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveCount(0)
})

for (const path of ['/set-password', '/dashboard/security']) test(`${path} read stalls end at the UI deadline and offer explicit recovery`, async ({ page }) => {
    await page.clock.install()
    await fixture(page, path, 'hold')
    await page.clock.fastForward(8100)
    if (path === '/set-password') {
        await expect(page.getByRole('alert')).toContainText('secure link could not be checked')
        await page.evaluate(() => { window.fixtureMode = 'ok' })
        await page.getByRole('button', { name: 'Retry secure link', exact: true }).click()
        await expect(page.getByLabel('New password', { exact: true })).toBeVisible()
    } else {
        await expect(page.getByText('Security settings could not be loaded. Reload to retry.')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Set up authenticator', exact: true })).toBeDisabled()
        await page.evaluate(() => { window.fixtureMode = 'ok' })
        await page.getByRole('button', { name: 'Retry security settings', exact: true }).click()
        await expect(page.getByRole('button', { name: 'Set up authenticator', exact: true })).toBeEnabled()
    }
})
