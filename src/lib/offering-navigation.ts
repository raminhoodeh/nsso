export type OfferingEditorView = 'editor' | 'creator'

/** Route context is presentation only; product access still comes from the owner snapshot. */
export function offeringEditorId(value: unknown): string | null {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null
}

export function offeringEditorHref(productId: string, view: OfferingEditorView = 'editor'): string {
    const id = offeringEditorId(productId)
    if (!id) return '/dashboard?view=profile'
    const query = new URLSearchParams({ view: 'profile', offering: id })
    if (view === 'creator') query.set('offeringView', 'creator')
    return `/dashboard?${query}`
}

type OfferingReturnPosition = { productId: string; windowY: number; listY: number; expiresAt: number }
const returnKey = (accountId: string) => `nsso:offering-return:${accountId}`

/** One small return position per account; no authored content or payment drafts are stored. */
export function rememberOfferingPosition(accountId: string, productId: string, windowY: number, listY: number): void {
    if (!offeringEditorId(productId)) return
    try {
        sessionStorage.setItem(returnKey(accountId), JSON.stringify({ productId, windowY: Math.max(0, windowY), listY: Math.max(0, listY), expiresAt: Date.now() + 86_400_000 }))
    } catch { /* The live editor remains usable when browser storage is unavailable. */ }
}

export function readOfferingPosition(accountId: string, productId: string): OfferingReturnPosition | null {
    try {
        const value = JSON.parse(sessionStorage.getItem(returnKey(accountId)) || 'null') as OfferingReturnPosition | null
        if (!value || value.productId !== productId || !Number.isFinite(value.expiresAt) || value.expiresAt < Date.now()) return null
        if (![value.windowY, value.listY].every(coordinate => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 10_000_000)) return null
        return value
    } catch { return null }
}
