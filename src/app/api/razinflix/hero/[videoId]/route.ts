import { NextResponse } from 'next/server'

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const THUMBNAIL_ORIGIN = 'https://i.ytimg.com'
const MAX_REDIRECTS = 3
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const RASTER_CONTENT_TYPES = new Set([
    'image/avif',
    'image/jpeg',
    'image/png',
    'image/webp',
])

function validatedThumbnailUrl(value: string): URL | null {
    try {
        const url = new URL(value)
        if (
            url.protocol !== 'https:' ||
            url.hostname !== 'i.ytimg.com' ||
            url.port ||
            url.username ||
            url.password
        ) return null
        url.hash = ''
        return url
    } catch {
        return null
    }
}

async function fetchThumbnail(source: URL, signal: AbortSignal): Promise<Response> {
    let current = source
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const validated = validatedThumbnailUrl(current.href)
        if (!validated) throw new Error('Invalid thumbnail redirect')
        const response = await fetch(validated, {
            redirect: 'manual',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            signal,
            headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg' },
            next: { revalidate: 86_400 },
        })
        if (!REDIRECT_STATUSES.has(response.status)) return response

        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || redirects === MAX_REDIRECTS) {
            throw new Error('Thumbnail redirect limit exceeded')
        }
        const redirected = validatedThumbnailUrl(new URL(location, validated).href)
        if (!redirected) throw new Error('Invalid thumbnail redirect')
        current = redirected
    }
    throw new Error('Thumbnail redirect limit exceeded')
}

async function readThumbnail(response: Response): Promise<Uint8Array | null> {
    if (!response.body) return null
    const declaredLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
        await response.body.cancel()
        return null
    }

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (!value) continue
            totalBytes += value.byteLength
            if (totalBytes > MAX_IMAGE_BYTES) {
                await reader.cancel()
                return null
            }
            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }

    const image = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
        image.set(chunk, offset)
        offset += chunk.byteLength
    }
    return image
}

function heroError(message: string, status: number) {
    return NextResponse.json(
        { error: message },
        {
            status,
            headers: {
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
            },
        },
    )
}

/**
 * Same-origin, cacheable scene source for the Razinflix glass compositor.
 * The cross-origin YouTube player remains available in the film modal, but a
 * framebuffer cannot honestly sample it for the page-wide Tahoe material.
 */
export async function GET(
    _request: Request,
    context: { params: Promise<{ videoId: string }> }
) {
    const { videoId } = await context.params
    if (!YOUTUBE_ID.test(videoId)) {
        return heroError('Invalid video id', 400)
    }

    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    try {
        for (const quality of ['maxresdefault', 'hqdefault']) {
            const source = validatedThumbnailUrl(
                `${THUMBNAIL_ORIGIN}/vi/${videoId}/${quality}.jpg`,
            )
            if (!source) continue
            const response = await fetchThumbnail(source, timeout)
            const contentType = response.headers
                .get('content-type')
                ?.split(';', 1)[0]
                ?.trim()
                .toLowerCase()
            if (!response.ok || !contentType || !RASTER_CONTENT_TYPES.has(contentType)) {
                await response.body?.cancel()
                continue
            }
            const image = await readThumbnail(response)
            if (!image) continue

            return new Response(image.buffer as ArrayBuffer, {
                headers: {
                    'Content-Type': contentType,
                    'Content-Length': String(image.byteLength),
                    'Content-Disposition': 'inline; filename="razinflix-hero.jpg"',
                    'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
                    'Cross-Origin-Resource-Policy': 'same-origin',
                    'X-Content-Type-Options': 'nosniff',
                },
            })
        }
    } catch {
        return heroError('Hero image unavailable', 502)
    }

    return heroError('Hero image unavailable', 404)
}
