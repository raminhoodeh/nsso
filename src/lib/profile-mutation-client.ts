import { isProfileChange, type MutationResult, type ProfileChange, type ProfileOperation } from './profile-mutations'

/** Stable envelopes survive duplicate clicks, dropped replies, status checks and retries. */
export class ProfileMutationClient {
    revision: number
    private requests = new Map<string, { path: string; body: Record<string, unknown>; pending?: Promise<MutationResult> }>()
    private tail: Promise<unknown> = Promise.resolve()
    private controller = new AbortController()
    private readonly send: typeof fetch
    private readonly accountId?: string
    constructor(revision: number, send: typeof fetch = fetch, accountId?: string) { this.revision = revision; this.send = send; this.accountId = accountId }
    activate() { if (this.controller.signal.aborted) this.controller = new AbortController() }
    setRevision(revision: number) { this.revision = Math.max(this.revision, revision) }
    dispose() { this.controller.abort(); this.requests.clear() }

    private fallback(operationId: string, status: MutationResult['status'], code?: string): MutationResult { return { status, operationId, revision: this.revision, changes: [], code } }
    async status(operationId: string): Promise<MutationResult> {
        try {
            const response = await this.send(`/api/profile/operations?operationId=${encodeURIComponent(operationId)}`, { headers: this.accountId ? {'X-Nsso-Account':this.accountId} : {}, signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]), cache: 'no-store' })
            if (!response.ok) return this.fallback(operationId, 'outcomeUnknown')
            const result = await response.json()
            if (!['applied', 'conflict', 'rejected', 'not_found'].includes(result.status) || result.operationId !== operationId || !Number.isSafeInteger(result.revision)) return this.fallback(operationId, 'outcomeUnknown')
            if(result.status==='applied')this.revision = Math.max(this.revision, result.revision)
            return { ...result, changes: Array.isArray(result.changes) ? result.changes : [] }
        } catch { return this.fallback(operationId, 'outcomeUnknown') }
    }

    private submit(operationId: string, path: string, createBody: () => Record<string, unknown>, currentRevisionAtSend = false): Promise<MutationResult> {
        const existing = this.requests.get(operationId)
        if (existing?.pending) return existing.pending
        const entry = existing || { path, body: createBody() }
        this.requests.set(operationId, entry)
        const run = async () => {
            if (this.controller.signal.aborted) return this.fallback(operationId, 'failed', 'ACCOUNT_CHANGED')
            if (existing) {
                const known = await this.status(operationId)
                if (known.status !== 'not_found') return known
            }
            try {
                if (!existing && currentRevisionAtSend) entry.body.expectedRevision = this.revision
                const response = await this.send(entry.path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.accountId ? {'X-Nsso-Account':this.accountId} : {}) }, body: JSON.stringify(entry.body), signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10000)]) })
                const result = await response.json()
                if (response.status === 401) return this.fallback(operationId, 'rejected', 'AUTHENTICATION_REQUIRED')
                if (['applied', 'conflict', 'rejected'].includes(result.status) && result.operationId === operationId && Number.isSafeInteger(result.revision)) {
                    if(result.status==='applied')this.revision = Math.max(this.revision, result.revision)
                    return { ...result, changes: Array.isArray(result.changes) ? result.changes : [] } as MutationResult
                }
                if (response.status >= 400 && response.status < 500) return this.fallback(operationId, 'rejected', result.code)
            } catch { /* A transport error does not prove rollback. Reconcile first. */ }
            const known = await this.status(operationId)
            return known.status === 'not_found' ? this.fallback(operationId, 'outcomeUnknown') : known
        }
        const pending = this.tail.then(run, run)
        entry.pending = pending
        this.tail = pending.catch(() => undefined)
        void pending.finally(() => { entry.pending = undefined })
        return pending
    }

    apply(changes: ProfileChange[], operationId = crypto.randomUUID(), expectedRevision?: number): Promise<MutationResult> {
        if (!changes.length || changes.length > 20 || !changes.every(isProfileChange)) return Promise.resolve(this.fallback(operationId, 'rejected', 'INVALID_OPERATION'))
        const previous = this.requests.get(operationId)
        if (previous && JSON.stringify(previous.body.changes) !== JSON.stringify(changes)) return Promise.resolve(this.fallback(operationId, 'rejected', 'OPERATION_ID_REUSED'))
        return this.submit(operationId, '/api/profile/operations', () => ({ version: 1, operationId, expectedRevision: expectedRevision ?? this.revision, changes } satisfies ProfileOperation), expectedRevision === undefined)
    }

    undo(originalOperationId: string, operationId = crypto.randomUUID()): Promise<MutationResult> {
        return this.submit(operationId, '/api/profile/operations/undo', () => ({ version: 1, operationId, originalOperationId, expectedRevision: this.revision }), true)
    }
}
