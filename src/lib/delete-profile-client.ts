import { boundedClientRead } from './client-read'

let currentIntent: { accountId: string; operationId: string } | null = null

/** Source defaults stay usable in fixtures; rollout builds can hide the action. */
export function isAccountDeletionAvailable(): boolean {
    try { return process.env.NEXT_PUBLIC_ACCOUNT_DELETION_ENABLED !== 'false' }
    catch { return true }
}

/** Memory only: desktop/mobile invokers must reconcile the same uncertain deletion. */
export function getProfileDeleteIntent(accountId: string): string {
    if (currentIntent?.accountId !== accountId) currentIntent = { accountId, operationId: crypto.randomUUID() }
    return currentIntent.operationId
}

export class ProfileDeleteError extends Error {
    constructor(message: string, readonly verifyIdentity = false) { super(message) }
}

/** Delete only the signed-in account; the server resolves all deletion targets. */
export async function deleteOwnProfile(accountId: string, operationId: string, signal: AbortSignal, send: typeof fetch = fetch): Promise<void> {
    if (!accountId) throw new Error('Sign in again before deleting your profile.')
    try {
        await boundedClientRead(async requestSignal => {
            const response = await send('/api/profile', {
                method: 'DELETE',
                headers: { 'X-Nsso-Account': accountId, 'X-Nsso-Delete-Intent': operationId },
                cache: 'no-store',
                signal: requestSignal,
            })
            const result = await response.json().catch(() => null)
            if (!response.ok && result?.code === 'DELETION_NOT_READY') {
                throw new ProfileDeleteError('Account deletion is temporarily unavailable. No deletion was started. Please try again shortly.')
            }
            if (!response.ok && result?.code === 'mfa_required') {
                throw new ProfileDeleteError('Verify your account with your authenticator before deleting your profile and login account.', true)
            }
            if (!response.ok && result?.code === 'DELETE_BUSY') {
                throw new ProfileDeleteError('Account deletion has started; an image upload is still finishing. Retry to finish.')
            }
            if (!response.ok && result?.code === 'DELETION_PENDING') {
                throw new ProfileDeleteError('Deletion is not complete yet. Some profile files may already have been removed. Please try again to finish deleting your profile and login account.')
            }
            if (!response.ok && result?.code === 'DELETE_BLOCKED') {
                const messages = [
                    'Another administrator must remain before this account can be deleted.',
                    'This account owns shared app assets. Please contact nsso before deleting it so shared content can be preserved.',
                ]
                throw new ProfileDeleteError(messages.includes(result?.error) ? result.error : 'This account cannot be deleted automatically. Please contact nsso for help.')
            }
            if (!response.ok || result?.deleted !== true || result?.accountId !== accountId || result?.operationId !== operationId) {
                throw new ProfileDeleteError('Deletion could not be confirmed. Please try again.')
            }
        }, { signal, timeoutMs: 30_000 })
    } catch (failure) {
        if (failure instanceof ProfileDeleteError || signal.aborted) throw failure
        throw new ProfileDeleteError('Deletion could not be confirmed. Please try again.')
    }
}
