import { createClient } from '@supabase/supabase-js'

/** Public reads must never inherit a visitor's expired browser/cookie session. */
export function createPublicReadClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
            global: { fetch: (input, init) => {
                const timeout = AbortSignal.timeout(5_000)
                return fetch(input, { ...init, cache: 'no-store', signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout })
            } },
        }
    )
}
