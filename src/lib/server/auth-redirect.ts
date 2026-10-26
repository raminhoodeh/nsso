/** Normalize an internal destination before handing it to a redirect API. */
export function safeInternalPath(value: string | null | undefined, origin: string, fallback = '/dashboard') {
    if (!value || !value.startsWith('/') || value.startsWith('//') || /[\u0000-\u001f\u007f\\]/.test(value)) return fallback;
    try {
        const destination = new URL(value, origin);
        if (destination.origin !== new URL(origin).origin || destination.username || destination.password) return fallback;
        return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch { return fallback; }
}
