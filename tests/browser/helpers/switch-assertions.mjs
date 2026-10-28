import { expect } from '@playwright/test'

export function colourContrast(first, second) {
    const luminance = rgb => rgb.slice(0, 3).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0)
    const a = luminance(first), b = luminance(second)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
}

/** Inspect the real semantic switch and its compact painted track, not an action-button coat. */
export async function switchMaterial(control) {
    await control.evaluate(async element => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})))
    })
    return control.evaluate(element => {
        const track = element.querySelector('[data-switch-track]'), thumb = element.querySelector('[data-switch-thumb]')
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        const rgba = value => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data] }
        const box = node => { const value = node.getBoundingClientRect(); return { width: value.width, height: value.height } }
        const style = node => ({ background: rgba(getComputedStyle(node).backgroundColor), image: getComputedStyle(node).backgroundImage, shadow: getComputedStyle(node).boxShadow, transition: getComputedStyle(node).transitionDuration })
        return {
            label: element.getAttribute('aria-label'), tag: element.tagName, type: element.type,
            role: element.getAttribute('role'), checked: element.getAttribute('aria-checked'), material: element.dataset.nssoControl,
            target: box(element), background: rgba(getComputedStyle(element).backgroundColor),
            actionCoats: element.querySelectorAll('[data-light-button-content],[data-tahoe-button-coat]').length,
            tracks: element.querySelectorAll('[data-switch-track]').length, thumbs: element.querySelectorAll('[data-switch-thumb]').length,
            track: track && { ...box(track), ...style(track) }, thumb: thumb && { ...box(thumb), ...style(thumb) },
            left: track && thumb && thumb.getBoundingClientRect().left - track.getBoundingClientRect().left,
        }
    })
}

export async function expectCompactSwitch(control, { checked } = {}) {
    const state = await switchMaterial(control)
    expect(state.tag, state.label).toBe('BUTTON')
    expect(state.type, state.label).toBe('button')
    expect(state.role, state.label).toBe('switch')
    expect(state.material, state.label).toBe('switch')
    expect(state.checked, state.label).toBe(String(checked ?? state.checked === 'true'))
    expect(state.actionCoats, state.label).toBe(0)
    expect(state.tracks, state.label).toBe(1)
    expect(state.thumbs, state.label).toBe(1)
    for (const [actual, expected] of [[state.target, { width: 56, height: 44 }], [state.track, { width: 52, height: 28 }], [state.thumb, { width: 24, height: 24 }]]) {
        expect(actual.width, state.label).toBeCloseTo(expected.width, 3)
        expect(actual.height, state.label).toBeCloseTo(expected.height, 3)
    }
    expect(state.background[3], state.label).toBe(0)
    expect(state.left, state.label).toBeCloseTo(state.checked === 'true' ? 26 : 2, 3)
    expect(colourContrast(state.track.background, state.thumb.background), state.label).toBeGreaterThanOrEqual(3)
    return state
}
