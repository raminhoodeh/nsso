import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, webkit } from 'playwright'
import sharp from 'sharp'

// Public, local-only fixture. Never signs in or changes NSSO data.
const origin = new URL(process.env.GLASS_CANDIDATE_ORIGIN ?? 'http://127.0.0.1:3027')
assert(['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname), 'Use a loopback development server')
const output = path.resolve('private/test-results/glass-candidate')
await mkdir(output, { recursive: true })
const cases = [
  { name: 'chrome-desktop', engine: chromium, channel: 'chrome', width: 1440, height: 900, refracts: true },
  { name: 'chrome-mobile', engine: chromium, channel: 'chrome', width: 390, height: 844, refracts: true },
  { name: 'webkit-desktop', engine: webkit, width: 1440, height: 900, refracts: false },
  { name: 'webkit-mobile', engine: webkit, width: 390, height: 844, refracts: false },
  { name: 'webkit-crios', engine: webkit, width: 390, height: 844, refracts: false,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1' },
]
const results = []
for (const fixture of cases) {
  const browser = await fixture.engine.launch({ headless: true, ...(fixture.channel ? { channel: fixture.channel } : {}) })
  try {
    const context = await browser.newContext({ viewport: { width: fixture.width, height: fixture.height },
      isMobile: fixture.width < 600, hasTouch: fixture.width < 600,
      reducedMotion: 'reduce', ...(fixture.userAgent ? { userAgent: fixture.userAgent } : {}) })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const response = await page.goto(new URL('/glass-candidate', origin).href, { waitUntil: 'networkidle' })
    assert.equal(response.status(), 200)
    const nav = page.getByTestId('candidate-nav')
    await page.waitForFunction(() => document.querySelector('[data-testid="glass-candidate-demo"]')?.getAttribute('data-engine') !== 'pending')
    assert.equal(await nav.getAttribute('data-liquid-glass'), fixture.refracts ? 'refract' : 'frost')
    const label = await page.getByTestId('candidate-status').textContent()
    assert.match(label, fixture.refracts ? /SVG refraction requested/ : /no refraction/)

    const captures = []
    for (const amount of [0, 60]) {
      await page.getByRole('slider', { name: 'Rim pull' }).fill(String(amount))
      await page.waitForTimeout(300)
      const png = await nav.screenshot({ path: path.join(output, `${fixture.name}-rim-${amount}.png`), animations: 'disabled' })
      captures.push(await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true }))
    }
    let edges = 0, centre = 0, edgeSamples = 0, centreSamples = 0
    const { width, height, channels } = captures[0].info
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < channels; c++) {
      const i = (y * width + x) * channels + c
      const difference = Math.abs(captures[0].data[i] - captures[1].data[i])
      if (y < 24 || y > height - 24 || x < 24 || x > width - 24) { edges += difference; edgeSamples++ }
      else { centre += difference; centreSamples++ }
    }
    const edgeMean = edges / edgeSamples, centreMean = centre / centreSamples
    if (fixture.refracts) {
      assert(edgeMean > 0.1, 'A CSS declaration alone is not evidence of painted distortion')
      // The supplied 8-bit map encodes neutral as128/255, not0.5. A small
      // central subpixel shift is expected; rim displacement must dominate.
      assert(edgeMean > centreMean * 2 && centreMean < 2, 'Distortion must be concentrated at the rim')
    } else {
      assert.equal(edgeMean, 0, 'WebKit fallback must not be described as refraction')
      assert.equal(centreMean, 0)
    }

    await page.getByRole('button', { name: 'Test button', exact: true }).click()
    assert.equal(await page.getByText('Pressed 1 times', { exact: true }).count(), 1)
    await page.getByTestId('candidate-scroll').evaluate((el) => { el.scrollTop = 1100 })
    assert.equal(Math.round((await nav.boundingBox()).y), 16, 'Navigation stays fixed while content scrolls')
    await nav.getByRole('button', { name: 'Back to top' }).click()
    await page.waitForFunction(() => document.querySelector('[data-testid="candidate-scroll"]').scrollTop < 1)
    await page.getByRole('checkbox', { name: 'Blur-only comparison' }).check()
    await page.waitForFunction(() => document.querySelector('[data-testid="candidate-nav"]')?.getAttribute('data-liquid-glass') === 'frost')
    assert.equal(await page.locator('filter[id^="lgf"]').count(), 0, 'Switching to frost releases SVG filters')
    await page.getByRole('checkbox', { name: 'Blur-only comparison' }).uncheck()
    await page.getByRole('button', { name: 'Hide glass surfaces' }).click()
    assert.equal(await page.locator('filter[id^="lgf"]').count(), 0, 'Unmount releases every candidate filter')
    await page.getByRole('button', { name: 'Show glass surfaces' }).click()
    await nav.waitFor()
    const overflow = await page.getByTestId('candidate-scroll').evaluate((el) => el.scrollWidth > el.clientWidth)
    assert.equal(overflow, false, 'No horizontal overflow at mobile width')
    await page.screenshot({ path: path.join(output, `${fixture.name}.png`) })
    assert.deepEqual(errors, [])
    const result = { name: fixture.name, browserVersion: browser.version(), width: fixture.width,
      backend: await nav.getAttribute('data-liquid-glass'), label, edgeMean, centreMean,
      interactions: 'button, scrolling, frost switch, unmount/remount passed', pageErrors: errors }
    results.push(result)
    console.log(JSON.stringify(result))
    await context.close()
  } finally { await browser.close() }
}
await writeFile(path.join(output, 'report.json'), JSON.stringify({ at: new Date().toISOString(),
  scope: 'Local development fixture. Browser emulation, not physical iPhone testing. Production unchanged.', results }, null, 2) + '\n')
