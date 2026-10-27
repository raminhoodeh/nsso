import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
let serverMarkup, clientBundle, css

function claimBoundaries(browser) {
  return { name: 'claim-readiness-boundaries', setup(builder) {
    builder.onResolve({ filter: /^(?:next\/navigation|@\/lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: path === 'next/navigation'
      ? `export const useRouter=()=>({push:path=>${browser ? 'window.fixtureDestinations.push(path)' : 'undefined'}});`
      : 'export const createClient=()=>({auth:{getSession:async()=>({data:{session:null},error:null})}});' }))
  } }
}

test.beforeAll(async () => {
  const source = [
    'src/components/home/HomeProfileClaim.tsx',
    'src/components/ui/Input.tsx',
    'src/components/ui/GlassButton.tsx',
    'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx',
    'src/components/ui/tahoe-glass/TahoeGlassField.tsx',
  ].map(path => readFileSync(root + path, 'utf8')).join('\n')
  const compiler = await compile('@import "tailwindcss";', { base: root, onDependency() {} })
  css = compiler.build(source.match(/[^\s"'`]+/g)) + '\nbody{margin:0;padding:24px;font-family:Arial;background:#cbd5e1}'
  const server = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [claimBoundaries(false)],
    stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import {renderToString} from 'react-dom/server';import Claim from './src/components/home/HomeProfileClaim';module.exports=renderToString(<Claim/>);` } })
  const ssrModule = { exports: {} }
  new Function('require', 'module', 'exports', server.outputFiles[0].text)(require, ssrModule, ssrModule.exports)
  serverMarkup = ssrModule.exports

  const client = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [claimBoundaries(true)],
    stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import {hydrateRoot} from 'react-dom/client';import Claim from './src/components/home/HomeProfileClaim';window.fixtureDestinations=[];window.fixtureRecoverableErrors=[];hydrateRoot(document.getElementById('root'),<Claim/>,{onRecoverableError:error=>window.fixtureRecoverableErrors.push(error.message)});` } })
  clientBundle = client.outputFiles[0].text
})

async function heldHydration(page, { savedDraft = 'saved-name', blockedStorage = false, available = false } = {}) {
  const requests = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(({ savedDraft, blockedStorage }) => {
    if (blockedStorage) Storage.prototype.getItem = function () { throw new DOMException('Storage unavailable', 'SecurityError') }
    else sessionStorage.setItem('nsso-profile-name-draft', savedDraft)
  }, { savedDraft, blockedStorage })
  let releaseClient
  const clientGate = new Promise(resolve => { releaseClient = resolve })
  await page.route('https://nsso.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
    if (path === '/client.js') {
      await clientGate
      return route.fulfill({ contentType: 'application/javascript', body: clientBundle })
    }
    if (path === '/api/check-username') {
      requests.push(new URL(route.request().url()).searchParams.get('username'))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ available, reason: 'Username is already taken' }) })
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root">${serverMarkup}</div><script src="/client.js"></script>` })
  })
  // Server HTML is visible while the real client bundle remains deliberately held.
  await page.goto('https://nsso.test/', { waitUntil: 'commit' })
  await expect(page.getByRole('textbox', { name: 'Profile name' })).toBeVisible()
  return { requests, errors, release: releaseClient }
}

test('server controls stay disabled until hydration restores the saved draft', async ({ page }) => {
  const state = await heldHydration(page)
  const input = page.getByRole('textbox', { name: 'Profile name', exact: true })
  await expect(input).toBeDisabled()
  await expect(input).toHaveValue('')
  await expect(page.getByRole('button', { name: 'LOADING…', exact: true })).toBeDisabled()
  await expect(page.getByRole('form', { name: 'Choose your profile name' })).toHaveAttribute('aria-busy', 'true')
  state.release()
  await expect(input).toBeEnabled()
  await expect(input).toHaveValue('saved-name')
  await expect(page.getByRole('button', { name: 'CLAIM IT', exact: true })).toBeEnabled()
  await expect(page.getByRole('form', { name: 'Choose your profile name' })).toHaveAttribute('aria-busy', 'false')
  expect(await page.evaluate(() => window.fixtureRecoverableErrors)).toEqual([])
  expect(state.errors).toEqual([])
  expect(state.requests).toEqual([])
})

test('the first edit queued before hydration validates instead of being reset by draft restoration', async ({ page }) => {
  const state = await heldHydration(page)
  const input = page.getByRole('textbox', { name: 'Profile name', exact: true })
  await expect(input).toBeDisabled()
  const firstEdit = input.fill('Bad Name!')
  await expect(input).toHaveValue('')
  state.release()
  await firstEdit
  await page.getByRole('button', { name: 'CLAIM IT', exact: true }).click()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveValue('Bad Name!')
  expect(await page.evaluate(() => sessionStorage.getItem('nsso-profile-name-draft'))).toBe('Bad Name!')
  expect(await page.evaluate(() => window.fixtureDestinations)).toEqual([])
  expect(await page.evaluate(() => window.fixtureRecoverableErrors)).toEqual([])
  expect(state.errors).toEqual([])
  expect(state.requests).toEqual([])
})

test('blocked browser storage still enables the form after hydration', async ({ page }) => {
  const state = await heldHydration(page, { blockedStorage: true })
  await expect(page.getByRole('textbox', { name: 'Profile name' })).toBeDisabled()
  state.release()
  const input = page.getByRole('textbox', { name: 'Profile name', exact: true })
  await expect(input).toBeEnabled()
  await input.fill('Bad Name!')
  await page.getByRole('button', { name: 'CLAIM IT', exact: true }).click()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveValue('Bad Name!')
  expect(state.errors).toEqual([])
  expect(state.requests).toEqual([])
})

for (const width of [320, 390, 1440]) test(`claim uses sign-in controls with the action below the field at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 })
  const state = await heldHydration(page, { savedDraft: '' })
  state.release()
  const input = page.getByRole('textbox', { name: 'Profile name', exact: true })
  const submit = page.getByRole('button', { name: 'CLAIM IT', exact: true })
  const form = page.getByRole('form', { name: 'Choose your profile name' })
  await expect(input).toBeEnabled()
  await expect(page.getByRole('status')).toBeHidden()
  await expect(page.getByText('Choose 3–30', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Checking a name doesn’t reserve it.', { exact: false })).toHaveCount(0)
  const field = form.locator('[data-tahoe-glass-surface="recessed"]')
  await expect(field).toHaveCount(1)
  await expect(submit).toHaveAttribute('data-tahoe-glass-surface', 'button')
  const fieldBox = await input.boundingBox()
  const buttonBox = await submit.boundingBox()
  expect(buttonBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height + 16)
  expect(buttonBox.height).toBeGreaterThanOrEqual(44)
  expect(buttonBox.width).toBeGreaterThanOrEqual((await form.boundingBox()).width - 1)
  expect(await input.evaluate(element => getComputedStyle(element).color)).not.toBe('rgb(255, 255, 255)')
  expect(await submit.evaluate(element => getComputedStyle(element.querySelector(':scope > :last-child')).color)).not.toBe('rgb(255, 255, 255)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  const idleOutlineWidth = await field.evaluate(element => getComputedStyle(element).outlineWidth)
  await expect(field).toHaveCSS('outline-style', 'none')
  await input.focus()
  await expect(input).toBeFocused()
  await expect(field).toHaveCSS('outline-style', 'solid')
  await expect(field).toHaveCSS('outline-width', '2px')
  await expect(field).toHaveCSS('outline-offset', '2px')
  await input.blur()
  await expect(field).toHaveCSS('outline-style', 'none')
  // Browsers can report the default medium (3px) width even when style is
  // none. Restore the original width and no painted outline on blur.
  await expect(field).toHaveCSS('outline-width', idleOutlineWidth)
  await input.fill('Bad Name!')
  await expect(page.getByRole('status')).toBeHidden()
  await submit.click()
  await expect(page.getByRole('status')).toContainText('Username must be 3-30 characters')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await input.fill('my-name')
  await expect(page.getByRole('status')).toBeHidden()
  expect(state.requests).toEqual([])
  expect(state.errors).toEqual([])
})

test('the shared claim controls preserve normalized signup intent and truthful reservation feedback', async ({ page }) => {
  const state = await heldHydration(page, { savedDraft: '', available: true })
  state.release()
  const input = page.getByRole('textbox', { name: 'Profile name', exact: true })
  await expect(input).toBeEnabled()
  await input.fill(' New-Creator ')
  await input.press('Enter')
  await expect.poll(() => page.evaluate(() => window.fixtureDestinations)).toEqual(['/sign-up?name=new-creator'])
  await expect(page.getByRole('status')).toHaveText('Available now. Save this name in profile setup to claim it.')
  expect(state.requests).toEqual(['new-creator'])
  expect(await page.evaluate(() => sessionStorage.getItem('nsso-profile-name-draft'))).toBe('new-creator')
  expect(await page.evaluate(() => window.fixtureRecoverableErrors)).toEqual([])
  expect(state.errors).toEqual([])
})
