import { isTransientAuthError } from '@/lib/auth-errors'
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasPermission } from '@/lib/server/permissions'
import { createAuthFetch } from './auth-fetch'
import { boundedClientRead } from '../client-read'

export async function updateSession(request: NextRequest, requestHeaders: Headers = new Headers(request.headers)) {
    let supabaseResponse = NextResponse.next({
        request: { headers: requestHeaders },
    })

    const path = request.nextUrl.pathname
    const protectedRoute = ['/dashboard', '/preview', '/admin'].some(route => path === route || path.startsWith(route + '/'))
    // API handlers verify their actor; guest public pages need no Auth refresh.
    if (path.startsWith('/api/') || (!protectedRoute && !request.cookies.getAll().some(cookie => cookie.name.startsWith('sb-')))) return supabaseResponse

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: { fetch: createAuthFetch(process.env.NEXT_PUBLIC_SUPABASE_URL!, (input, init) => fetch(input, {
                ...init, signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5_000)]) : AbortSignal.timeout(5_000),
            })) },
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    requestHeaders.set('Cookie', request.headers.get('Cookie') || '')
                    supabaseResponse = NextResponse.next({
                        request: { headers: requestHeaders },
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                    // @supabase/ssr 0.8 does not supply automatic cache headers.
                    supabaseResponse.headers.set('Cache-Control', 'private, no-store')
                },
            },
        }
    )

    let user
    try {
        const result = await boundedClientRead(() => supabase.auth.getUser(), { timeoutMs: 5_000 })
        if (isTransientAuthError(result.error) && protectedRoute) throw new Error('Auth unavailable')
        user = result.data.user
    } catch {
        if (protectedRoute) {
            const response = new NextResponse('Sign-in verification is temporarily unavailable. Your account and draft are kept. Please reload shortly.', { status: 503, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '15' } })
            for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie)
            return response
        }
    }
    if (protectedRoute || request.cookies.getAll().some(cookie => cookie.name.startsWith('sb-'))) supabaseResponse.headers.set('Cache-Control', 'private, no-store')

    // Protected routes - redirect to sign-in if not authenticated
    const redirect = (path: string) => {
        const url = request.nextUrl.clone()
        url.pathname = path
        url.search = ''
        const response = NextResponse.redirect(url)
        for (const cookie of supabaseResponse.cookies.getAll()) response.cookies.set(cookie)
        response.headers.set('Cache-Control', 'private, no-store')
        return response
    }

    const protectedRoutes = ['/dashboard', '/preview', '/admin']
    const isProtectedRoute = protectedRoutes.some(route =>
        request.nextUrl.pathname === route || request.nextUrl.pathname.startsWith(route + '/')
    )

    if (isProtectedRoute && !user) {
        const response = redirect('/sign-in')
        const url = new URL(response.headers.get('location')!)
        url.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
        response.headers.set('location', url.href)
        return response
    }

    // Admin-only route protection
    if (request.nextUrl.pathname.startsWith('/admin') && user) {
        try {
            if (!await hasPermission(user.id, 'nsso:admin')) return redirect('/dashboard')
        } catch { return redirect('/dashboard') }
    }

    return supabaseResponse
}
