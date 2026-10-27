import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
let serverMarkup, clientBundle

function claimBoundaries(browser) {
  return { name: 'claim-readiness-boundaries', setup(builder) {
    builder.onResolve({ filter: /^(?:next\/navigation|@\/lib\/supabase\/client)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'js', contents: path === 'next/navigation'
      ? `export const useRouter=()=>({push:path=>${browser ? 'window.fixtureDestinations.push(path)' : 'undefined'}});`
      : 'export const createClient=()=>({auth:{getSession:async()=>({data:{session:null},error:null})}});' }))
  } }
}

test.beforeAll(async () => {
  const server = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [claimBoundaries(false)],
    stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import {renderToString} from 'react-dom/server';import Claim from './src/components/home/HomeProfileClaim';module.exports=renderToString(<Claim/>);` } })
  const ssrModule = { exports: {} }
  new Function('require', 'module', 'exports', server.outputFiles[0].text)(require, ssrModule, ssrModule.exports)
  serverMarkup = ssrModule.exports

  const client = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [claimBoundaries(true)],
    stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react';import {hydrateRoot} from 'react-dom/client';import Claim from './src/components/home/HomeProfileClaim';window.fixtureDestinations=[];window.fixtureRecoverableErrors=[];hydrateRoot(document.getElementById('root'),<Claim/>,{onRecoverableError:error=>window.fixtureRecoverableErrors.push(error.message)});` } })
  clientBundle = client.outputFiles[0].text
})

async function heldHydration(page, { savedDraft = 'saved-name', blockedStorage = false } = {}) {
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
    if (path === '/client.js') {
      await clientGate
      return route.fulfill({ contentType: 'application/javascript', body: clientBundle })
    }
    if (path === '/api/check-username') {
      requests.push(path)
      return route.fulfill({ contentType: 'application/json', body: '{"available":false,"reason":"Username is already taken"}' })
    }
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<meta charset="utf-8"><div id="root">${serverMarkup}</div><script src="/client.js"></script>` })
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
