import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient({ timeoutMs = 5_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {}) {
    const cookieStore = await cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { fetch: (input, init) => {
                const timeout = AbortSignal.timeout(timeoutMs)
                const signals = [timeout, ...(init?.signal ? [init.signal] : []), ...(signal ? [signal] : [])]
                return fetch(input, { ...init, signal: AbortSignal.any(signals) })
            } },
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // The `setAll` method was called from a Server Component.
                        // This can be ignored if you have middleware refreshing
                        // user sessions.
                    }
                },
            },
        }
    )
}
