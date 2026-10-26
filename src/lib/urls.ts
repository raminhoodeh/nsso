/** URL syntax policy only. This does not verify a site's content or ownership. */
export function safeWebUrl(value: unknown, options: { httpsOnly?: boolean } = {}): string | null {
    if (typeof value !== 'string' || !value || value.length > 4096 || /[\u0000-\u001f\u007f\\]/.test(value)) return null
    const normalized = value.replace(/^ +| +$/g, '')
    if (!normalized || normalized.includes(' ')) return null
    try {
        const url = new URL(normalized)
        if (url.protocol !== 'https:' && (options.httpsOnly || url.protocol !== 'http:')) return null
        if (url.username || url.password || !url.hostname) return null
        return url.href
    } catch {
        return null
    }
}

/** Contact values have narrower syntax than ordinary website links. */
export function safeContactUrl(method: unknown, value: unknown): string | null {
    if (typeof method !== 'string' || typeof value !== 'string' || !value || value.length > 320 || /[\u0000-\u001f\u007f]/.test(value)) return null
    switch (method.toLowerCase()) {
        case 'email':
            return /^[^\s@?#<>"\\]+@[^\s@?#<>"\\]+\.[^\s@?#<>"\\]+$/.test(value) ? `mailto:${value}` : null
        case 'phone': {
            if (!/^\+?[\d ()-]+$/.test(value)) return null
            const digits = value.replace(/\D/g, '')
            return /^\d{6,15}$/.test(digits) ? `tel:${value.startsWith('+') ? '+' : ''}${digits}` : null
        }
        case 'whatsapp': {
            if (!/^\+?[\d ()-]+$/.test(value)) return null
            const digits = value.replace(/\D/g, '')
            return /^\d{6,15}$/.test(digits) ? `https://wa.me/${digits}` : null
        }
        case 'telegram': {
            const username = value.replace(/^@/, '')
            return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username) ? `https://t.me/${username}` : null
        }
        default: return null
    }
}
