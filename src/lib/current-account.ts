import type { User } from '@/lib/types'
import { boundedClientRead } from './client-read'

export interface CurrentAccountResponse {
    user: User
    permissions: Array<'nsso:admin' | 'razinflix:manage'>
}

/** Private account details come only from the authenticated same-origin contract. */
export async function fetchCurrentAccount(signal?: AbortSignal): Promise<CurrentAccountResponse | null> {
    return boundedClientRead(async readSignal => {
        const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store', signal: readSignal })
        if (response.status === 401) return null
        if (!response.ok) throw new Error('Account details are temporarily unavailable.')
        return response.json() as Promise<CurrentAccountResponse>
    }, { signal })
}
