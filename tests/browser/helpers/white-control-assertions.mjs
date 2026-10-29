import { expect } from '@playwright/test'
import sharp from 'sharp'
import { expectCompactSwitch } from './switch-assertions.mjs'

/** Inspect native controls with the real compiled material, never a mock button. */
export async function controlMaterial(control) {
    await control.evaluate(async element => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})))
    })
    return control.evaluate(element => {
        const style = getComputedStyle(element)
        const svg = element.querySelector('svg')
        const box = element.getBoundingClientRect()
        return {
            width: box.width, height: box.height,
            background: style.backgroundColor, backgroundImage: style.backgroundImage,
            border: style.border, radius: style.borderRadius, shadow: style.boxShadow,
            ink: style.color, textShadow: style.textShadow, opacity: style.opacity,
            outline: { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor }, outlineOffset: style.outlineOffset,
            focusVisible: element.matches(':focus-visible'),
            icon: svg && { width: svg.getAttribute('width'), height: svg.getAttribute('height'), viewBox: svg.getAttribute('viewBox'), stroke: getComputedStyle(svg).stroke, paths: [...svg.children].map(path => path.outerHTML) },
        }
    })
}

const luminance = rgb => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0)

/** Sample the actual composited material under each glyph/icon box, including ancestor coatings. */
export async function renderedControlContrast(control, { includeBackground = false } = {}) {
    // Retain the actual node before hiding its label: role/name locators would
    // otherwise stop resolving while the accessible foreground is hidden.
    const target = await control.elementHandle()
    const paint = await target.evaluate(button => {
        const material = button.querySelector('[data-ask-deity-lens]') || button
        const label = button.querySelector('[data-light-button-content]') || material
        const box = button.getBoundingClientRect()
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        const rgba = element => { context.clearRect(0, 0, 1, 1); context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data] }
        const samples = []
        const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
            if (!walker.currentNode.textContent.trim()) continue
            const range = document.createRange(); range.selectNodeContents(walker.currentNode)
            for (const rect of range.getClientRects()) samples.push({ x: rect.x - box.x, y: rect.y - box.y, width: rect.width, height: rect.height, ink: rgba(walker.currentNode.parentElement) })
        }
        for (const icon of label.querySelectorAll('svg')) {
            const rect = icon.getBoundingClientRect()
            samples.push({ x: rect.x - box.x, y: rect.y - box.y, width: rect.width, height: rect.height, ink: rgba(icon) })
        }
        // Preserve geometry and material; hide only foreground descendants.
        const hidden = label === material ? [...label.children] : [label]
        for (const element of hidden) { element.dataset.contrastVisibility = element.style.visibility; element.style.visibility = 'hidden' }
        return { samples, opacity: Number(getComputedStyle(button).opacity) }
    })
    let image
    try { image = await target.screenshot({ scale: 'css', animations: 'disabled' }) }
    finally {
        await target.evaluate(button => { for (const element of button.querySelectorAll('[data-contrast-visibility]')) { element.style.visibility = element.dataset.contrastVisibility; delete element.dataset.contrastVisibility } })
    }
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let minimum = Infinity
    for (const sample of paint.samples) {
        for (let y = Math.max(2, Math.ceil(sample.y)); y < Math.min(info.height - 2, Math.floor(sample.y + sample.height)); y += 2) {
            for (let x = Math.max(2, Math.ceil(sample.x)); x < Math.min(info.width - 2, Math.floor(sample.x + sample.width)); x += 2) {
                const offset = (y * info.width + x) * 4
                const background = [...data.subarray(offset, offset + 3)]
                const alpha = sample.ink[3] / 255 * paint.opacity
                const foreground = background.map((value, index) => sample.ink[index] * alpha + value * (1 - alpha))
                const a = luminance(foreground), b = luminance(background)
                minimum = Math.min(minimum, (Math.max(a, b) + .05) / (Math.min(a, b) + .05))
            }
        }
    }
    expect(Number.isFinite(minimum), 'a visible text or icon sample is required').toBe(true)
    const center = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4
    return includeBackground ? { contrast: minimum, centerBackground: [...data.subarray(center, center + 3)] } : minimum
}

/** Require the shared translucent bright material as well as readable rendered ink. */
export async function expectWhiteEditorControls(container, { photoException = false } = {}) {
    // Wait for real material transitions; a mid-transition colour is not the final contract.
    await container.locator('button').evaluateAll(async elements => { await Promise.all(elements.flatMap(element => element.getAnimations().map(animation => animation.finished.catch(() => {})))) })
    // Switches retain their semantic state and compact track independently of CTA material.
    const switches = []
    for (const control of await container.locator('button[role="switch"]').filter({ visible: true }).all()) {
        switches.push(await expectCompactSwitch(control))
    }
    const controls = await container.locator('button').evaluateAll((buttons, allowPhoto) => buttons.filter(button => {
        const box = button.getBoundingClientRect()
        return button.getAttribute('role') !== 'switch' && box.width && box.height && getComputedStyle(button).visibility !== 'hidden'
    }).map(button => {
        const material = button.querySelector('[data-ask-deity-lens]') || button
        const style = getComputedStyle(material)
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        const rgba = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data] }
        return {
            label: button.getAttribute('aria-label') || button.textContent.trim(),
            exemptPhoto: allowPhoto && button.getAttribute('aria-label') === 'Upload profile picture',
            glass: material.classList.contains('nsso-glass-control'),
            gradient: style.backgroundImage,
            solidMode: matchMedia('(forced-colors: active), (prefers-reduced-transparency: reduce)').matches,
            disabled: button.disabled || button.getAttribute('aria-disabled') === 'true',
            material: button.dataset.nssoControl || (button.hasAttribute('data-ask-deity-control') ? 'white-lens' : material.dataset.nssoControl),
            legacyCoats: button.querySelectorAll('[data-tahoe-button-coat]').length,
            background: rgba(style.backgroundColor), ink: rgba(style.color),
            width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
        }
    }), photoException)
    expect(controls.length + switches.length).toBeGreaterThan(0)
    for (const control of controls) {
        if (control.exemptPhoto) continue // The photo is an image frame, not an action coating.
        expect(control.legacyCoats, control.label).toBe(0)
        expect(['white', 'white-lens'], control.label).toContain(control.material)
        expect(control.glass, control.label + ' shared glass material').toBe(true)
        if (control.solidMode) {
            expect(control.background[3], control.label + ' system solid fallback').toBe(255)
        } else {
            expect(control.background[3], control.label + ' transparent transmission').toBeGreaterThan(0)
            expect(control.background[3], control.label + ' transparent transmission').toBeLessThan(255)
            expect(Math.min(...control.background.slice(0, 3)), control.label + ' neutral bright material').toBeGreaterThanOrEqual(235)
            expect(control.gradient, control.label + ' static sheen').not.toBe('none')
        }
        if (!control.solidMode) expect(Math.min(...control.ink.slice(0, 3)), control.label).toBeLessThan(100)
        else expect(control.ink, control.label + ' system foreground').not.toEqual(control.background)
        expect(control.height, control.label).toBeGreaterThanOrEqual(44)
        expect(control.width, control.label).toBeGreaterThanOrEqual(44)
    }
    const rendered = container.locator('button').filter({ visible: true })
    for (const button of await rendered.all()) {
        if (await button.getAttribute('role') === 'switch' || await button.isDisabled() || await button.getAttribute('aria-disabled') === 'true') continue
        if (photoException && await button.getAttribute('aria-label') === 'Upload profile picture') continue
        const label = await button.getAttribute('aria-label') || (await button.textContent()).trim()
        const paint = await renderedControlContrast(button, { includeBackground: true })
        expect(paint.contrast, label + ' rendered contrast').toBeGreaterThanOrEqual(4.5)
        const report = controls.find(control => control.label === label)
        if (report) report.paint = paint
    }
    return [...controls, ...switches]
}

export async function keyboardFocus(control, page, browserName) {
    await control.focus()
    // A real keyboard round trip establishes focus-visible on pointer/touch projects too.
    // macOS WebKit uses Option-Tab to include buttons in its native traversal.
    await control.press(browserName === 'webkit' ? 'Alt+Tab' : 'Tab')
    await page.keyboard.press(browserName === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab')
    await expect(control).toBeFocused()
    await expect.poll(() => control.evaluate(element => element.matches(':focus-visible'))).toBe(true)
}
