import { updateSession } from '@/lib/supabase/middleware'
import { guardRuntimePreflight } from '@/lib/server/runtime-guard'
import { prepareSecurityRequest, securityHeaders } from '@/lib/server/security-headers'
import { type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
    const security = prepareSecurityRequest(request)
    const denied = guardRuntimePreflight(request)
    if (denied) return securityHeaders(request, denied, security)
    const response = await updateSession(request, security.requestHeaders)
    if (security.nonce) response.headers.set('Cache-Control', 'private, no-store')
    if (request.nextUrl.pathname.startsWith('/api/')) { response.headers.set('Cache-Control', 'private, no-store'); response.headers.set('Vary', 'Cookie') }
    return securityHeaders(request, response, security)
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - known public video/PDF assets (including range requests)
         */
        '/((?!_next/static|_next/image|favicon.ico|vendor/|(?:homepage-video|nsso-homepage-profile-demo|nsso-vision-ukYfrg0ZNbA)\\.mp4$|deck\\.pdf$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
