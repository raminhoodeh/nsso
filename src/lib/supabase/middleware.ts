import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hasPermission } from '@/lib/server/permissions'

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
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

    // Refreshing the auth token
    const {
        data: { user },
    } = await supabase.auth.getUser()

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
        request.nextUrl.pathname.startsWith(route)
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
