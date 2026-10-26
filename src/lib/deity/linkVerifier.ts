/**
 * Format assessment only. Curated or user-supplied URLs must never trigger an
 * unrestricted server fetch. Reachability remains unknown until a separately
 * reviewed public-only outbound transport is available.
 */
export function assessLinkHealth(value: unknown): 'unsafe' | 'unverified' {
    if (typeof value !== 'string' || value.length > 8_192 || /[\u0000-\u0020\u007f\\]/.test(value)) return 'unsafe';
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname) return 'unsafe';
        return 'unverified';
    } catch { return 'unsafe'; }
}
