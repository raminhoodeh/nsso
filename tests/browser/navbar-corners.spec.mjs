import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
const fixture = `
  import React,{useState} from 'react';import{createRoot}from'react-dom/client';
  import NssoTopBar from './src/components/layout/NssoTopBar';
  function App(){const[count,setCount]=useState(0);return <>
    <div id="backing" aria-hidden="true"><div id="pattern"/></div>
    <NssoTopBar contentClassName="relative z-20 flex h-[88px] items-center justify-between px-10">
      <span>nsso</span><button onClick={()=>setCount(n=>n+1)}>Account {count}</button>
    </NssoTopBar>
    <main style={{paddingTop:160}}>Scroll content beneath the same live navbar.</main>
  </>}
  const app=createRoot(document.getElementById('root'));window.disposeFixture=()=>app.unmount();app.render(<App/>);
`

test.beforeAll(async () => {
  const sources = [
    'src/components/layout/NssoTopBar.tsx',
    'src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx',
    'src/components/ui/experimental/liquid-glass-candidate.tsx',
  ].map(file => readFileSync(root + file, 'utf8')).join('\n') + fixture
  const candidates = [...sources.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/))
  const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
  css = compiler.build(candidates) + `
    body{margin:0;min-height:2400px;background:#04102a;font-family:Arial}
    #backing{position:absolute;inset:0;min-height:2400px;pointer-events:none;background:#04102a}
    #pattern{position:absolute;top:0;bottom:0;left:120px;right:120px;background:repeating-linear-gradient(90deg,#d8f8ff 0px 2px,transparent 2px 16px),repeating-linear-gradient(#d8f8ff 0px 2px,#04102a 2px 20px)}
    button{min-height:44px;padding:8px 16px;background:#eefaff;color:#111;border-radius:20px}
  `
  const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: fixture } })
  bundle = result.outputFiles[0].text
})

async function mount(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('https://nsso.test/**', route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
    if (pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
    return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
  })
  await page.goto('https://nsso.test/navbar-corners')
}

async function expectCorners(page) {
  const bar = page.locator('[data-nsso-topbar]')
  await expect(bar).toHaveCSS('border-top-left-radius', '0px')
  await expect(bar).toHaveCSS('border-top-right-radius', '0px')
  await expect(bar).toHaveCSS('border-bottom-left-radius', '24px')
  await expect(bar).toHaveCSS('border-bottom-right-radius', '24px')
  const rect = await bar.boundingBox()
  expect(rect.x).toBe(0)
  expect(rect.y).toBe(0)
  expect(rect.width).toBe(await page.evaluate(() => innerWidth))
  expect(rect.height).toBe(88)
  // Inspect painted pixels, not just border-radius declarations: the lens
  // has its own polygon and could otherwise leave the upper corners empty.
  const { data, info } = await sharp(await bar.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)]
  const density = info.width / rect.width
  for (const x of [Math.floor(2 * density), info.width - Math.ceil(2 * density)]) {
    const top = pixel(x, Math.floor(2 * density))
    expect(top[0] - 4 + top[1] - 16 + top[2] - 42).toBeGreaterThan(50)
    const bottom = pixel(x, info.height - Math.ceil(2 * density))
    expect(Math.max(...bottom.map((channel, i) => Math.abs(channel - [4, 16, 42][i])))).toBeLessThanOrEqual(2)
  }
}

test('core navbar paints square top corners and keeps rounded bottom corners through resize and scroll', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await mount(page)
  const bar = page.locator('[data-nsso-topbar]')
  if (testInfo.project.name === 'desktop') await expect(bar).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
  else await expect(bar).not.toHaveAttribute('data-tahoe-chromium-optics')
  await expectCorners(page)
  await page.getByRole('button', { name: 'Account 0', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Account 1', exact: true })).toBeVisible()
  await page.evaluate(() => scrollTo(0, 400))
  await expectCorners(page)
  await page.setViewportSize({ width: 768, height: 900 })
  await expectCorners(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(bar).not.toHaveAttribute('data-tahoe-chromium-optics')
  await expectCorners(page)
  if (testInfo.project.name === 'desktop') {
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(bar).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
    await expectCorners(page)
  }
  await page.evaluate(() => window.disposeFixture())
  await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('square-top navbar retains painted live refraction and accessibility fallbacks', async ({ page }, testInfo) => {
  await mount(page)
  const bar = page.locator('[data-nsso-topbar]')
  if (testInfo.project.name === 'desktop') {
    await expect(bar).toHaveAttribute('data-tahoe-chromium-optics', 'refract')
    const filterId = await bar.evaluate(element => {
      const lens = [...element.children].find(child => getComputedStyle(child).backdropFilter.includes('url('))
      return getComputedStyle(lens).backdropFilter.match(/url\(["']?#([^\)"']+)/)?.[1]
    })
    expect(filterId).toBeTruthy()
    const frames = []
    for (const strength of [0, 64]) {
      await page.evaluate(({ id, strength }) => document.getElementById(id).querySelector('feDisplacementMap').setAttribute('scale', String(strength)), { id: filterId, strength })
      frames.push(await sharp(await bar.screenshot()).removeAlpha().raw().toBuffer())
    }
    let changedChannels = 0
    for (let i = 0; i < frames[0].length; i++) if (Math.abs(frames[0][i] - frames[1][i]) > 3) changedChannels++
    expect(changedChannels).toBeGreaterThan(100)
  }
  await page.emulateMedia({ forcedColors: 'active' })
  await expect(bar).toHaveAttribute('data-tahoe-refraction-backend', 'solid')
  await expect(bar).not.toHaveAttribute('data-tahoe-chromium-optics')
  await expect(page.locator('filter[id^="lgf"]')).toHaveCount(0)
  await expect(bar).toHaveCSS('border-top-left-radius', '0px')
  await expect(bar).toHaveCSS('border-top-right-radius', '0px')
  await page.evaluate(() => window.disposeFixture())
})
