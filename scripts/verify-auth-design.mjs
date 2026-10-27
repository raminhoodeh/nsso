import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium, webkit, devices } from 'playwright'

// Real styled routes; no credentials, OAuth, account creation or data writes.
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3027')
assert(['127.0.0.1', 'localhost', 'www.nsso.me', 'nsso.me'].includes(origin.hostname))
assert(!origin.username && !origin.password && !origin.search && !origin.hash)
const output = path.resolve(`private/test-results/auth-design-${Date.now()}`)
await mkdir(output, { recursive: true })
const fixtures = [
    { name: 'chrome-desktop', engine: chromium, channel: 'chrome', options: { viewport: { width: 1440, height: 1000 } }, candidate: true },
    { name: 'chrome-android', engine: chromium, channel: 'chrome', options: devices['Pixel 7'], candidate: false },
    { name: 'webkit-iphone', engine: webkit, options: devices['iPhone 13'], candidate: false },
    { name: 'chrome-320', engine: chromium, channel: 'chrome', options: { ...devices['Pixel 7'], viewport: { width: 320, height: 740 } }, candidate: false },
    { name: 'webkit-320', engine: webkit, options: { ...devices['iPhone 13'], viewport: { width: 320, height: 740 } }, candidate: false },
]

async function uniformMap(card) {
    return card.evaluate(async element => {
        const href = element.nextElementSibling?.querySelector('feImage')?.getAttribute('href')
        if (!href?.startsWith('data:image/png')) throw Error('Missing legacy displacement field')
        const image = new Image()
        image.src = href
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
        const expected = [128, 144, 128, 255]
        let mismatchedPixels = 0
        for (let i = 0; i < data.length; i += 4) {
            if (expected.some((channel, offset) => data[i + offset] !== channel)) mismatchedPixels++
        }
        return { width: canvas.width, height: canvas.height, expected, mismatchedPixels }
    })
}

async function controlStyle(locator, field = false) {
    return locator.evaluate((control, field) => {
        const element = field ? control.closest('[data-tahoe-glass-surface]') : control
        const style = getComputedStyle(element)
        const bounds = element.getBoundingClientRect()
        return {
            height: Math.round(bounds.height * 100) / 100,
            width: Math.round(bounds.width * 100) / 100,
            radius: style.borderRadius,
            padding: style.padding,
            color: getComputedStyle(control).color,
            fontSize: getComputedStyle(control).fontSize,
            layers: [...element.children].filter(child => child.getAttribute('aria-hidden') === 'true').map(child => {
                const paint = getComputedStyle(child)
                // Rim angle/intensity responds to each control's position in
                // the scene. Compare the same declared lighting contract,
                // not different computed angles on differently tall forms.
                return { background: paint.backgroundColor, image: child.style.backgroundImage, opacity: child.style.opacity, shadow: child.style.boxShadow }
            }),
        }
    }, field)
}

const results = []
for (const fixture of fixtures) {
    const browser = await fixture.engine.launch({ headless: true, ...(fixture.channel ? { channel: fixture.channel } : {}) })
    try {
        const context = await browser.newContext({ ...fixture.options, reducedMotion: 'reduce' })
        await context.addInitScript(() => {
            // Observe the actual iPhone WebGL upload/draw without replacing
            // textures or changing rendering. WebKit has no SVG map href.
            window.__authFieldUploads = []
            window.__authDraws = []
            const prototype = window.WebGLRenderingContext?.prototype
            if (!prototype) return
            for (const method of ['texImage2D', 'texSubImage2D']) {
                const original = prototype[method]
                prototype[method] = function (...args) {
                    const result = original.apply(this, args)
                    const source = args.at(-1)
                    if (this.canvas.closest('[data-auth-card]') && this.getParameter(this.ACTIVE_TEXTURE) === this.TEXTURE1 && source instanceof HTMLCanvasElement) {
                        const { data } = source.getContext('2d').getImageData(0, 0, source.width, source.height)
                        let mismatchedPixels = 0
                        for (let i = 0; i < data.length; i += 4) if (data[i] !== 128 || data[i + 1] !== 144 || data[i + 2] !== 128 || data[i + 3] !== 255) mismatchedPixels++
                        window.__authFieldUploads.push({ width: source.width, height: source.height, mismatchedPixels })
                    }
                    return result
                }
            }
            const draw = prototype.drawArrays
            prototype.drawArrays = function (...args) {
                const result = draw.apply(this, args)
                if (this.canvas.closest('[data-auth-card]')) {
                    const alphas = []
                    // Read synchronously before the non-preserved buffer is
                    // presented; compare across a horizontal row, not cloud RGB.
                    for (const fraction of [0.1, 0.3, 0.5, 0.7, 0.9]) {
                        const pixel = new Uint8Array(4)
                        this.readPixels(Math.floor(this.drawingBufferWidth * fraction), Math.floor(this.drawingBufferHeight * 0.6), 1, 1, this.RGBA, this.UNSIGNED_BYTE, pixel)
                        alphas.push(pixel[3])
                    }
                    if (Math.max(...alphas) > 0) window.__authDraws.push(alphas)
                }
                return result
            }
        })
        const mutations = [], errors = []
        await context.route('**/*', route => {
            if (!['GET', 'HEAD'].includes(route.request().method())) {
                mutations.push({ method: route.request().method(), pathname: new URL(route.request().url()).pathname })
                return route.abort()
            }
            return route.continue()
        })
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(error.message))
        const snapshots = []
        for (const route of ['/sign-in', '/sign-up', '/sign-up?name=design_test']) {
            const response = await page.goto(new URL(route, origin).href, { waitUntil: 'domcontentloaded' })
            assert.equal(response.status(), 200)
            // Next's cached route Activities may retain a hidden form. Check
            // the one painted/interactable auth card, not a hidden route tree.
            const card = page.locator('[data-auth-card="true"]:visible')
            await card.waitFor()
            await page.evaluate(() => document.fonts.ready)
            assert.equal(await card.getAttribute('data-tahoe-displacement-profile'), 'prism-top')
            assert.equal(await card.getAttribute('data-tahoe-material-lighting'), 'uniform')
            if (fixture.candidate) await page.locator('[data-auth-card][data-tahoe-chromium-optics="refract"]:visible').waitFor()
            else if (fixture.engine !== webkit) {
                assert.equal(await card.getAttribute('data-tahoe-chromium-optics'), null)
                await page.waitForFunction(element => element.nextElementSibling?.querySelector('feImage')?.getAttribute('href')?.startsWith('data:image/png'), await card.elementHandle())
            }
            let ownedScene = null
            if (fixture.engine === webkit) {
                assert.equal(await card.getAttribute('data-tahoe-chromium-optics'), null)
                await page.waitForFunction(() => window.__authFieldUploads.length > 0 && window.__authDraws.length > 0)
                ownedScene = await page.evaluate(() => ({ uploads: window.__authFieldUploads, alphas: window.__authDraws.at(-1) }))
                assert(ownedScene.uploads.every(upload => upload.mismatchedPixels === 0), 'Actual iPhone uploaded field must be uniform')
                assert(Math.max(...ownedScene.alphas) - Math.min(...ownedScene.alphas) <= 1, 'Painted iPhone alpha must not contain an oval band')
                assert(Math.min(...ownedScene.alphas) > 0, 'Uniform field must actually paint, not only declare a route')
            }
            const map = fixture.candidate || fixture.engine === webkit ? null : await uniformMap(card)
            if (map) assert.equal(map.mismatchedPixels, 0, `${fixture.name} ${route}: oval field returned`)
            const material = await card.evaluate(element => [...element.children].filter(child => child.tagName === 'SPAN').map(child => getComputedStyle(child).backgroundImage))
            assert(material.every(image => !image.includes('radial-gradient')), 'Radial material lighting must stay disabled')
            const logo = card.locator('img[alt="nsso"]')
            await logo.evaluate(image => image.decode())
            const logoStyle = await logo.evaluate(image => ({ filter: getComputedStyle(image).filter, opacity: getComputedStyle(image).opacity, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, declaredWidth: image.getAttribute('width'), declaredHeight: image.getAttribute('height'), ratio: image.getBoundingClientRect().width / image.getBoundingClientRect().height }))
            assert.equal(logoStyle.filter, 'none')
            assert.equal(logoStyle.opacity, '1')
            // Next/Image density-corrects natural dimensions on DPR2/3. The
            // reserved intrinsic attributes and painted ratio remain fixed.
            assert(logoStyle.naturalWidth > 0 && logoStyle.naturalHeight > 0)
            assert.equal(logoStyle.declaredWidth, '458')
            assert.equal(logoStyle.declaredHeight, '224')
            assert(Math.abs(logoStyle.ratio - 458 / 224) < 0.01)
            const email = card.getByLabel('Email address', { exact: true })
            const password = card.getByLabel('Password', { exact: true })
            await email.fill('visual-test@example.invalid')
            await password.fill('Visual-test-only1!')
            const styles = {
                email: await controlStyle(email, true),
                password: await controlStyle(password, true),
                google: await controlStyle(card.getByRole('button', { name: 'Continue with Google', exact: true })),
                github: await controlStyle(card.getByRole('button', { name: 'Continue with GitHub', exact: true })),
                primary: await controlStyle(card.getByRole('button', { name: route === '/sign-in' ? 'Sign In' : 'Create Account', exact: true })),
            }
            for (const style of Object.values(styles)) assert(style.height >= 44, 'Touch controls must remain at least 44px tall')
            const geometry = await card.evaluate(element => ({ radius: getComputedStyle(element).borderRadius, padding: getComputedStyle(element).padding, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, backend: element.dataset.tahoeRefractionBackend, source: element.dataset.tahoeBackdropSource }))
            assert.equal(geometry.documentWidth, geometry.viewportWidth)
            assert.equal(geometry.radius, '40px')
            if (snapshots.length) assert.deepEqual(styles, snapshots[0].styles, `${fixture.name}: signup controls must match sign-in`)
            if (route.includes('?name=')) assert(await page.getByText('This name is a draft, not a reservation. Confirm availability and save it in profile setup.').isVisible())
            const capture = `${fixture.name}-${route.includes('?') ? 'sign-up-name' : route.slice(1)}`
            // A full-page capture stretches a viewport-owned WebGL scene
            // beyond its real framebuffer. Capture actual scroll viewports.
            await page.evaluate(() => window.scrollTo(0, 0))
            await page.waitForTimeout(150)
            await page.screenshot({ path: path.join(output, `${capture}-top.png`) })
            await card.locator('form button[type="submit"]').scrollIntoViewIfNeeded()
            await page.waitForTimeout(150)
            await page.screenshot({ path: path.join(output, `${capture}-controls.png`) })
            snapshots.push({ route, geometry, styles, map, ownedScene, material, logoStyle })
        }
        assert.deepEqual(mutations, [], 'This visual check must not make account/data mutations')
        assert.deepEqual(errors, [], `${fixture.name}: uncaught browser errors`)
        results.push({ fixture: fixture.name, browser: browser.version(), snapshots, mutations, errors })
        await context.close()
        console.log(`${fixture.name}: auth styling parity, uniform field, logo and width checks passed`)
    } finally { await browser.close() }
}
await writeFile(path.join(output, 'report.json'), JSON.stringify({ at: new Date().toISOString(), origin: origin.origin, limitation: 'Read-only browser emulation, not physical-device or real-account authentication testing.', results }, null, 2) + '\n')
console.log(`Evidence: ${output}/report.json`)
