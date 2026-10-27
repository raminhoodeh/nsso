import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'

const provenance = JSON.parse(readFileSync(new URL('./deck-background-provenance.json', import.meta.url), 'utf8'))
const asset = readFileSync(new URL(`../${provenance.asset}`, import.meta.url))
const hash = data => createHash('sha256').update(data).digest('hex')

test('deck background is the exact extracted asset, not a regenerated or lossy approximation', async () => {
    assert.equal(asset.length, provenance.bytes)
    assert.equal(hash(asset), provenance.sha256)
    const metadata = await sharp(asset).metadata()
    assert.equal(metadata.width, provenance.width)
    assert.equal(metadata.height, provenance.height)
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.hasAlpha, false)
    const pixels = await sharp(asset).removeAlpha().raw().toBuffer()
    assert.equal(hash(pixels), provenance.rgbPixelSha256)
})

test('deck background retains spatial blue lighting and fine grain without shipped foreground content', async () => {
    assert.equal(provenance.originalBaseColor, '#43628c')
    assert.deepEqual(provenance.inclusiveDrawingOperationRange, [0, 28])
    assert.deepEqual(provenance.maskedGlowObjects, [264, 270, 272])
    assert.equal(provenance.grainImageObject, 744)
    const patch = async (left, top) => {
        // Materialize the crop before computing statistics: Sharp's stats()
        // describes its input, not pending extract/resize pipeline operations.
        const pixels = await sharp(asset).extract({ left, top, width: 48, height: 48 }).removeAlpha().raw().toBuffer()
        return { channels: Array.from({ length: 3 }, (_, channel) => {
            let sum = 0, squares = 0
            for (let index = channel; index < pixels.length; index += 3) { sum += pixels[index]; squares += pixels[index] ** 2 }
            const count = pixels.length / 3, mean = sum / count
            return { mean, stdev: Math.sqrt(squares / count - mean ** 2) }
        }) }
    }
    const [dark, light] = await Promise.all([patch(1816, 56), patch(216, 1076)])
    for (const sample of [dark, light]) {
        const [red, green, blue] = sample.channels
        assert(blue.mean > green.mean && green.mean > red.mean)
        assert(red.stdev > 1 && blue.stdev > 1, 'Original grain must not be flattened away')
    }
    assert(light.channels[0].mean > dark.channels[0].mean + 40, 'Original lower-left lighting must remain visible')
})
