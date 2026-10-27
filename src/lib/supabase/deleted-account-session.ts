import { DEFAULT_COOKIE_OPTIONS, isChunkLike, parseCookieHeader, serializeCookieHeader, stringFromBase64URL } from '@supabase/ssr'

type CleanupResult = 'cleared' | 'account-changed' | 'unavailable'

/** Only after a verified hard Auth deletion. No asynchronous SDK signOut:
 * its delayed storage removal can erase a different account's later sign-in.
 * NSSO uses the pinned SSR client's default cookie key/encoding/options.
 * These cookie claims are a deletion guard, never authorization evidence. */
export function clearDeletedAccountSession(accountId: string, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL): CleanupResult {
    try {
        if (!supabaseUrl || typeof document === 'undefined') return 'unavailable'
        const key = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
        const read = () => parseCookieHeader(document.cookie).filter(cookie => isChunkLike(cookie.name, key))
        const snapshot = read()
        if (!snapshot.length) return 'cleared'
        const single = snapshot.find(cookie => cookie.name === key)
        let encoded = ''
        if (single) {
            if (snapshot.length !== 1 || !single.value) return 'unavailable'
            encoded = single.value
        } else {
            if (snapshot.length > 32) return 'unavailable'
            for (let index = 0; index < snapshot.length; index++) {
                const chunk = snapshot.find(cookie => cookie.name === `${key}.${index}`)
                if (!chunk?.value) return 'unavailable'
                encoded += chunk.value
            }
        }
        const session = JSON.parse(encoded.startsWith('base64-') ? stringFromBase64URL(encoded.slice(7)) : encoded)
        const token = typeof session?.access_token === 'string' ? session.access_token.split('.') : []
        if (token.length !== 3 || typeof session?.user?.id !== 'string') return 'unavailable'
        const subject = JSON.parse(stringFromBase64URL(token[1]))?.sub
        if (typeof subject !== 'string' || subject !== session.user.id) return 'unavailable'
        if (subject !== accountId) return 'account-changed'
        const remaining = new Map(snapshot.map(cookie => [cookie.name, cookie.value]))
        // No await between the final identity check, exact snapshot comparison,
        // removal and the caller's hard navigation. Never touch PKCE verifiers,
        // another project's credentials, or arbitrary localStorage content.
        for (const cookie of snapshot) {
            const current = read()
            if (current.length !== remaining.size || current.some(value => remaining.get(value.name) !== value.value)) return 'account-changed'
            document.cookie = serializeCookieHeader(cookie.name, '', { ...DEFAULT_COOKIE_OPTIONS, maxAge: 0 })
            remaining.delete(cookie.name)
        }
        return read().length ? 'unavailable' : 'cleared'
    } catch { return 'unavailable' }
}
