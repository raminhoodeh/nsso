import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css
test.beforeAll(async () => {
    const files = ['src/components/layout/DashboardSidebar.tsx', 'src/components/layout/DeleteProfileDialog.tsx', 'src/components/ui/AskDeityButton.tsx', 'src/components/ui/ComingSoonBadge.tsx', 'src/components/ui/LightButton.tsx', 'src/components/ui/light-button-styles.ts', 'src/components/ui/light-panel.ts', 'src/components/ui/tahoe-glass/TahoeGlassSurface.tsx', 'src/components/ui/tahoe-glass/TahoeBackdropHeader.tsx']
    const candidates = files.flatMap(file => [...readFileSync(root + file, 'utf8').matchAll(/["'`]([^"'`\n]+)["'`]/g)].flatMap(match => match[1].split(/\s+/)))
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build(candidates)
    const result = await build({
        absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'editor-controls-fixture', setup(builder) {
            builder.onResolve({ filter: /^(?:next\/(?:navigation|image|link)|@\/lib\/supabase\/client|@\/components\/providers\/UserProvider|@\/components\/ui\/Toast)$/ }, args => ({ path: args.path, namespace: 'fixture' }))
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ loader: 'tsx', resolveDir: root, contents:
                path === 'next/navigation' ? 'export const useRouter=()=>({push:path=>window.fixtureNavigation.push(path)});export const useSearchParams=()=>new URLSearchParams(location.search);'
                    : path === 'next/image' ? 'export default function Image({priority,fill,...props}){return <img {...props}/>;}'
                        : path === 'next/link' ? 'export default function Link(props){return <a {...props}/>;}'
                            : path.endsWith('supabase/client') ? 'export const createClient=()=>({auth:{signOut:async()=>{window.fixtureSignouts++;return{error:new Error("Synthetic unavailable logout")}}}});'
                                : path.endsWith('UserProvider') ? 'export const useUser=()=>({user:{id:"synthetic-owner",username:"fixture",email:"fixture@example.invalid",permissions:[]}});'
                                    : 'export const useToast=()=>({showToast:(message,type)=>window.fixtureToasts.push({message,type})});',
            }))
        } }],
        stdin: { resolveDir: root, loader: 'tsx', contents: `
            import React from 'react';import {createRoot} from 'react-dom/client';
            import Sidebar from './src/components/layout/DashboardSidebar';
            import Ask from './src/components/ui/AskDeityButton';
            import LightGlassPanel from './src/components/ui/LightGlassPanel';
            import {TahoeGlassSurface} from './src/components/ui/tahoe-glass';
            import {TahoeGlassEngineContext} from './src/components/providers/TahoeGlassProvider';
            window.fixtureNavigation=[];window.fixtureToasts=[];window.fixtureSignouts=0;window.fixtureSubmits=0;window.fixtureDeityEvents=[];
            window.addEventListener('open-deity-chat',event=>window.fixtureDeityEvents.push(event.detail));
            const fallback={diagnostics:{status:'fallback',backend:'css-blur',source:'synthetic-scene',reason:'editor-control-fixture',reducedMotion:true,reducedTransparency:false,surfaceCount:0,visibleSurfaceCount:0,dpr:1}};
            const app=createRoot(document.getElementById('root'));window.fixtureDispose=()=>app.unmount();
            const ask=message=>()=>window.dispatchEvent(new CustomEvent('open-deity-chat',{detail:{initialMessage:message}}));
            const contrast=new URLSearchParams(location.search).has('contrast');
            const scenes=[['card-white','#fff'],['light','#f4f4f4'],['sky','linear-gradient(120deg,#baddec,#739ab7)'],['dark','#10151c']];
            app.render(<TahoeGlassEngineContext.Provider value={fallback}>{contrast?<main style={{padding:24,display:'grid',gap:24}}>{scenes.map(([name,background])=><section key={name} data-contrast-scene={name} style={{background,padding:24}}>{name==='light'?<LightGlassPanel chromiumAppearance="light" style={{padding:24}}><Ask aria-label={'Ask Deity contrast '+name}/></LightGlassPanel>:<TahoeGlassSurface variant="card" tone="light" semanticTint="dark" semanticTintOpacity={.38} style={{padding:24}}><Ask aria-label={'Ask Deity contrast '+name}/></TahoeGlassSurface>}</section>)}</main>:<><Sidebar/><main><form aria-label="Synthetic profile form" onSubmit={event=>{event.preventDefault();window.fixtureSubmits++}}><Ask onClick={ask('profile assistance')}/><Ask aria-label="Ask Deity about links" onClick={ask('link assistance')}/><Ask aria-label="Ask Deity about products and services" onClick={ask('offering assistance')}/><Ask disabled aria-label="Unavailable assistance" onClick={ask('disabled assistance')}/></form></main></>}</TahoeGlassEngineContext.Provider>);
        ` },
    })
    bundle = result.outputFiles[0].text
})

async function mount(page, { contrast = false } = {}) {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://nsso.test/**', route => {
        const path = new URL(route.request().url()).pathname
        if (path === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        if (path.endsWith('.png')) return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="458" height="224"/>' })
        if (path !== '/editor-controls') throw new Error('Unexpected request in isolated editor controls fixture: ' + path)
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#344956;color:white;font-family:Arial}main{padding:120px 24px}form{display:flex;flex-direction:column;align-items:flex-start;gap:12px}@media(min-width:1024px){main{padding-left:320px}}*{box-sizing:border-box}</style><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/editor-controls' + (contrast ? '?contrast=1' : ''))
    await page.addStyleTag({ content: css })
    await expect(page.locator('[data-ask-deity-control]').first()).toBeVisible()
    return errors
}

async function dispose(page, errors) {
    await page.evaluate(() => window.fixtureDispose())
    expect(errors).toEqual([])
}

const paintedColour = (locator, token) => locator.evaluate((element, variable) => {
    // Current Tailwind tokens are OKLCH; inspect their painted sRGB value
    // instead of depending on one browser's computed-colour serialization.
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    const style = getComputedStyle(element)
    const colour = variable ? style.getPropertyValue(variable) : style.color
    if (!colour) throw new Error('Missing rendered theme token: ' + variable)
    context.fillStyle = colour
    context.fillRect(0, 0, 1, 1)
    return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
}, token)

const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)

async function labelContrast(button, selector = '[data-light-button-content]') {
    const target = await button.elementHandle()
    const label = await button.locator(selector).elementHandle()
    const paint = await label.evaluate(element => {
        const bounds = element.getBoundingClientRect(), parent = element.closest('button').getBoundingClientRect()
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1)
        return { text: [...context.getImageData(0, 0, 1, 1).data], x: bounds.left - parent.left, y: bounds.top - parent.top, width: bounds.width, height: bounds.height }
    })
    // Synthetic fixture only: hide glyphs without moving their box to sample
    // the actual painted material underneath the entire label.
    await label.evaluate(element => { element.style.visibility = 'hidden' })
    const { data, info } = await sharp(await target.screenshot({ scale: 'css' })).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    await label.evaluate(element => { element.style.visibility = '' })
    let minimum = Infinity
    for (let y = Math.ceil(paint.y); y < Math.floor(paint.y + paint.height); y += 2) for (let x = Math.ceil(paint.x); x < Math.floor(paint.x + paint.width); x += 2) {
        const background = [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3)]
        const foreground = background.map((value, index) => paint.text[index] * paint.text[3] / 255 + value * (1 - paint.text[3] / 255))
        const a = luminance(foreground), b = luminance(background)
        minimum = Math.min(minimum, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))
    }
    expect(Number.isFinite(minimum)).toBe(true)
    return minimum
}

test('Ask Deity stays visually compact and consistent while retaining full native touch targets and contextual prompts', async ({ page }) => {
    const errors = await mount(page)
    const actions = page.locator('[data-ask-deity-control]:not(:disabled)')
    const measurements = await actions.evaluateAll(elements => elements.map(element => ({
        target: { width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height },
        lens: { width: element.firstElementChild.getBoundingClientRect().width, height: element.firstElementChild.getBoundingClientRect().height },
        font: getComputedStyle(element.firstElementChild).fontSize,
        text: element.textContent,
    })))
    for (const measurement of measurements) {
        expect(measurement.target.height).toBeGreaterThanOrEqual(44)
        expect(measurement.target.width).toBeGreaterThanOrEqual(44)
        expect(measurement.lens.height).toBe(28)
        expect(measurement.font).toBe('12px')
        expect(measurement.text).toBe('Ask Deity')
        expect(measurement.lens.width).toBe(measurements[0].lens.width)
    }
    await page.getByRole('button', { name: 'Ask Deity', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Ask Deity about links', exact: true }).press('Space')
    await page.getByRole('button', { name: 'Ask Deity about products and services', exact: true }).click()
    expect(await page.evaluate(() => window.fixtureDeityEvents)).toEqual([{ initialMessage: 'profile assistance' }, { initialMessage: 'link assistance' }, { initialMessage: 'offering assistance' }])
    expect(await page.evaluate(() => window.fixtureSubmits)).toBe(0)
    await expect(page.getByRole('button', { name: 'Unavailable assistance' })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await dispose(page, errors)
})

test('Ask Deity keeps a visible keyboard focus and readable forced-colour fallback', async ({ page }) => {
    const errors = await mount(page)
    const ask = page.getByRole('button', { name: 'Ask Deity', exact: true })
    await page.keyboard.press('Tab')
    // Desktop sidebar precedes main, so focus the assistance control explicitly
    // after a keyboard input to retain browser focus-visible semantics.
    await ask.focus()
    expect(await ask.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe('none')
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
    const lens = ask.locator('[data-ask-deity-lens]')
    const colours = await lens.evaluate(element => { const style = getComputedStyle(element); return { background: style.backgroundColor, foreground: style.color, transition: style.transitionProperty } })
    expect(colours.foreground).not.toBe(colours.background)
    expect(colours.transition).toBe('none')
    await dispose(page, errors)
})

test('Ask Deity normal and hover labels retain small-text contrast on real shared glass scenes', async ({ page }, testInfo) => {
    const errors = await mount(page, { contrast: true })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const samples = []
    for (const scene of ['card-white', 'light', 'sky', 'dark']) {
        const ask = page.getByRole('button', { name: 'Ask Deity contrast ' + scene, exact: true })
        await ask.scrollIntoViewIfNeeded()
        await page.mouse.move(0, 0)
        const idle = await labelContrast(ask, '[data-ask-deity-lens] > span')
        expect(idle, `Ask Deity idle contrast on ${scene}`).toBeGreaterThanOrEqual(4.5)
        await ask.hover()
        const hover = await labelContrast(ask, '[data-ask-deity-lens] > span')
        expect(hover, `Ask Deity hover contrast on ${scene}`).toBeGreaterThanOrEqual(4.5)
        samples.push({ scene, idle, hover })
    }
    console.log('ASK_DEITY_CONTRAST ' + testInfo.project.name + ' ' + JSON.stringify(samples))
    await testInfo.attach('ask-deity-rendered-contrast', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
    await dispose(page, errors)
})

test.describe('desktop sidebar affordances', () => {
    test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false })
    test('Sign Out retains readable dark-red contrast on opaque white material and a darker hover', async ({ page }, testInfo) => {
        const errors = await mount(page)
        const signout = page.getByRole('complementary').getByRole('button', { name: 'Sign Out', exact: true })
        const samples = []
        await expect(signout).toHaveAttribute('data-nsso-control', 'white')
        await expect(signout.locator('[data-tahoe-button-coat], [data-tahoe-button-reflection]')).toHaveCount(0)
        const idleExpected = await paintedColour(signout, '--color-rose-800')
        const hoverExpected = await paintedColour(signout, '--color-rose-950')
        const box = await signout.boundingBox()
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
        for (const backing of ['#fff', '#000']) {
            await page.evaluate(colour => { document.body.style.background = colour }, backing)
            await page.mouse.move(800, 400)
            await expect(signout).toHaveCSS('background-color', 'rgb(244, 245, 248)')
            await expect.poll(() => paintedColour(signout)).toEqual(idleExpected)
            const idleColour = await paintedColour(signout)
            const idle = await labelContrast(signout)
            expect(idle, `Sign Out idle contrast on ${backing}`).toBeGreaterThanOrEqual(4.5)
            await signout.hover()
            await expect(signout).toHaveCSS('background-color', 'rgb(255, 255, 255)')
            await expect.poll(() => paintedColour(signout)).toEqual(hoverExpected)
            const hoverColour = await paintedColour(signout)
            expect(luminance(hoverColour)).toBeLessThan(luminance(idleColour))
            const hover = await labelContrast(signout)
            expect(hover, `Sign Out hover contrast on ${backing}`).toBeGreaterThanOrEqual(4.5)
            samples.push({ backing, hover, idle, idleColour, hoverColour })
        }
        await testInfo.attach('sign-out-rendered-contrast', { body: JSON.stringify(samples, null, 2), contentType: 'application/json' })
        await dispose(page, errors)
    })

    test('selection outlines the whole navigation item; footer actions preserve safe behaviour and clearer emphasis', async ({ page }) => {
        const errors = await mount(page)
        const sidebar = page.getByRole('complementary')
        const active = sidebar.getByRole('button', { name: 'Edit Profile', exact: true })
        await expect(active).toHaveAttribute('aria-current', 'page')
        await expect(active).toHaveAttribute('data-nsso-control', 'white')
        await expect(active).toHaveCSS('background-color', 'rgb(255, 255, 255)')
        const activeMaterial = await active.evaluate(element => {
            const style = getComputedStyle(element)
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
            const context = canvas.getContext('2d'); context.fillStyle = style.borderTopColor; context.fillRect(0, 0, 1, 1)
            return { sides: ['Top', 'Right', 'Bottom', 'Left'].map(side => ({ width: style[`border${side}Width`], style: style[`border${side}Style`], colour: style[`border${side}Color`] })), borderPaint: [...context.getImageData(0, 0, 1, 1).data], radius: style.borderRadius, shadow: style.boxShadow }
        })
        expect(activeMaterial.sides.every(side => side.width === '1px' && side.style === 'solid')).toBe(true)
        expect(new Set(activeMaterial.sides.map(side => side.colour)).size).toBe(1)
        expect(activeMaterial.borderPaint).toEqual([...(await paintedColour(active, '--color-slate-500')), 255])
        expect(activeMaterial.radius).toBe('12px')
        expect(activeMaterial.shadow).toMatch(/0px 0px 0px 2px/)
        const activeBox = await active.boundingBox()
        expect(activeBox.width).toBeGreaterThanOrEqual(44)
        expect(activeBox.height).toBeGreaterThanOrEqual(44)
        await expect(active.locator('.blur-\\[2px\\]')).toHaveCount(0)
        await page.keyboard.press('Tab')
        await active.focus()
        await expect(active).toHaveCSS('outline-style', 'solid')
        await expect(active).toHaveCSS('outline-width', '2px')
        await expect.poll(() => active.evaluate(element => getComputedStyle(element).boxShadow)).toContain('6px')
        await active.evaluate(element => element.blur())
        const order = (await sidebar.locator('button').allTextContents()).map(text => text.trim())
        expect(order.slice(0, 2)).toEqual(['Edit Profile', 'My nsso'])
        expect(order.slice(-4)).toEqual(['Preview Profile', 'Copy profile link', 'Delete my profile', 'Sign Out'])
        await sidebar.getByRole('button', { name: 'My nsso', exact: true }).click()
        expect(await page.evaluate(() => window.fixtureNavigation)).toEqual(['/dashboard?view=my-nsso'])
        const remove = sidebar.getByRole('button', { name: 'Delete my profile', exact: true })
        await page.mouse.move(800, 400)
        await expect.poll(() => paintedColour(remove)).toEqual(await paintedColour(remove, '--color-slate-600'))
        expect(await labelContrast(remove)).toBeGreaterThanOrEqual(4.5)
        await remove.click()
        const dialog = page.getByRole('dialog', { name: 'Delete my profile?', exact: true })
        await expect(dialog).toBeVisible()
        await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
        await expect(dialog).toHaveCount(0)
        const signout = sidebar.getByRole('button', { name: 'Sign Out', exact: true })
        await expect.poll(() => paintedColour(signout)).toEqual(await paintedColour(signout, '--color-rose-800'))
        const idleColour = await paintedColour(signout)
        await signout.hover()
        await expect.poll(() => paintedColour(signout)).toEqual(await paintedColour(signout, '--color-rose-950'))
        const hoverColour = await paintedColour(signout)
        expect(luminance(hoverColour)).toBeLessThan(luminance(idleColour))
        await signout.click()
        expect(await page.evaluate(() => window.fixtureSignouts)).toBe(1)
        await expect(signout).toBeEnabled()
        expect(await page.evaluate(() => window.fixtureToasts)).toEqual([{ message: 'Sign-out could not be confirmed. Please try again.', type: 'error' }])
        await dispose(page, errors)
    })
})
