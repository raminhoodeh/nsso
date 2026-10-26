/** Keep upstream response bodies out of user-facing feed errors. */
export function feedRequestError(status: number, action: 'like' | 'comment' | 'post' | 'comments'): string {
    if (status === 401 || status === 403) return action === 'post' || action === 'comment' ? 'Please sign in again to continue. Your draft is still here.' : 'Please sign in again to continue.'
    if (status === 429) return 'Too many requests. Please wait a moment and try again.'
    if (status === 400 && (action === 'comment' || action === 'post')) return `Write a ${action} of up to 4,000 characters.`
    if (action === 'comments') return 'Comments could not be loaded. Please try again.'
    if (action === 'like') return 'Your like could not be saved. Please try again.'
    if (status === 0) return `We could not confirm your ${action} was saved. Your draft is still here; check the feed before trying again.`
    return `Your ${action} could not be saved. Your draft is still here. Please try again.`
}
