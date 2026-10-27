import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle
test.beforeAll(async () => {
  const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
    plugins: [{ name: 'public-fixtures', setup(builder) {
      builder.onResolve({ filter: /^(?:next\/(?:navigation|link)|@\/lib\/supabase\/client|@\/components\/ui\/tahoe-glass)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
        path === 'next/navigation' ? 'export const useRouter=()=>({push:path=>window.fixtureDestinations.push(path)});'
          : path === 'next/link' ? 'import React from "react";export default ({children,...props})=><a {...props}>{children}</a>;'
            : path.endsWith('supabase/client') ? 'export const createClient=()=>({auth:{getSession:async()=>{if(window.fixtureAuthError)throw Error("Synthetic outage");return {data:{session:null},error:null}}}});'
              : 'import React from "react";export {TahoeGlassField} from "./src/components/ui/tahoe-glass/TahoeGlassField";export const TahoeGlassSurface=({as:Tag="div",children,contentClassName,variant,radius,tone,semanticTint,semanticTintOpacity,displacementProfile,materialLighting,...props})=><Tag {...props}>{children}</Tag>;export const TahoeGlassButton=props=><TahoeGlassSurface as="button" {...props}/>;export const TahoeBackdropSurface=props=><TahoeGlassSurface {...props}/>;export const TahoeGlassDialog=({open,children,...props})=>open?<div role="dialog" aria-labelledby={props["aria-labelledby"]}>{children}</div>:null;' }))
    } }], stdin: { resolveDir: root, loader: 'tsx', contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import Claim from './src/components/home/HomeProfileClaim';import Demo from './src/components/home/HomeProfileDemo';import Player from './src/components/home/HomeVisionPlayer';
      import Bio from './src/components/profile/ExpandableBio';import {getProfileBioPreview} from './src/components/profile/profileBio';import Create from './src/components/ui/CreateProfileButton';
      import QR from './src/components/ui/ProfileQRCodeToggle';import Consent from './src/components/analytics/MetaPixelConsent';
      window.fixtureDestinations=[];window.fixturePlayCalls=0;window.fixtureAuthError=false;window.fixturePaused=true;
      Object.defineProperties(HTMLMediaElement.prototype,{paused:{configurable:true,get(){return window.fixturePaused}},duration:{configurable:true,get(){return window.fixtureDuration||NaN}},play:{configurable:true,value(){window.fixturePlayCalls++;window.fixturePaused=false;this.dispatchEvent(new Event('play'));return Promise.resolve()}},pause:{configurable:true,value(){window.fixturePaused=true;this.dispatchEvent(new Event('pause'))}},load:{configurable:true,value(){}}});
      window.IntersectionObserver=class{constructor(callback){window.fixtureIntersection=callback}observe(){}disconnect(){}};
      const text='I build products and teach teams how to tell their stories. '.repeat(50);const root=createRoot(document.getElementById('root'));
      window.renderPublicFixture=screen=>root.render(screen==='claim'?<Claim/>:screen==='demo'?<Demo/>:screen==='player'?<Player/>:screen==='bio'?<Bio text={text} collapsedText={getProfileBioPreview('creator',text)}/>:screen==='create'?<Create returnTo={window.fixtureReturnTo||'/someone?via=profile'}/>:screen==='qr'?<QR username='creator' fullName='Creator' profilePicUrl='/avatar.jpg'/>:<Consent pixelId='123456789012345' initialConsent='denied'/>);
    ` } })
  bundle = result.outputFiles[0].text
})

async function fixture(page, screen, options = {}) {
  const requests = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/check-username') {
      requests.push(url.searchParams.get('username'))
      return route.fulfill({ status: options.availabilityError ? 503 : 200, contentType: 'application/json', body: JSON.stringify({ available: options.available !== false, reason: 'Username is already taken' }) })
    }
    return route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' })
  })
  await page.goto('https://nsso.test/')
  await page.addScriptTag({ content: bundle })
  await page.evaluate(({ screen, options }) => { window.fixtureDuration = options.duration; window.fixtureReturnTo = options.returnTo; window.renderPublicFixture(screen) }, { screen, options })
  return { requests, errors }
}

test('claim refuses invalid and reserved names before any availability request or navigation', async ({ page }) => {
  const { requests } = await fixture(page, 'claim')
  for (const name of ['Bad Name!', 'api', 'a']) {
    await page.getByRole('textbox', { name: 'Profile name' }).fill(name)
    await page.getByRole('button', { name: 'CLAIM IT', exact: true }).click()
    await expect(page.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
  }
  expect(requests).toEqual([])
  expect(await page.evaluate(() => window.fixtureDestinations)).toEqual([])
})

test('claim checks availability, normalizes the name and preserves the intent through signup', async ({ page }) => {
  const { requests, errors } = await fixture(page, 'claim')
  await page.getByRole('textbox').fill('New-Creator')
  await page.getByRole('textbox').press('Enter')
  await expect.poll(() => page.evaluate(() => window.fixtureDestinations)).toEqual(['/sign-up?name=new-creator'])
  expect(requests).toEqual(['new-creator'])
  expect(await page.evaluate(() => sessionStorage.getItem('nsso-profile-name-draft'))).toBe('new-creator')
  expect(errors).toEqual([])
})

for (const options of [{ available: false }, { availabilityError: true }]) test(`failed claim keeps draft and remains retryable: ${JSON.stringify(options)}`, async ({ page }) => {
  await fixture(page, 'claim', options)
  await page.getByRole('textbox').fill('kept-name')
  await page.getByRole('button', { name: 'CLAIM IT', exact: true }).click()
  await expect(page.getByRole('status')).toContainText(options.available === false ? 'already taken' : 'Your name is kept')
  await expect(page.getByRole('textbox')).toHaveValue('kept-name')
  await expect(page.getByRole('button', { name: 'CLAIM IT', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => window.fixtureDestinations)).toEqual([])
})

test('generic long bio expands and collapses without losing any saved text', async ({ page }) => {
  await fixture(page, 'bio')
  const before = await page.locator('p > span').textContent()
  expect(before.length).toBeLessThanOrEqual(600)
  await page.getByRole('button', { name: 'Show full bio' }).click()
  expect((await page.locator('p > span').textContent()).length).toBeGreaterThan(2000)
  await page.getByRole('button', { name: 'Collapse bio' }).click()
  expect(await page.locator('p > span').textContent()).toBe(before)
})

test('claim draft survives leaving and reopening the form', async ({ page }) => {
  await fixture(page, 'claim')
  await page.getByRole('textbox').fill('my-draft')
  await page.evaluate(() => window.renderPublicFixture('create'))
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await page.evaluate(() => window.renderPublicFixture('claim'))
  await expect(page.getByRole('textbox')).toHaveValue('my-draft')
})

test('vision player reads metadata present at mount and attaches media only on play', async ({ page }) => {
  await fixture(page, 'player', { duration: 100 })
  await expect(page.locator('video')).not.toHaveAttribute('src')
  await expect(page.getByText('0:00 / 1:40', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Play video', exact: true }).click()
  await expect(page.locator('video')).toHaveAttribute('src', '/nsso-vision-ukYfrg0ZNbA.mp4')
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeVisible()
  await page.getByRole('slider', { name: 'Video progress' }).evaluate(element => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, '45')
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await expect(page.getByText('0:45 / 1:40', { exact: true })).toBeVisible()
})

test('reduced motion keeps the decorative video unloaded until explicit play and user pause survives visibility changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fixture(page, 'demo')
  await page.waitForFunction(() => typeof window.fixtureIntersection === 'function')
  await page.evaluate(() => window.fixtureIntersection([{ isIntersecting: true }]))
  await expect(page.locator('video')).not.toHaveAttribute('src')
  expect(await page.evaluate(() => window.fixturePlayCalls)).toBe(0)
  await page.getByRole('button', { name: 'Play profile preview' }).click()
  await expect(page.locator('video')).toHaveAttribute('src', '/homepage-video.mp4')
  await page.getByRole('button', { name: 'Pause profile preview' }).click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.evaluate(() => window.fixtureIntersection([{ isIntersecting: false }, { isIntersecting: true }]))
  expect(await page.evaluate(() => window.fixturePlayCalls)).toBe(1)
})

test('the inline profile demo keeps its clear label while playback and error feedback remain actionable', async ({ page }) => {
  const { errors } = await fixture(page, 'demo')
  const label = page.getByText('nsso profile demo', { exact: true })
  await expect(label).toBeVisible()
  await expect(page.locator('figure')).toHaveAccessibleName('nsso profile preview')
  await expect(page.locator('video')).not.toHaveAttribute('src')
  await expect(page.locator('video')).toHaveAttribute('preload', 'none')
  await page.getByRole('button', { name: 'Play profile preview' }).click()
  await expect(page.getByRole('button', { name: 'Pause profile preview' })).toBeVisible()
  await expect(label).toBeVisible()
  await page.locator('video').evaluate(element => element.dispatchEvent(new Event('error')))
  await expect(label).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Preview unavailable')
  await expect(page.getByRole('button', { name: 'Play profile preview' })).toBeVisible()
  expect(errors).toEqual([])
})

test('video failures expose an actionable retry and an independent YouTube fallback', async ({ page }) => {
  await fixture(page, 'player')
  await expect(page.getByText('0:00 / —:—', { exact: true })).toBeVisible()
  await page.locator('video').evaluate(element => element.dispatchEvent(new Event('error')))
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable')
  await expect(page.getByRole('button', { name: 'Play video', exact: true })).toBeDisabled()
  await expect(page.getByRole('alert').getByRole('link', { name: 'Watch on YouTube', exact: true })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=ukYfrg0ZNbA')
  await page.getByRole('button', { name: 'Retry video', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause video', exact: true })).toBeEnabled()
})

test('create profile opens signup with the safe viewed-profile destination', async ({ page }) => {
  await fixture(page, 'create')
  await expect(page.getByRole('link', { name: 'Create your nsso profile' })).toHaveAttribute('href', '/sign-up?next=%2Fsomeone%3Fvia%3Dprofile')
})

test('create profile drops an unsafe external destination', async ({ page }) => {
  await fixture(page, 'create', { returnTo: '//untrusted.example' })
  await expect(page.getByRole('link', { name: 'Create your nsso profile' })).toHaveAttribute('href', '/sign-up')
})

test('QR has a visible touch hint and keyboard toggling returns to the photo', async ({ page }) => {
  await fixture(page, 'qr')
  await expect(page.getByText('Tap to show QR')).toBeVisible()
  await page.getByRole('button', { name: "Show Creator's QR code" }).press('Enter')
  await expect(page.getByRole('button', { name: "Show Creator's profile photo" })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: "Show Creator's profile photo" }).press('Space')
  await expect(page.getByRole('button', { name: "Show Creator's QR code" })).toHaveAttribute('aria-pressed', 'false')
})

test('privacy settings remain in document flow and declining never initializes tracking', async ({ page }) => {
  await fixture(page, 'privacy')
  const privacy = page.getByRole('button', { name: 'Privacy choices' })
  await expect(privacy).toBeVisible()
  expect(await privacy.evaluate(element => getComputedStyle(element).position)).not.toBe('fixed')
  await privacy.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Decline', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => window.fbq)).toBeUndefined()
  expect(await page.evaluate(() => document.cookie)).toContain('=denied')
})
