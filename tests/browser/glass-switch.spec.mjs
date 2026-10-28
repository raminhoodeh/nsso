import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { compile } from '@tailwindcss/node'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expectCompactSwitch, switchMaterial } from './helpers/switch-assertions.mjs'
import { expectWhiteEditorControls, keyboardFocus } from './helpers/white-control-assertions.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
let bundle, css

test.beforeAll(async () => {
    const compiler = await compile(readFileSync(root + 'src/app/globals.css', 'utf8'), { base: root + 'src/app', onDependency() {} })
    css = compiler.build([]) + '\nbody{margin:0;padding:30px;background:#46657b;color:white;font:16px Arial}label{display:flex;align-items:center;gap:24px;margin-bottom:20px}'
    const result = await build({ absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"test"' }, stdin: { loader: 'tsx', resolveDir: root, contents: `
            import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {GlassSwitch} from './src/components/ui/GlassSwitch';
            window.fixtureClicks=[];window.fixtureSubmissions=0;
            function App(){const[checked,setChecked]=useState(false),[held,setHeld]=useState(false);window.fixtureSetChecked=setChecked;window.fixtureSetHeld=setHeld;
                return <form onSubmit={event=>{event.preventDefault();window.fixtureSubmissions++}}>
                    <label>Setting<GlassSwitch aria-label="Fixture setting" checked={checked} onClick={()=>{window.fixtureClicks.push('setting');setChecked(value=>!value)}}/></label>
                    <label>Server-controlled setting<GlassSwitch aria-label="Held setting" checked={held} onClick={()=>window.fixtureClicks.push('held')}/></label>
                    <label>Unavailable setting<GlassSwitch aria-label="Disabled setting" checked disabled title="Unavailable during save" onClick={()=>window.fixtureClicks.push('disabled')}/></label>
                    <button type="submit">Submit fixture form</button>
                </form>}
            createRoot(document.getElementById('root')).render(<App/>);
        ` } })
    bundle = result.outputFiles[0].text
})

async function mount(page) {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/*', route => {
        const url = new URL(route.request().url())
        if (url.origin !== 'https://nsso.test') throw new Error('Unexpected switch fixture request: ' + url.origin)
        if (url.pathname === '/fixture.css') return route.fulfill({ contentType: 'text/css', body: css })
        if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'application/javascript', body: bundle })
        return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><div id="root"></div><script src="/fixture.js"></script>' })
    })
    await page.goto('https://nsso.test/switch-fixture')
    await expect(page.getByRole('switch', { name: 'Fixture setting', exact: true })).toBeVisible()
    return errors
}

test('compact switches retain controlled state, full hit targets and native keyboard/disabled form behavior', async ({ page, browserName }, testInfo) => {
    const errors = await mount(page)
    const setting = page.getByRole('switch', { name: 'Fixture setting', exact: true })
    const held = page.getByRole('switch', { name: 'Held setting', exact: true })
    const disabled = page.getByRole('switch', { name: 'Disabled setting', exact: true })
    await expectCompactSwitch(setting, { checked: false })
    await expectCompactSwitch(held, { checked: false })
    await expectCompactSwitch(disabled, { checked: true })
    // The generic editor audit checks the switch material explicitly as well.
    await expectWhiteEditorControls(page.locator('label'))
    await keyboardFocus(setting, page, browserName)
    await expect(setting).toHaveCSS('outline-style', 'solid')
    await expect(setting).toHaveCSS('outline-width', '2px')
    await setting.press('Space')
    await expectCompactSwitch(setting, { checked: true })
    await setting.press('Enter')
    await expectCompactSwitch(setting, { checked: false })
    // Click above the slim track but within the real 44px target.
    await setting.click({ position: { x: 28, y: 1 } })
    await expectCompactSwitch(setting, { checked: true })
    await held.press('Enter')
    await expectCompactSwitch(held, { checked: false })
    await page.evaluate(() => { window.fixtureSetHeld(true); window.fixtureSetChecked(false) })
    await expectCompactSwitch(held, { checked: true })
    await expectCompactSwitch(setting, { checked: false })
    await expect(disabled).toBeDisabled()
    await expect(disabled).toHaveAttribute('title', 'Unavailable during save')
    await held.focus()
    await held.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
    await expect(page.getByRole('button', { name: 'Submit fixture form', exact: true })).toBeFocused()
    await disabled.evaluate(element => element.click()) // Native disabled click must not dispatch.
    expect(await page.evaluate(() => window.fixtureClicks)).toEqual(['setting', 'setting', 'setting', 'held'])
    expect(await page.evaluate(() => window.fixtureSubmissions)).toBe(0)
    expect(errors).toEqual([])
    await page.screenshot({ path: testInfo.outputPath('compact-switch-keyboard-states.png') })
})

test('reduced motion removes switch animation while retaining the full on/off state movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors = await mount(page)
    const control = page.getByRole('switch', { name: 'Fixture setting', exact: true })
    const off = await expectCompactSwitch(control, { checked: false })
    expect(off.track.transition).toBe('0s')
    expect(off.thumb.transition).toBe('0s')
    await control.press('Space')
    const on = await expectCompactSwitch(control, { checked: true })
    expect(on.left - off.left).toBeCloseTo(24, 3)
    expect(await control.evaluate(element => element.getAnimations({ subtree: true }).length)).toBe(0)
    expect(errors).toEqual([])
})

test('solid preferences retain contrasting states and keyboard focus in light and dark Canvas schemes', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Reduced-transparency media emulation requires Chromium CDP; native and reduced-motion cases cover both engines.')
    const errors = await mount(page)
    const cdp = await context.newCDPSession(page)
    const control = page.getByRole('switch', { name: 'Fixture setting', exact: true })
    for (const scheme of ['light', 'dark']) {
        await page.addStyleTag({ content: ':root{color-scheme:' + scheme + '}' })
        for (const feature of ['prefers-reduced-transparency', 'forced-colors']) {
            await cdp.send('Emulation.setEmulatedMedia', { features: [
                { name: 'prefers-color-scheme', value: scheme },
                { name: 'prefers-reduced-transparency', value: feature === 'prefers-reduced-transparency' ? 'reduce' : 'no-preference' },
                { name: 'forced-colors', value: feature === 'forced-colors' ? 'active' : 'none' },
            ] })
            const states = []
            for (const checked of [false, true]) {
                await page.evaluate(value => window.fixtureSetChecked(value), checked)
                for (const hovered of [false, true]) {
                    if (hovered) await control.hover()
                    else await page.mouse.move(0, 0)
                    const state = await expectCompactSwitch(control, { checked })
                    expect(state.track.image, `${feature}/${scheme}/hover:${hovered}`).toBe('none')
                    expect(state.thumb.image, `${feature}/${scheme}/hover:${hovered}`).toBe('none')
                    expect(state.track.shadow, `${feature}/${scheme}/hover:${hovered}`).toBe('none')
                    expect(state.thumb.shadow, `${feature}/${scheme}/hover:${hovered}`).toBe('none')
                    if (!hovered) states.push(state)
                }
            }
            expect(states[1].track.background).not.toEqual(states[0].track.background)
            expect(states[1].left - states[0].left).toBeCloseTo(24, 3)
            await keyboardFocus(control, page, browserName)
            await expect(control).toHaveCSS('outline-style', 'solid')
            await expect(control).toHaveCSS('outline-width', '2px')
            expect((await switchMaterial(control)).checked).toBe('true')
        }
    }
    await cdp.detach()
    expect(errors).toEqual([])
})
