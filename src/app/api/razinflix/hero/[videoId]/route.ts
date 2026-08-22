import { NextResponse } from 'next/server'

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const THUMBNAIL_HOST = 'https://i.ytimg.com'

export async function GET(
    _request: Request,
    context: { params: Promise<{ videoId: string }> }
) {
    const { videoId } = await context.params
    if (!YOUTUBE_ID.test(videoId)) {
        return NextResponse.json({ error: 'Invalid video id' }, { status: 400 })
    }

    for (const quality of ['maxresdefault', 'hqdefault']) {
        const response = await fetch(`${THUMBNAIL_HOST}/vi/${videoId}/${quality}.jpg`, {
            next: { revalidate: 86400 }
        })
        if (!response.ok) continue

        return new Response(await response.arrayBuffer(), {
            headers: {
                'Content-Type': response.headers.get('content-type') || 'image/jpeg',
                'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000',
                'Cross-Origin-Resource-Policy': 'same-origin'
            }
        })
    }

    return NextResponse.json({ error: 'Hero image unavailable' }, { status: 404 })
}
