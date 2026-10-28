import { expect } from '@playwright/test'
import sharp from 'sharp'

const luminance = rgb => rgb.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)

/** Sample the actual painted material, including its opaque pseudo backing. */
export async function expectOpaqueLightPanel(page, panel) {
    const samples = []
    for (const background of ['#000', '#fff']) {
        await page.evaluate(value => { document.body.style.background = value }, background)
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const { data, info } = await sharp(await panel.screenshot({ scale: 'css' })).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        const offset = (8 * info.width + Math.floor(info.width / 2)) * 4
        samples.push([...data.subarray(offset, offset + 3)])
    }
    expect(samples[0]).toEqual(samples[1])
    expect(Math.min(...samples[0])).toBeGreaterThan(200)
    return samples[0]
}

/** Retain the real backing while hiding only glyph colour in a synthetic test. */
export async function minimumTextContrast(label) {
    const text = await label.evaluate(element => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
        const context = canvas.getContext('2d'); context.fillStyle = getComputedStyle(element).color; context.fillRect(0, 0, 1, 1)
        const result = [...context.getImageData(0, 0, 1, 1).data]
        element.dataset.originalColour = element.style.color; element.style.color = 'transparent'
        return result
    })
    try {
        const { data, info } = await sharp(await label.screenshot({ scale: 'css' })).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
        let minimum = Infinity
        for (let y = 3; y < info.height - 3; y += 2) for (let x = 3; x < info.width - 3; x += 2) {
            const offset = (y * info.width + x) * 4
            const background = [...data.subarray(offset, offset + 3)]
            const foreground = background.map((value, index) => text[index] * text[3] / 255 + value * (1 - text[3] / 255))
            const a = luminance(foreground), b = luminance(background)
            minimum = Math.min(minimum, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05))
        }
        expect(Number.isFinite(minimum)).toBe(true)
        return minimum
    } finally {
        await label.evaluate(element => { element.style.color = element.dataset.originalColour; delete element.dataset.originalColour })
    }
}
