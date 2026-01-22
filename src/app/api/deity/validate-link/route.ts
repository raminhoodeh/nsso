
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();

        if (!url) {
            return NextResponse.json({ valid: false, error: 'URL is required' }, { status: 400 });
        }

        try {
            // Validate URL format
            new URL(url);

            // Perform a HEAD request to check reachability
            // We use a short timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                headers: { 'User-Agent': 'Deity/1.0' } // Politely identify
            });

            clearTimeout(timeoutId);

            if (response.ok || response.status === 405) { // 405 Method Not Allowed sometimes happens for HEAD, but implies existence
                return NextResponse.json({ valid: true });
            } else {
                // Some sites block HEAD, try minimal GET if HEAD fails but gives a client error
                if (response.status >= 400 && response.status < 500) {
                    // It exists but we might not have permission or method is wrong, treat as valid enough for a user link
                    return NextResponse.json({ valid: true, warning: `Status ${response.status}` });
                }
                return NextResponse.json({ valid: false, error: `Unreachable (Status ${response.status})` });
            }

        } catch (e) {
            return NextResponse.json({ valid: false, error: 'Invalid URL or unreachable' });
        }

    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
