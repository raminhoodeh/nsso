export interface LensDisplacementMap {
    url: string
    rasterWidth: number
    rasterHeight: number
    rimOpacity: number
}

const MAX_RASTER_EDGE = 224
const MIN_RASTER_EDGE = 48
const SIZE_BUCKET = 8
const POWER = 3.5

const lensMapCache = new Map<string, LensDisplacementMap>()

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function quantize(value: number) {
    return Math.max(SIZE_BUCKET, Math.round(value / SIZE_BUCKET) * SIZE_BUCKET)
}

function getRasterSize(width: number, height: number) {
    const safeWidth = Math.max(1, width)
    const safeHeight = Math.max(1, height)
    const aspectRatio = safeWidth / safeHeight

    if (aspectRatio >= 1) {
        return {
            width: MAX_RASTER_EDGE,
            height: quantize(clamp(MAX_RASTER_EDGE / aspectRatio, MIN_RASTER_EDGE, MAX_RASTER_EDGE))
        }
    }

    return {
        width: quantize(clamp(MAX_RASTER_EDGE * aspectRatio, MIN_RASTER_EDGE, MAX_RASTER_EDGE)),
        height: MAX_RASTER_EDGE
    }
}

/**
 * Creates the convex red/green displacement field used by one local lens.
 * The raster is capped, quantized, and cached so large cards never generate a
 * full-resolution map and same-shaped buttons can share one encoded texture.
 */
export function createLensDisplacementMap(width: number, height: number): LensDisplacementMap | null {
    if (typeof document === 'undefined' || width <= 0 || height <= 0) return null

    const raster = getRasterSize(width, height)
    const cacheKey = `${raster.width}x${raster.height}`
    const cached = lensMapCache.get(cacheKey)
    if (cached) return cached

    try {
        const canvas = document.createElement('canvas')
        canvas.width = raster.width
        canvas.height = raster.height

        const context = canvas.getContext('2d')
        if (!context) return null

        const image = context.createImageData(raster.width, raster.height)
        const pixels = image.data
        let magnitudeTotal = 0
        let magnitudeSamples = 0

        for (let y = 0; y < raster.height; y += 1) {
            for (let x = 0; x < raster.width; x += 1) {
                const normalX = (x / Math.max(1, raster.width - 1)) * 2 - 1
                const normalY = (y / Math.max(1, raster.height - 1)) * 2 - 1
                const distance = Math.pow(Math.abs(normalX), POWER) + Math.pow(Math.abs(normalY), POWER)
                let red = 128
                let green = 128

                if (distance <= 1) {
                    const curveMagnitude = Math.sin(Math.pow(distance, 0.8) * Math.PI)
                    const displacementX = -normalX * curveMagnitude
                    const displacementY = -normalY * curveMagnitude
                    red = Math.round(128 + displacementX * 127)
                    green = Math.round(128 + displacementY * 127)
                    magnitudeTotal += Math.hypot(displacementX, displacementY)
                    magnitudeSamples += 1
                }

                const index = (y * raster.width + x) * 4
                pixels[index] = red
                pixels[index + 1] = green
                pixels[index + 2] = 128
                pixels[index + 3] = 255
            }
        }

        context.putImageData(image, 0, 0)
        const averageMagnitude = magnitudeTotal / Math.max(1, magnitudeSamples)
        const result: LensDisplacementMap = {
            url: canvas.toDataURL('image/png'),
            rasterWidth: raster.width,
            rasterHeight: raster.height,
            rimOpacity: clamp(0.54 + averageMagnitude * 0.34, 0.58, 0.82)
        }

        lensMapCache.set(cacheKey, result)
        return result
    } catch {
        return null
    }
}
