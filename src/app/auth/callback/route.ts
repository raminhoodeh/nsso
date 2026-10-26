import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { safeInternalPath } from '@/lib/server/auth-redirect'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const next = safeInternalPath(requestUrl.searchParams.get('next'), requestUrl.origin)

    const redirect = (path: string) => {
        const response = NextResponse.redirect(new URL(path, requestUrl.origin))
        response.headers.set('Cache-Control', 'private, no-store')
        return response
    }

    if (code) {
        try {
            const supabase = await createClient()
            const { data, error } = await supabase.auth.exchangeCodeForSession(code)
            if (!error && data.user) {
                // Caller identity comes from the exchanged session; the RPC creates
                // missing account/profile/settings records atomically and idempotently.
                const { data: account, error: setupError } = await supabase.rpc('ensure_current_account')
                if (setupError || !account || account.id !== data.user.id) return redirect('/sign-in?error=account_setup')
                return redirect(next)
            }
        } catch {
            console.error('Auth callback failed', { code: 'AUTH_CALLBACK_UNAVAILABLE' })
        }
    }

    // Return the user to an error page with some instructions
    return redirect('/sign-in?error=auth')
}
