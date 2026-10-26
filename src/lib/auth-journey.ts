import { safeInternalPath } from './server/auth-redirect'
import { validateProfileUsername } from './profile-username'

/** A requested name is a draft intent. Claiming still needs availability and an explicit save. */
export function profileClaimDestination(value: string | null | undefined) {
    const result = validateProfileUsername(value)
    return 'username' in result ? `/dashboard?claim=${encodeURIComponent(result.username)}` : '/dashboard'
}

export function authDestination(params: URLSearchParams, origin: string) {
    return safeInternalPath(params.get('next'), origin, profileClaimDestination(params.get('name')))
}

export function authCallbackUrl(origin: string, destination: string) {
    const callback = new URL('/auth/callback', origin)
    callback.searchParams.set('next', safeInternalPath(destination, origin))
    return callback.href
}

export function authErrorMessage(value: string | null) {
    if (value === 'password-link') return 'This password link has expired or could not be verified. Request a new reset link and try again.'
    if (value === 'account_setup') return 'You signed in, but your profile could not be prepared. Please try signing in again.'
    if (value === 'auth') return 'Sign-in could not be completed. Please try again.'
    return ''
}
