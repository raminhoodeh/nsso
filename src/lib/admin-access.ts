/** Email eligibility is an additional restriction, never an administrator grant. */
const adminEmails = new Set(['raminhoodeh@gmail.com', 'troy@nsso.me'])

export function isAdminEmailEligible(email: unknown): boolean {
    return typeof email === 'string' && adminEmails.has(email.trim().toLowerCase())
}

/** Pass only a user returned by the Auth server, not account rows or editable metadata. */
export function isVerifiedAdminIdentity(user: { email?: string | null; email_confirmed_at?: string } | null | undefined): boolean {
    return !!user && isAdminEmailEligible(user.email)
        && typeof user.email_confirmed_at === 'string' && user.email_confirmed_at.length > 0
}

/** Navigation mirrors server-issued capabilities; it is not an authorization boundary. */
export function canAccessAdmin(user: { email?: string | null; permissions?: readonly string[] } | null | undefined): boolean {
    return !!user && isAdminEmailEligible(user.email) && !!user.permissions?.includes('nsso:admin')
}
