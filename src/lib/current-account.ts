import type { User } from '@/lib/types'
import { boundedClientRead } from './client-read'

export interface CurrentAccountResponse {
    user: User
    permissions: Array<'nsso:admin' | 'razinflix:manage'>
}

/** Private account details come only from the authenticated same-origin contract. */
export async function fetchCurrentAccount(signal?: AbortSignal): Promise<CurrentAccountResponse | null> {
    return boundedClientRead(async readSignal => {
        const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store', headers: { 'X-NSSO-Optional-Account': '1' }, signal: readSignal })
        if (response.status === 401) return null
        if (!response.ok) throw new Error('Account details are temporarily unavailable.')
        const account = await response.json() as CurrentAccountResponse | { user: null; permissions: [] }
        return account.user ? account as CurrentAccountResponse : null
    }, { signal })
}
