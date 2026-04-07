
/**
 * linkVerifier.ts
 * 
 * A high-performance utility to verify external URLs in parallel.
 * Designed for "Fail-Open" validation: 
 * - If a link times out, we assume it's VALID (to avoid false negatives due to lag).
 * - We only flag links as DEAD if we get an explicit 404/500 code.
 */

interface LinkStatus {
    url: string;
    isDead: boolean; // True only if confirmed broken
    statusCode?: number;
    error?: string;
}

const VERIFICATION_TIMEOUT_MS = 800; // Strict timeout (under 1s)

/**
 * Verifies a single URL with a timeout.
 * Returns true if valid (or timed out), false if definitely broken.
 */
async function checkUrl(url: string): Promise<LinkStatus> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    try {
        // We use GET with a small range or just HEAD if supported. 
        // Many servers block HEAD, so a GET with Abort is safer "Fail-Open".
        // Note: fetch in Next.js/Node environment.
        const response = await fetch(url, {
            method: 'HEAD', // Try HEAD first as it's lightest
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; nsso-Deity-Bot/1.0)' // Identify ourselves politely
            }
        });

        clearTimeout(timeoutId);

        if (response.status === 404 || response.status === 410 || response.status >= 500) {
            return { url, isDead: true, statusCode: response.status };
        }

        // 200, 301, 302, 403 (Forbidden often means "I exist but go away"), etc. are considered "Alive"
        return { url, isDead: false, statusCode: response.status };

    } catch (error: any) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError') {
            // TIMEOUT -> Fail-Open! We assume it's valid if it's just slow.
            return { url, isDead: false, error: 'Timeout (Fail-Open)' };
        }

        // Network errors (DNS failure, Connection Refused) -> Likely Dead
        // But "TypeError: fetch failed" can be vague. 
        // We'll be conservative: If DNS fails, it's dead.
        if (error.cause && (error.cause.code === 'ENOTFOUND' || error.cause.code === 'ECONNREFUSED')) {
            return { url, isDead: true, error: error.cause.code };
        }

        // Other errors? Assume valid to be safe.
        return { url, isDead: false, error: error.message };
    }
}

/**
 * Verifies a list of URLs in parallel.
 * Returns a Set of DEAD URLs for easy filtering.
 */
export async function verifyLinks(urls: string[]): Promise<Set<string>> {
    if (!urls || urls.length === 0) return new Set();

    // Deduplicate
    const uniqueUrls = Array.from(new Set(urls));

    // Run in parallel
    const results = await Promise.allSettled(uniqueUrls.map(u => checkUrl(u)));

    const deadLinks = new Set<string>();

    results.forEach((result) => {
        if (result.status === 'fulfilled') {
            if (result.value.isDead) {
                console.log(`❌ Link Verification: Found Dead Link: ${result.value.url} (${result.value.statusCode || result.value.error})`);
                deadLinks.add(result.value.url);
            }
        }
        // If rejected (code error), we ignore and treat as valid (Fail-Open)
    });

    return deadLinks;
}
