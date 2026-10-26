import 'server-only'
import sharp from 'sharp'

export type ProfileMediaKind = 'avatar' | 'project' | 'product'
export const MEDIA_OUTPUT_LIMIT = 5 * 1024 * 1024
export const MEDIA_PIXEL_LIMIT = 20_000_000
export class MediaValidationError extends Error {
    readonly status: 413 | 415
    constructor(status: 413 | 415, message: string) { super(message); this.status = status }
}

function rasterType(bytes: Buffer): string | null {
    if (bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
    if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
    if (['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif'
    if (bytes.length >= 16 && bytes.toString('ascii', 4, 8) === 'ftyp' && bytes.subarray(8, Math.min(bytes.length, 64)).toString('ascii').includes('avif')) return 'image/avif'
    return null
}

/** Decode/reencode drops original metadata and any trailing non-image payload. */
export async function normalizeProfileImage(file: File, kind: ProfileMediaKind, signal: AbortSignal): Promise<Buffer> {
    const maximum = kind === 'avatar' ? MEDIA_OUTPUT_LIMIT : 10 * 1024 * 1024
    if (!file.size || file.size > maximum) throw new MediaValidationError(413, kind === 'avatar' ? 'Choose an image smaller than 5 MB.' : 'Choose an image smaller than 10 MB.')
    signal.throwIfAborted()
    const bytes = Buffer.from(await file.arrayBuffer())
    signal.throwIfAborted()
    const detected = rasterType(bytes)
    if (!detected || detected !== file.type.toLowerCase()) throw new MediaValidationError(415, 'Choose a valid JPEG, PNG, WebP, GIF or AVIF image.')
    const image = sharp(bytes, { limitInputPixels: MEDIA_PIXEL_LIMIT, limitInputChannels: 4, failOn: 'warning', animated: false })
    const cancel = () => { image.destroy(new Error('Image request cancelled')) }
    signal.addEventListener('abort', cancel, { once: true })
    try {
        const metadata = await image.metadata()
        if (!metadata.width || !metadata.height || metadata.width * metadata.height > MEDIA_PIXEL_LIMIT || (metadata.pages || 1) > 1) throw new MediaValidationError(415, 'Choose a still image with at most 20 million pixels.')
        const maximumDimension = kind === 'avatar' ? 2048 : 4096
        const output = await image.rotate().resize({ width: maximumDimension, height: maximumDimension, fit: 'inside', withoutEnlargement: true })
            .flatten({ background: '#ffffff' }).jpeg({ quality: 88, progressive: true }).timeout({ seconds: 5 }).toBuffer()
        signal.throwIfAborted()
        if (output.length > MEDIA_OUTPUT_LIMIT) throw new MediaValidationError(413, 'The processed image is too large. Choose a smaller crop.')
        return output
    } catch (error) {
        if (error instanceof MediaValidationError || signal.aborted) throw error
        throw new MediaValidationError(415, 'This image could not be decoded. Choose a valid still image with at most 20 million pixels.')
    } finally { signal.removeEventListener('abort', cancel); image.destroy() }
}
