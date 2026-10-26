const RESERVED_USERNAMES = new Set([
    'admin', 'api', 'app', 'assets', 'auth', 'dashboard', 'deity', 'docs',
    'dreamsea', 'earnings', 'film', 'news', 'places', 'preview', 'products',
    'profile', 'reset-password', 'set-password', 'settings', 'sign-in', 'sign-up', 'www',
])

export function validateProfileUsername(value: unknown): { username: string } | { error: string } {
    if (typeof value !== 'string' || !value) {
        return { error: 'Username required' }
    }

    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(value)) {
        return { error: 'Username must be 3-30 characters, alphanumeric with underscores or hyphens only' }
    }

    const username = value.toLowerCase()
    if (RESERVED_USERNAMES.has(username)) {
        return { error: 'This username is reserved' }
    }

    return { username }
}
