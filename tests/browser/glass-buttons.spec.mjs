import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
function actualActionMarkup(file, attribute, value) {
    const source = ts.createSourceFile(file, readFileSync(root + file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    let markup
    const visit = node => {
        if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(source) === attribute && (value === undefined || prop.initializer?.text === value))) markup = node.getText(source)
        ts.forEachChild(node, visit)
    }
    visit(source)
    if (!markup) throw Error(`Missing actual action fixture: ${file} ${attribute}`)
    return markup
}
const homeCreateAction = actualActionMarkup('src/app/page.tsx', 'data-home-create-profile')
const creatorBackAction = actualActionMarkup('src/app/dashboard/products/[id]/creator/page.tsx', 'aria-label', 'Back to dashboard')
let bundle, css
const fixture = `
  import React,{useState}from'react';import{createRoot}from'react-dom/client';
  import GlassButton from './src/components/ui/GlassButton';
  import {TahoeGlassButton,TahoeGlassSurface}from'./src/components/ui/tahoe-glass/TahoeGlassSurface';
  import {TahoeGlassEngineContext}from'./src/components/providers/TahoeGlassProvider';
  import ConfirmDeleteDialog from './src/app/dashboard/components/ConfirmDeleteDialog';
  import CreateProfileButton from './src/components/ui/CreateProfileButton';
  import {ChevronLeft}from'lucide-react';
  const material={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'button-fixture',reducedMotion:false,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
  window.buttonSubmits=[];window.buttonClaims=0;window.buttonLinks=0;window.disabledClicks=0;
  function App(){const user=null;const router={push(){}};const[selected,setSelected]=useState(false);const[confirmOpen,setConfirmOpen]=useState(false);const[reduceMotion,setReduceMotion]=useState(false);window.showConfirmFixture=setConfirmOpen;window.setFixtureReducedMotion=setReduceMotion;return <TahoeGlassEngineContext.Provider value={{...material,diagnostics:{...material.diagnostics,reducedMotion:reduceMotion}}}><main>
    <form onSubmit={event=>{event.preventDefault();window.buttonSubmits.push(new FormData(event.currentTarget).get('email'))}}>
      <label>Email<input name="email" type="email" required autoComplete="email"/></label>
      <GlassButton data-testid="sign-in" tone="dark" variant="shiny" type="submit">Sign In</GlassButton>
    </form>
    <GlassButton data-testid="claim" tone="dark" onClick={()=>window.buttonClaims++}>Claim it</GlassButton>
    <TahoeGlassSurface data-testid="header-link" as="a" variant="button" href="#destination" tone="dark" className="inline-flex min-h-11 items-center px-4 py-2 text-[15px] font-semibold" onClick={event=>{event.preventDefault();window.buttonLinks++}}>SIGN IN / SIGN UP</TahoeGlassSurface>
    <TahoeGlassButton data-testid="disabled" disabled onClick={()=>window.disabledClicks++}>Unavailable</TahoeGlassButton>
    <TahoeGlassButton data-testid="selected" tone="dark" aria-pressed={selected} onClick={()=>setSelected(!selected)} contentClassName={selected?'text-emerald-950':'text-slate-950'}>Select</TahoeGlassButton>
    <TahoeGlassButton data-testid="light-tone" tone="light" contentClassName="text-white">Light label</TahoeGlassButton>
    <TahoeGlassButton data-testid="default-tone">Default black label</TahoeGlassButton>
    <TahoeGlassButton data-testid="muted-tone" tone="light" contentClassName="text-white/80">Muted label</TahoeGlassButton>
    <TahoeGlassButton data-testid="selected-tone" tone="light" contentClassName="text-pink-200">Selected label</TahoeGlassButton>
    <TahoeGlassButton data-testid="danger-tone" tone="light" contentClassName="text-red-200">Danger label</TahoeGlassButton>
    <TahoeGlassSurface data-testid="light-link" as="a" variant="pill" href="#destination" tone="light" className="inline-flex px-6 py-3" contentClassName="text-white/80">Light link</TahoeGlassSurface>
    <CreateProfileButton/>
    ${homeCreateAction}
    ${creatorBackAction}
    <TahoeGlassSurface data-testid="badge" variant="pill">Coming soon</TahoeGlassSurface>
    <p id="destination">Next step</p>
    <ConfirmDeleteDialog open={confirmOpen} name="fixture item" onClose={()=>setConfirmOpen(false)} onConfirm={()=>{}}/>
  </main></TahoeGlassEngineContext.Provider>}
  const app=createRoot(document.getElementById('root'));window.disposeFixture=()=>app.unmount();app.render(<App/>);
`

test.beforeAll(async () => {
    const files = ['src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/GlassButton.tsx', 'src/components/ui/CreateProfileButton.tsx', 'src/components/ui/tahoe-glass/TahoeGlassOverlays.tsx', 'src/app/dashboard/components/ConfirmDeleteDialog.tsx', 'src/app/page.tsx', 'src/app/dashboard/products/[id]/creator/page.tsx']
    const candidates = [...files.map(file => readFileSync(root + file, 'utf8')), fixture].flatMap(source => [...source.matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates)
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' }, stdin: { resolveDir: root, loader: 'tsx', contents: fixture } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    await page.route('https://nsso.test/**', route => new URL(route.request().url()).pathname === '/fixture.js'
        ? route.fulfill({ contentType: 'application/javascript', body: bundle })
        : route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:linear-gradient(120deg,#9cc6df,#d7c9c2);font-family:Arial}main{display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:24px}form{display:flex;gap:16px;align-items:center}input{display:block}*{box-sizing:border-box}</style><div id="root"></div><script src="/fixture.js"></script>' }))
    await page.goto('https://nsso.test/glass-buttons')
    await page.addStyleTag({ content: css })
    await expect(page.getByTestId('sign-in')).toBeVisible()
    return errors
}

async function finish(page, errors) {
    await page.evaluate(() => window.disposeFixture())
    expect(errors).toEqual([])
}

async function labelContrast(button) {
    const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    // An accessible-name locator stops matching when its glyphs are hidden.
    // Resolve stable handles first, while preserving the native button DOM.
    const target = await button.elementHandle()
    const label = await button.locator('[data-tahoe-button-content]').elementHandle()
    const paint = await label.evaluate(el => {
        const r = el.getBoundingClientRect(), parent = el.parentElement.getBoundingClientRect()
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(el).color; context.fillRect(0, 0, 1, 1)
        return { text: [...context.getImageData(0, 0, 1, 1).data], x: r.left - parent.left, y: r.top - parent.top, width: r.width, height: r.height }
    })
    // Hide only the glyphs in this synthetic fixture to measure the actual
    // rendered satin directly beneath their unchanged box, including sheen.
    await label.evaluate(el => { el.style.visibility = 'hidden' })
    const { data, info } = await sharp(await target.screenshot({ scale: 'css' })).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    await label.evaluate(el => { el.style.visibility = '' })
    let lowest = Infinity
    for (let y = Math.ceil(paint.y); y < Math.floor(paint.y + paint.height); y += 2) for (let x = Math.ceil(paint.x); x < Math.floor(paint.x + paint.width); x += 2) {
        const background = [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3)]
        const foreground = background.map((value, index) => paint.text[index] * (paint.text[3] / 255) + value * (1 - paint.text[3] / 255))
        const a = luminance(foreground), b = luminance(background)
        lowest = Math.min(lowest, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))
    }
    expect(Number.isFinite(lowest), 'Rendered label area must contain measurable backing pixels').toBe(true)
    return lowest
}

test('sign-in, claim and semantic navigation share one satin material without changing their native actions', async ({ page }) => {
    const errors = await mount(page)
    const coats = []
    for (const id of ['sign-in', 'claim', 'header-link']) {
        const button = page.getByTestId(id)
        await expect(button).toHaveAttribute('data-tahoe-glass-button', 'satin')
        coats.push(await button.locator('[data-tahoe-button-coat]').evaluate(el => {
            const s = getComputedStyle(el)
            return { background: s.backgroundImage, shadow: s.boxShadow, pointerEvents: s.pointerEvents }
        }))
    }
    expect(coats[0]).toEqual(coats[1]); expect(coats[1]).toEqual(coats[2])
    expect(coats[0].background).toContain('linear-gradient')
    expect(coats[0].shadow).toContain('inset')
    expect(coats[0].pointerEvents).toBe('none')
    await expect(page.getByTestId('badge')).not.toHaveAttribute('data-tahoe-glass-button')
    await expect(page.getByTestId('badge').locator('[data-tahoe-button-reflection]')).toHaveCount(0)
    await expect(page.getByTestId('header-link')).toHaveAttribute('href', '#destination')
    await expect(page.getByTestId('header-link').locator('button')).toHaveCount(0)
    // Native validation must still stop an empty submission; entered values and
    // keyboard submission must pass through the real form/button unchanged.
    await page.getByTestId('sign-in').click()
    expect(await page.evaluate(() => window.buttonSubmits)).toEqual([])
    await page.getByRole('textbox', { name: 'Email' }).fill('fixture@example.test')
    await page.getByRole('textbox', { name: 'Email' }).press('Enter')
    expect(await page.evaluate(() => window.buttonSubmits)).toEqual(['fixture@example.test'])
    await page.getByTestId('claim').click()
    await page.getByTestId('header-link').focus()
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => [window.buttonClaims, window.buttonLinks])).toEqual([1, 1])
    await expect(page.getByTestId('disabled')).toBeDisabled()
    await page.getByTestId('disabled').evaluate(el => el.click())
    expect(await page.evaluate(() => window.disabledClicks)).toBe(0)
    const initialSelectionColor = await page.getByTestId('selected').locator('[data-tahoe-button-content]').evaluate(el => getComputedStyle(el).color)
    await page.getByTestId('selected').click()
    await expect(page.getByTestId('selected')).toHaveAttribute('aria-pressed', 'true')
    expect(await page.getByTestId('selected').locator('[data-tahoe-button-content]').evaluate(el => getComputedStyle(el).color)).not.toBe(initialSelectionColor)
    await finish(page, errors)
})

test('reflection responds to pointer and keyboard without changing layout or hiding the label', async ({ page }) => {
    const errors = await mount(page)
    const claim = page.getByTestId('claim')
    const layout = () => claim.evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight, left: el.offsetLeft, top: el.offsetTop }))
    const before = await layout()
    const reflection = claim.locator('[data-tahoe-button-reflection]')
    const initial = await reflection.evaluate(el => getComputedStyle(el, '::before').opacity)
    expect(initial).toBe('0')
    if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
        await claim.hover()
        await expect.poll(() => reflection.evaluate(el => getComputedStyle(el, '::before').opacity)).toBe('1')
        expect(await layout()).toEqual(before)
        const center = await claim.boundingBox()
        await page.mouse.move(center.x + center.width / 2, center.y + center.height / 2)
        await page.mouse.down()
        await expect.poll(() => reflection.evaluate(el => getComputedStyle(el).boxShadow)).not.toContain('rgba(255, 255, 255, 0)')
        expect(await layout()).toEqual(before)
        await expect(claim.locator('[data-tahoe-button-content]')).toHaveCSS('z-index', '20')
        await page.mouse.up()
    }
    await page.getByTestId('sign-in').focus()
    await page.keyboard.press('Tab')
    await expect(claim).toBeFocused()
    await expect(claim).toHaveCSS('outline-style', 'solid')
    await expect(claim).toHaveCSS('outline-width', '2px')
    await page.keyboard.press('Space')
    expect(await page.evaluate(() => window.buttonClaims)).toBeGreaterThan(0)
    await finish(page, errors)
})

test('reduced motion removes the sweep; reduced transparency and forced colors keep solid readable controls', async ({ page, context }) => {
    const errors = await mount(page)
    const claim = page.getByTestId('claim')
    const reflection = claim.locator('[data-tahoe-button-reflection]')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await claim.hover()
    expect(await reflection.evaluate(el => getComputedStyle(el, '::before').display)).toBe('none')
    await expect(claim).toHaveCSS('transition-duration', '0s')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const cdp = await context.newCDPSession(page)
    for (const feature of ['prefers-reduced-transparency', 'forced-colors']) {
        await cdp.send('Emulation.setEmulatedMedia', { features: [
            { name: 'prefers-reduced-transparency', value: feature === 'prefers-reduced-transparency' ? 'reduce' : 'no-preference' },
            { name: 'forced-colors', value: feature === 'forced-colors' ? 'active' : 'none' },
        ] })
        for (const id of ['sign-in', 'claim', 'header-link', 'light-tone']) {
            const control = page.getByTestId(id)
            await expect(control.locator('[data-tahoe-button-reflection]')).toHaveCSS('display', 'none')
            const material = await control.evaluate(el => {
                const coat = getComputedStyle(el.querySelector('[data-tahoe-button-coat]'))
                const label = getComputedStyle(el.querySelector('[data-tahoe-button-content]'))
                return { background: coat.backgroundColor, image: coat.backgroundImage, filter: coat.backdropFilter, color: label.color }
            })
            expect(material.image).toBe('none')
            expect(material.filter).toBe('none')
            expect(material.background).not.toContain('rgba')
            expect(material.color).not.toBe(material.background)
        }
    }
    await cdp.detach()
    await finish(page, errors)
})

test('pale and dark satin actions retain readable labels over white and black backdrops', async ({ page }) => {
    const errors = await mount(page)
    for (const backing of ['#fff', '#000']) {
        await page.evaluate(color => { document.body.style.background = color }, backing)
        for (const id of ['sign-in', 'default-tone', 'light-tone', 'muted-tone', 'selected-tone', 'danger-tone', 'light-link']) {
            expect(await labelContrast(page.getByTestId(id)), `${id} label contrast on ${backing}`).toBeGreaterThanOrEqual(4.5)
        }
    }
    await finish(page, errors)
})

test('normalized white and danger callers stay legible at the real sheen peak and keep default black buttons pale', async ({ page }) => {
    const errors = await mount(page)
    await page.evaluate(() => { document.body.style.background = '#fff' })
    await expect(page.getByTestId('default-tone')).toHaveAttribute('data-tahoe-glass-tone', 'inherit')
    const defaultCoat = await page.getByTestId('default-tone').locator('[data-tahoe-button-coat]').evaluate(el => getComputedStyle(el).backgroundImage)
    expect(defaultCoat).toBe(await page.getByTestId('sign-in').locator('[data-tahoe-button-coat]').evaluate(el => getComputedStyle(el).backgroundImage))
    // Freeze the actual application gradient with its brightest part over the
    // label. Sampling only the completed off-screen sweep would miss washout.
    await page.addStyleTag({ content: '[data-tahoe-glass-tone="light"] > [data-tahoe-button-reflection]::before{opacity:1!important;transition:none!important;transform:translateX(183.33333%) skewX(-18deg)!important}' })
    for (const id of ['light-tone', 'muted-tone', 'selected-tone', 'danger-tone', 'light-link']) {
        expect(await labelContrast(page.getByTestId(id)), `${id} contrast at sheen peak on white`).toBeGreaterThanOrEqual(4.5)
    }
    await page.evaluate(() => window.showConfirmFixture(true))
    const dialog = page.getByRole('dialog', { name: 'Delete fixture item?' })
    await expect(dialog).toBeVisible()
    for (const name of ['Keep item', 'Delete']) {
        const action = dialog.getByRole('button', { name, exact: true })
        await expect(action).toHaveAttribute('data-tahoe-glass-tone', 'light')
        expect(await labelContrast(action), `Actual confirmation ${name} contrast`).toBeGreaterThanOrEqual(4.5)
    }
    await dialog.getByRole('button', { name: 'Keep item' }).click()
    await expect(dialog).toHaveCount(0)
    await finish(page, errors)
})

test('reduced motion suppresses independent Tailwind hover and press scale on the actual profile action', async ({ page }) => {
    const errors = await mount(page)
    const action = page.locator('[data-home-create-profile]')
    await expect(action).toHaveClass(/hover:scale-105/)
    for (const mode of ['media', 'provider']) {
        if (mode === 'media') await page.emulateMedia({ reducedMotion: 'reduce' })
        else {
            await page.emulateMedia({ reducedMotion: 'no-preference' })
            await page.evaluate(() => window.setFixtureReducedMotion(true))
            await expect(action).toHaveAttribute('data-tahoe-button-reduced-motion', 'true')
        }
        await action.hover()
        await expect(action).toHaveCSS('scale', 'none')
        await expect(action).toHaveCSS('transform', 'none')
        await page.mouse.down()
        await expect(action).toHaveCSS('scale', 'none')
        await expect(action).toHaveCSS('transform', 'none')
        await page.mouse.move(0, 0)
        await page.mouse.up()
    }
    await finish(page, errors)
})

test('native and anchor actions share the same press scale without compounded Tailwind transforms', async ({ page }) => {
    const errors = await mount(page)
    const ratios = []
    for (const action of [page.getByTestId('claim'), page.getByTestId('header-link')]) {
        await action.hover()
        await expect(action).toHaveCSS('scale', 'none')
        const before = await action.boundingBox()
        await page.mouse.down()
        await expect.poll(() => action.evaluate(el => {
            const matrix = getComputedStyle(el).transform.match(/matrix\(([^,]+)/)
            return Number(matrix?.[1])
        })).toBeCloseTo(0.98, 3)
        const pressed = await action.boundingBox()
        ratios.push(pressed.width / before.width)
        await page.mouse.move(0, 0)
        await page.mouse.up()
        await expect(action).toHaveCSS('transform', 'none')
    }
    expect(ratios[0]).toBeCloseTo(0.98, 3)
    expect(ratios[1]).toBeCloseTo(ratios[0], 3)
    await finish(page, errors)
})

test('solid preferences reset actual nested homepage labels and important creator colors on both Canvas schemes', async ({ page, context }) => {
    const errors = await mount(page)
    const cdp = await context.newCDPSession(page)
    for (const scheme of ['light', 'dark']) {
        await page.addStyleTag({ content: `:root{color-scheme:${scheme}}` })
        for (const feature of ['prefers-reduced-transparency', 'forced-colors']) {
            await cdp.send('Emulation.setEmulatedMedia', { features: [
                { name: 'prefers-color-scheme', value: scheme },
                { name: 'prefers-reduced-transparency', value: feature === 'prefers-reduced-transparency' ? 'reduce' : 'no-preference' },
                { name: 'forced-colors', value: feature === 'forced-colors' ? 'active' : 'none' },
            ] })
            const homeAction = page.locator('[data-home-create-profile]')
            const nestedLabel = homeAction.locator('[data-tahoe-button-content] > span')
            const expected = await homeAction.locator('[data-tahoe-button-content]').evaluate(el => getComputedStyle(el).color)
            await expect(nestedLabel).toHaveCSS('color', expected)
            expect(await labelContrast(homeAction), `Actual nested home CTA in ${feature}/${scheme}`).toBeGreaterThanOrEqual(4.5)
            const creatorAction = page.getByRole('button', { name: 'Back to dashboard', exact: true })
            await expect(creatorAction.locator('[data-tahoe-button-content]')).toHaveCSS('color', expected)
            await expect(creatorAction.locator('svg')).toHaveCSS('color', expected)
        }
    }
    await cdp.detach()
    await finish(page, errors)
})
