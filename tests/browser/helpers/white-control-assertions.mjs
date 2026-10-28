import { expect } from '@playwright/test'

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

/** A dark opaque coating can pass contrast; require the actual white material too. */
export async function expectWhiteEditorControls(container, { photoException = false } = {}) {
    const controls = await container.locator('button').evaluateAll((buttons, allowPhoto) => buttons.filter(button => {
        const box = button.getBoundingClientRect()
        return box.width && box.height && getComputedStyle(button).visibility !== 'hidden'
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
            material: button.dataset.nssoControl || (button.hasAttribute('data-ask-deity-control') ? 'white-lens' : material.dataset.nssoControl),
            legacyCoats: button.querySelectorAll('[data-tahoe-button-coat]').length,
            background: rgba(style.backgroundColor), ink: rgba(style.color),
            width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height,
        }
    }), photoException)
    expect(controls.length).toBeGreaterThan(0)
    for (const control of controls) {
        if (control.exemptPhoto) continue // The photo is an image frame, not an action coating.
        expect(control.legacyCoats, control.label).toBe(0)
        expect(['white', 'white-lens'], control.label).toContain(control.material)
        expect(control.background[3], control.label).toBe(255)
        expect(Math.min(...control.background.slice(0, 3)), control.label).toBeGreaterThanOrEqual(235)
        expect(Math.min(...control.ink.slice(0, 3)), control.label).toBeLessThan(100)
        expect(control.height, control.label).toBeGreaterThanOrEqual(44)
        expect(control.width, control.label).toBeGreaterThanOrEqual(44)
    }
    return controls
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
