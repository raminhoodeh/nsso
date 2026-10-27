import 'server-only'

import { createHmac } from 'node:crypto'
import type { createPrivilegedClient } from './permissions'
import { isUuid } from '@/lib/profile-mutations'

type Service = ReturnType<typeof createPrivilegedClient>
type Asset = { bucket: 'avatars' | 'portfolio-assets'; objectName: string }

export class AccountDeletionError extends Error {
    readonly code: 'DELETE_BUSY' | 'DELETE_BLOCKED' | 'DELETION_PENDING'
    readonly status: 409 | 503
    constructor(code: 'DELETE_BUSY' | 'DELETE_BLOCKED' | 'DELETION_PENDING', message: string, status: 409 | 503 = 503) {
        super(message)
        this.code = code
        this.status = status
    }
}

const pending = () => new AccountDeletionError('DELETION_PENDING', 'Deletion could not be completed. It may already be in progress, and some images may have been removed. Please try again to finish deleting your account.')

/** Technical receipts contain no email, profile content, or raw Auth UUID. */
export function deletionActorHash(accountId: string): string {
    const secret = process.env.NSSO_CHAT_IP_HASH_SECRET
    if (!isUuid(accountId) || !secret || secret.length < 32) throw pending()
    return createHmac('sha256', secret).update(`nsso-account-deletion/v1/${accountId}`).digest('hex')
}

export async function deletionWasCompleted(service: Service, accountId: string, operationId: string, reconcileMissingIdentity = false): Promise<boolean> {
    const actorHash = deletionActorHash(accountId)
    const { data, error } = await service.rpc('get_profile_deletion_receipt', { p_operation_id: operationId, p_actor_hash: actorHash })
    if (error || typeof data?.found !== 'boolean' || typeof data?.completed !== 'boolean') throw pending()
    if (data.completed) return true
    if (!data.found || !reconcileMissingIdentity) return false
    // A confirmed intent can outlive its Auth parent if the final receipt update
    // lost its response. Complete technical bookkeeping only after exact absence.
    const identity = await service.auth.admin.getUserById(accountId)
    if (identity.data?.user || !(identity.error?.status === 404 || identity.error?.code === 'user_not_found')) return false
    const result = await service.rpc('complete_profile_deletion', { p_operation_id: operationId, p_actor_hash: actorHash })
    if (result.error || result.data?.completed !== true) throw pending()
    return true
}

function validateAssets(value: unknown): Asset[] {
    if (!Array.isArray(value) || value.length > 200) throw pending()
    return value.map(item => {
        if (!item || !['avatars', 'portfolio-assets'].includes(item.bucket) || typeof item.objectName !== 'string'
            || !item.objectName.length || item.objectName.length > 1024 || /[\\\u0000-\u001f]/.test(item.objectName)
            || item.objectName.startsWith('/') || item.objectName.split('/').some((part: string) => part === '.' || part === '..')) throw pending()
        return { bucket: item.bucket, objectName: item.objectName }
    })
}

/** Supported Storage/Auth APIs only. The database manifest fences concurrent
 * uploads and fixes ownership before any destructive operation is attempted. */
export async function deleteOwnAccount(service: Service, accountId: string, operationId: string): Promise<void> {
    const actorHash = deletionActorHash(accountId)
    if (await deletionWasCompleted(service, accountId, operationId)) return
    const started = Date.now()
    for (let pass = 0; pass < 4; pass++) {
        const { data, error } = await service.rpc('prepare_profile_deletion', { p_actor_id: accountId, p_operation_id: operationId, p_actor_hash: actorHash })
        if (error || data?.accountId !== accountId || data?.operationId !== operationId) throw pending()
        if (data.status === 'busy') throw new AccountDeletionError('DELETE_BUSY', 'Account deletion has started; an image upload is still finishing. Retry to finish.', 409)
        if (data.status === 'blocked') throw new AccountDeletionError('DELETE_BLOCKED', data.reason === 'LAST_ADMIN'
            ? 'Another administrator must remain before this account can be deleted.'
            : 'This account owns shared app assets. Please contact nsso before deleting it so shared content can be preserved.', 409)
        if (data.status !== 'ready') throw pending()
        const assets = validateAssets(data.assets)
        if (!assets.length) {
            // Hard deletion cascades only this Auth identity's profile/children,
            // sessions and guarded legacy rows. Never delete the profile alone.
            try {
                await service.auth.admin.deleteUser(accountId, false)
            } catch { /* A dropped reply does not prove rollback. Verify below. */ }
            const identity = await service.auth.admin.getUserById(accountId)
            const absent = identity.error?.status === 404 || identity.error?.code === 'user_not_found'
            if (!absent || identity.data?.user) throw pending()
            // Even an apparently successful DELETE is not accepted until Auth
            // confirms absence. Conversely, a lost DELETE response can reconcile.
            const receipt = await service.rpc('complete_profile_deletion', { p_operation_id: operationId, p_actor_hash: actorHash })
            if (receipt.error || receipt.data?.completed !== true) throw pending()
            return
        }
        for (const bucket of ['avatars', 'portfolio-assets'] as const) {
            const names = [...new Set(assets.filter(asset => asset.bucket === bucket).map(asset => asset.objectName))]
            for (let index = 0; index < names.length; index += 100) {
                if (Date.now() - started > 40_000) throw pending()
                const result = await service.storage.from(bucket).remove(names.slice(index, index + 100))
                if (result.error) throw pending()
            }
        }
        // Re-read the manifest, rather than assuming an HTTP success removed
        // every object. Large/partial deletions resume under the same fence.
    }
    throw pending()
}
