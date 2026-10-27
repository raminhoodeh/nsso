import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, webkit, devices } from 'playwright'
import sharp from 'sharp'

// Read-only public-page verification. DOM-only diagnostic grid is never saved
// to NSSO; no sign-in, assistant requests, profile writes or admin calls occur.
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3027')
assert(['127.0.0.1', 'localhost', 'www.nsso.me', 'nsso.me'].includes(origin.hostname))
assert(!origin.username && !origin.password && !origin.search && !origin.hash)
const output = path.resolve(`private/test-results/chrome-glass-release-${Date.now()}`)
await mkdir(output, { recursive: true })
const fixtures = [
  { name: 'chrome-desktop', engine: chromium, channel: 'chrome', options: { viewport: { width: 1440, height: 900 } }, candidate: true },
  { name: 'chrome-android', engine: chromium, channel: 'chrome', options: devices['Pixel 7'], candidate: false },
  { name: 'webkit-iphone', engine: webkit, options: devices['iPhone 13'], candidate: false },
  { name: 'webkit-desktop', engine: webkit, options: { viewport: { width: 1440, height: 900 } }, candidate: false },
]
const results = []
async function pixelProof(page, selector, name) {
  const target = page.locator(selector).first()
  await target.scrollIntoViewIfNeeded()
  const filterId = await target.evaluate((element) => {
    const lens = element.firstElementChild
    const reference = getComputedStyle(lens).backdropFilter
    return reference.match(/#([^"\)]+)/)?.[1]
  })
  assert(filterId, `${name}: no actual reference filter`)
  const buffers = []
  for (const strength of [0, 64]) {
    await page.evaluate(({ filterId, strength }) => {
      const primitive = document.getElementById(filterId)?.querySelector('feDisplacementMap')
      if (!primitive) throw new Error('Missing displacement primitive')
      primitive.setAttribute('scale', String(strength))
    }, { filterId, strength })
    await page.waitForTimeout(150)
    const png = await target.screenshot({ path: path.join(output, `${name}-${strength}.png`) })
    buffers.push(await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }))
  }
  assert.deepEqual(buffers[0].info, buffers[1].info)
  let sum = 0, changed = 0
  for (let i = 0; i < buffers[0].data.length; i++) {
    const difference = Math.abs(buffers[0].data[i] - buffers[1].data[i])
    sum += difference
    if (difference > 3) changed++
  }
  assert(changed > 30, `${name}: reference declaration without painted distortion`)
  return { filterId, meanRgbChange: sum / buffers[0].data.length, changedChannels: changed }
}
for (const fixture of fixtures) {
  const browser = await fixture.engine.launch({ headless: true, ...(fixture.channel ? { channel: fixture.channel } : {}) })
  try {
    const context = await browser.newContext({ ...fixture.options, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const route of ['/', '/sign-in', '/john', '/deity']) {
      const response = await page.goto(new URL(route, origin).href, { waitUntil: 'domcontentloaded' })
      assert.equal(response.status(), 200, `${fixture.name} ${route}`)
      if (fixture.candidate && route !== '/deity') {
        await page.locator('[data-tahoe-chromium-optics="refract"]').first().waitFor({ timeout: 30_000 })
      } else await page.waitForTimeout(600)
      const count = await page.locator('[data-tahoe-chromium-optics]').count()
      if (!fixture.candidate) assert.equal(count, 0, `${fixture.name} must preserve the old renderer`)
      for (const image of await page.locator('img[src*="nsso-logo"]').all()) {
        assert(await image.evaluate((el) => el.complete && el.naturalWidth > 0), 'Logo must decode')
      }
      const navigation = await page.locator('header').evaluateAll((elements) => elements.map((el) => ({
        backend: el.dataset.tahoeRefractionBackend, source: el.dataset.tahoeBackdropSource,
        candidate: el.dataset.tahoeChromiumOptics ?? null,
      })))
      let readable = null
      if (route === '/deity') {
        const chat = page.getByLabel('Deity chat', { exact: true })
        await chat.waitFor()
        readable = await chat.evaluate((el) => ({ background: getComputedStyle(el).backgroundColor, optics: el.querySelectorAll('[data-tahoe-chromium-optics]').length }))
        assert.equal(readable.background, 'rgb(17, 22, 29)')
        assert.equal(readable.optics, 0)
      }
      await page.screenshot({ path: path.join(output, `${fixture.name}-${route === '/' ? 'home' : route.slice(1)}.png`) })
      results.push({ fixture: fixture.name, browser: browser.version(), route, status: response.status(), candidateCount: count, navigation, readable })
    }
    if (fixture.candidate) {
      await page.goto(new URL('/', origin).href, { waitUntil: 'domcontentloaded' })
      await page.locator('header[data-tahoe-chromium-optics="refract"]').waitFor()
      // Grid is injected into the actual scene plane, beneath real page DOM.
      await page.evaluate(() => {
        const scene = document.querySelector('[data-tahoe-glass-viewport] > div')
        if (!scene) throw new Error('Missing scene plane')
        const grid = document.createElement('div')
        Object.assign(grid.style, { position: 'absolute', inset: '0', zIndex: '99', backgroundColor: '#18334a',
          backgroundImage: 'linear-gradient(#5bd8e5 1px, transparent 1px),linear-gradient(90deg,#5bd8e5 1px, transparent 1px)', backgroundSize: '24px 24px' })
        scene.appendChild(grid)
      })
      const card = await pixelProof(page, '[data-tahoe-glass-surface="card"][data-tahoe-chromium-optics="refract"]', 'real-home-card')
      await page.evaluate(() => window.scrollTo(0, 600))
      const nav = await pixelProof(page, 'header[data-tahoe-chromium-optics="refract"]', 'real-home-navigation')
      results.push({ fixture: fixture.name, paintedPixelProof: { card, nav } })
    }
    assert.deepEqual(errors, [], `${fixture.name} uncaught errors`)
    await context.close()
    console.log(`${fixture.name}: public pages, renderer policy and Deity readability passed`)
  } finally { await browser.close() }
}
await writeFile(path.join(output, 'report.json'), JSON.stringify({ at: new Date().toISOString(), origin: origin.origin,
  limitation: 'Browser emulation, not physical-device testing. No signed-in or data-mutation checks in this script.', results }, null, 2) + '\n')
console.log(`Evidence: ${output}/report.json`)
