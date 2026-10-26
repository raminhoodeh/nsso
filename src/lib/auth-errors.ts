/** Auth throttling/unavailability does not establish that a session was revoked. */
export function isTransientAuthError(error: { status?: number } | null | undefined) {
    if (!error) return false
    const status = error.status
    return status === undefined || !Number.isFinite(status) || status <= 0 || status === 429 || status >= 500
}
