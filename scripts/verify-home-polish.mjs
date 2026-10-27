import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, webkit, devices } from 'playwright'

// Public, read-only design QA. Invalid local validation never checks or claims
// a real username; no account creation, OAuth or assistant requests occur.
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3027')
assert(['127.0.0.1', 'localhost', 'www.nsso.me', 'nsso.me'].includes(origin.hostname))
assert(!origin.username && !origin.password && !origin.search && !origin.hash)
const output = path.resolve(`private/test-results/home-polish-${Date.now()}`)
await mkdir(output, { recursive: true })
const fixtures = [
    { name: 'chrome-desktop', engine: chromium, channel: 'chrome', options: { viewport: { width: 1440, height: 1000 } }, candidate: true },
    ...[320, 390, 430].map(width => ({ name: `chrome-${width}`, engine: chromium, channel: 'chrome', options: { ...devices['Pixel 7'], viewport: { width, height: 844 } }, candidate: false })),
    ...[320, 390, 430].map(width => ({ name: `webkit-${width}`, engine: webkit, options: { ...devices['iPhone 13'], viewport: { width, height: 844 } }, candidate: false })),
    { name: 'chrome-landscape', engine: chromium, channel: 'chrome', options: { ...devices['Pixel 7'], viewport: { width: 568, height: 320 } }, candidate: false },
    { name: 'webkit-landscape', engine: webkit, options: { ...devices['iPhone 13'], viewport: { width: 568, height: 320 } }, candidate: false },
    { name: 'webkit-desktop', engine: webkit, options: { viewport: { width: 1440, height: 1000 } }, candidate: false },
]

async function panelContract(locator) {
    return locator.evaluate(element => ({
        radius: getComputedStyle(element).borderRadius,
        tone: element.dataset.tahoeGlassTone,
        tint: element.dataset.tahoeGlassTint,
        lighting: element.dataset.tahoeMaterialLighting,
        profile: element.dataset.tahoeDisplacementProfile,
    }))
}

async function capture(page, selector, filename) {
    await page.locator(selector).evaluate(element => window.scrollTo(0, Math.max(0, scrollY + element.getBoundingClientRect().top - 112)))
    await page.waitForTimeout(200)
    await page.screenshot({ path: path.join(output, filename) })
}

const results = []
for (const fixture of fixtures) {
    const browser = await fixture.engine.launch({ headless: true, ...(fixture.channel ? { channel: fixture.channel } : {}) })
    try {
        const snapshots = []
        for (const route of ['/sign-in', '/']) {
            // Fresh contexts avoid confusing departing-page WebKit prefetch
            // diagnostics with errors in the stable document under test.
            const context = await browser.newContext({ ...fixture.options, reducedMotion: 'reduce' })
            const page = await context.newPage()
            const errors = [], mutations = []
            const observe = error => errors.push({ name: error.name, message: error.message })
            page.on('pageerror', observe)
            await context.route('**/*', request => {
                if (!['GET', 'HEAD'].includes(request.request().method())) {
                    mutations.push({ method: request.request().method(), path: new URL(request.request().url()).pathname })
                    return request.abort()
                }
                return request.continue()
            })
            const response = await page.goto(new URL(route, origin).href, { waitUntil: 'domcontentloaded' })
            assert.equal(response.status(), 200)
            await page.evaluate(() => document.fonts.ready)
            const panel = page.locator(route === '/' ? '[data-home-intro="true"]:visible' : '[data-auth-card="true"]:visible')
            await panel.waitFor()
            if (fixture.candidate) await page.locator('[data-light-glass-panel][data-tahoe-chromium-optics="refract"]:visible').first().waitFor()
            else await page.waitForTimeout(400)
            const contract = await panelContract(panel)
            assert.equal(contract.radius, '40px')
            assert.equal(contract.tone, 'dark')
            assert.equal(contract.lighting, 'uniform')
            assert.equal(contract.profile, 'prism-top')
            if (route === '/') {
                assert.deepEqual(contract, snapshots[0].contract, 'Homepage must share the sign-in material contract')
                const hero = page.locator('[data-home-hero="true"]')
                const heroStyle = await hero.evaluate(element => {
                    const style = getComputedStyle(element)
                    const bounds = element.getBoundingClientRect()
                    return { background: style.backgroundColor, backgroundImage: style.backgroundImage, border: style.borderWidth, shadow: style.boxShadow, backdrop: style.backdropFilter, color: style.color, height: bounds.height, viewportHeight: innerHeight,
                        surfaceCount: element.querySelectorAll('[data-tahoe-glass-surface]').length,
                        firstWordTop: element.firstElementChild.getBoundingClientRect().top,
                        titleSize: Number.parseFloat(getComputedStyle(element.querySelector('h1')).fontSize) }
                })
                assert.equal(heroStyle.background, 'rgba(0, 0, 0, 0)')
                assert.equal(heroStyle.backgroundImage, 'none')
                assert.equal(heroStyle.border, '0px')
                assert.equal(heroStyle.shadow, 'none')
                assert.equal(heroStyle.backdrop, 'none')
                assert.equal(heroStyle.color, 'rgb(255, 255, 255)')
                assert.equal(heroStyle.surfaceCount, 0)
                assert(heroStyle.height >= heroStyle.viewportHeight && heroStyle.titleSize >= 40)
                assert(heroStyle.firstWordTop >= 88, 'Opening text must clear fixed navigation')
                for (const text of ['Clarify', 'Organise', 'Present', 'Discover']) assert(await hero.getByText(text, { exact: true }).isVisible())
                const demo = panel.getByRole('figure', { name: 'nsso profile preview' })
                assert.equal(await demo.locator('figcaption').textContent(), 'A demo of a nsso profile')
                const order = await page.evaluate(() => {
                    const intro = document.querySelector('[data-home-intro]')
                    const nodes = [intro.querySelector('p'), intro.querySelector('h2'), intro.querySelector('figure'), intro.querySelector('[data-home-story]'), document.getElementById('home-claim-title'), document.getElementById('choose-profile-name')]
                    return nodes.every((element, index) => element && (!index || Boolean(nodes[index - 1].compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)))
                })
                assert(order, 'Heading, demo, story and claim must follow the requested order')
                assert.equal(await page.locator('#choose-profile-name').count(), 1)
                assert.equal(await page.getByRole('heading', { name: 'Your whole story in one profile', exact: true }).count(), 1)
                assert.equal(await demo.locator('video').getAttribute('src'), null, 'Reduced-motion preview must remain lazy')
                await page.screenshot({ path: path.join(output, `${fixture.name}-hero.png`) })
                await capture(page, '[data-home-intro]', `${fixture.name}-intro.png`)
                await capture(page, '#home-claim-title', `${fixture.name}-claim.png`)
                const input = page.getByRole('textbox', { name: 'Profile name', exact: true })
                const button = page.getByRole('button', { name: 'CLAIM IT', exact: true })
                await button.waitFor()
                assert.equal(await page.getByRole('form', { name: 'Choose your profile name' }).locator('[role="status"]').textContent(), '')
                const field = page.locator('[data-tahoe-glass-surface="recessed"]').filter({ has: input })
                const fieldRect = await field.boundingBox(), buttonRect = await button.boundingBox()
                assert(buttonRect.y >= fieldRect.y + fieldRect.height + 12)
                assert(Math.abs(buttonRect.width - fieldRect.width) < 1)
                assert(buttonRect.height >= 44 && fieldRect.height >= 44)
                await input.focus()
                const focus = await field.evaluate(element => ({ style: getComputedStyle(element).outlineStyle, width: getComputedStyle(element).outlineWidth }))
                assert.equal(focus.style, 'solid')
                assert.equal(focus.width, '2px')
                await input.fill('Bad Name!')
                await button.click()
                assert.equal(await input.getAttribute('aria-invalid'), 'true')
                assert((await page.getByRole('form', { name: 'Choose your profile name' }).getByRole('status').textContent()).length > 0)
                const cta = page.locator('[data-home-create-profile]')
                if (fixture.options.viewport.width < 1024) {
                    await cta.scrollIntoViewIfNeeded()
                    assert(await cta.isVisible())
                    assert.equal(await cta.getAttribute('data-tahoe-glass-tone'), 'dark')
                    assert.equal(await cta.getAttribute('data-tahoe-glass-tint'), 'light')
                    const fills = await cta.evaluate(element => [...element.children].map(child => getComputedStyle(child)).filter(style => style.backgroundColor === 'rgb(255, 255, 255)').map(style => Number(style.opacity)))
                    assert(fills.some(opacity => opacity >= 0.2), 'Create-profile CTA must have a real fill')
                    await page.screenshot({ path: path.join(output, `${fixture.name}-cta.png`) })
                }
                if (!fixture.candidate) assert.equal(await page.locator('[data-tahoe-chromium-optics]').count(), 0)
                snapshots.push({ route, contract, heroStyle, fieldRect, buttonRect })
            } else {
                const logo = panel.locator('img[alt="nsso"]')
                await logo.evaluate(image => image.decode())
                assert.equal(await logo.evaluate(image => getComputedStyle(image).filter), 'none')
                snapshots.push({ route, contract })
            }
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), fixture.options.viewport.width)
            assert.deepEqual(errors, [])
            assert.deepEqual(mutations, [])
            page.off('pageerror', observe)
            await context.close()
        }
        results.push({ fixture: fixture.name, browser: browser.version(), snapshots })
        console.log(`${fixture.name}: home order, sign-in material, responsive claim and filled CTA passed`)
    } finally { await browser.close() }
}
await writeFile(path.join(output, 'report.json'), JSON.stringify({ at: new Date().toISOString(), origin: origin.origin, limitation: 'Browser/device emulation; no real account, claim or assistant mutations.', results }, null, 2) + '\n')
console.log(`Evidence: ${output}/report.json`)
