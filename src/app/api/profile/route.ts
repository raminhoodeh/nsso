import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { isTransientAuthError } from '@/lib/auth-errors'
import { isUuid } from '@/lib/profile-mutations'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, createPrivilegedClient, permissionErrorResponse, PermissionError } from '@/lib/server/permissions'
import { AccountDeletionError, deleteOwnAccount, deletionWasCompleted } from '@/lib/server/account-deletion'

export const runtime = 'nodejs'
export const maxDuration = 60
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

async function handleDELETE(request: Request) {
    try {
        assertSameOrigin(request)
        const accountId = request.headers.get('x-nsso-account')
        const operationId = request.headers.get('x-nsso-delete-intent')
        if (!isUuid(accountId) || !isUuid(operationId) || request.body !== null || new URL(request.url).search) return respond({ error: 'Use the profile deletion confirmation to delete your own account.' }, 400)
        // Deploy reserved media uploads first, then enable deletion only after
        // superseded lease-less production requests have drained.
        if (process.env.NSSO_ACCOUNT_DELETION_ENABLED !== 'true') return respond({ error: 'Account deletion is temporarily unavailable. No deletion was started. Please try again shortly.', code: 'DELETION_NOT_READY' }, 503)
        const session = await createClient({ readOnlyCookies: true })
        const auth = await session.auth.getUser()
        if (isTransientAuthError(auth.error)) return respond({ error: 'Account verification is temporarily unavailable. No new deletion was started.' }, 503)
        if (!auth.data.user || auth.error) {
            // This is status reconciliation ONLY, never unauthenticated deletion.
            // Possession of the original unguessable nonce and matching actor HMAC
            // can confirm a completed intent after its Auth identity was removed.
            const completed = await deletionWasCompleted(createPrivilegedClient(), accountId, operationId, true)
            return completed ? respond({ deleted: true, accountId, operationId }) : respond({ error: 'Please sign in to confirm account deletion.' }, 401)
        }
        if (auth.data.user.id !== accountId) return respond({ error: 'Your signed-in account changed. Reopen the confirmation before deleting.', code: 'ACCOUNT_CHANGED' }, 409)
        if (auth.data.user.factors?.some(factor => factor.status === 'verified')) {
            const assurance = await session.auth.mfa.getAuthenticatorAssuranceLevel()
            if (assurance.error) throw new PermissionError(503, 'permission_check_unavailable')
            if (assurance.data.currentLevel !== 'aal2') throw new PermissionError(403, 'mfa_required')
        }
        request.signal.throwIfAborted()
        await deleteOwnAccount(createPrivilegedClient(), accountId, operationId)
        // The client clears only the expected local account after this receipt.
        // No late Set-Cookie is sent that could erase a newer account's sign-in.
        return respond({ deleted: true, accountId, operationId })
    } catch (error) {
        if (error instanceof AccountDeletionError) return respond({ error: error.message, code: error.code }, error.status)
        return permissionErrorResponse(error) || respond({ error: 'Deletion could not be confirmed. Please try again to check and finish the same deletion.', code: 'DELETION_PENDING' }, 503)
    }
}

export const DELETE = withRuntimeGuard(handleDELETE)
