import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { NextResponse } from 'next/server';

/** Public, bounded availability probe. Private/deleted clips must not become a blank player. */
async function handleGET(_request: Request, context: { params: Promise<{ videoId: string }> }) {
    const { videoId } = await context.params;
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return NextResponse.json({ status: 'unavailable' }, { status: 400 });
    try {
        const url = new URL('https://www.youtube.com/oembed');
        url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
        url.searchParams.set('format', 'json');
        const response = await fetch(url, { signal: AbortSignal.timeout(5_000), redirect: 'error', next: { revalidate: 300 } });
        await response.body?.cancel();
        // Throttling/provider outages are unknown, not evidence that a clip was removed.
        const status = response.ok ? 'available' : [400, 401, 403, 404, 410].includes(response.status) ? 'unavailable' : 'unknown';
        return NextResponse.json({ status }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
    } catch {
        return NextResponse.json({ status: 'unknown' }, { headers: { 'Cache-Control': 'no-store' } });
    }
}

export const GET = withRuntimeGuard(handleGET)
