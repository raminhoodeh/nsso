import 'server-only'

const DEADLINE_MS = 5_000
const errorNames = new Set(['AbortError', 'TimeoutError', 'TypeError', 'Error', 'AggregateError', 'SyntaxError'])
const causeCodes = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENETUNREACH', 'EHOSTUNREACH', 'EPROTO', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_ABORTED', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'])
export type PrivilegedFetchContext = { requestId?: string }
type Operation = 'runtime_limiter' | 'security_health' | 'permission_check' | 'other'

function operation(input: RequestInfo | URL): Operation {
    try {
        const path = new URL(input instanceof Request ? input.url : String(input)).pathname
        if (path === '/rest/v1/rpc/consume_nsso_request_limit') return 'runtime_limiter'
        if (path === '/rest/v1/rpc/nsso_security_health') return 'security_health'
        if (path === '/rest/v1/rpc/has_app_permission') return 'permission_check'
    } catch { /* Unknown destinations are never logged. */ }
    return 'other'
}

function allowedProperty(value: unknown, key: string, allowed: Set<string>, fallback: string): string {
    try {
        if (value && typeof value === 'object') {
            const item = (value as Record<string, unknown>)[key]
            if (typeof item === 'string' && allowed.has(item)) return item
        }
    } catch { /* A diagnostic must never replace the original error. */ }
    return fallback
}

function causeCode(error: unknown): string {
    try {
        if (error && typeof error === 'object') return allowedProperty((error as { cause?: unknown }).cause, 'code', causeCodes, 'NONE')
    } catch { /* Unknown exception shapes are not serialized. */ }
    return 'NONE'
}

function emit(context: PrivilegedFetchContext, details: Record<string, string | number | boolean | null>) {
    // No error objects, messages, stacks, destinations, headers, or payloads.
    const requestId = typeof context.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(context.requestId) ? context.requestId : undefined
    try { console.warn('nsso dependency signal', { code: 'privileged_dependency_failed', ...(requestId ? { requestId } : {}), ...details }) }
    catch { /* Observability does not change the request outcome. */ }
}

/** A single attempt with the existing deadline, observed before the SDK catches it. */
export function createPrivilegedFetch(context: PrivilegedFetchContext = {}, transport: typeof fetch = (...args) => fetch(...args)): typeof fetch {
    return async (input, init) => {
        const started = performance.now()
        const deadline = AbortSignal.timeout(DEADLINE_MS)
        const caller = init?.signal ?? (input instanceof Request ? input.signal : undefined)
        const signal = caller ? AbortSignal.any([deadline, caller]) : deadline
        const base = () => ({ operation: operation(input), elapsedMs: Math.max(0, Math.round(performance.now() - started)), deadlineAborted: deadline.aborted, callerAborted: caller?.aborted ?? false })
        try {
            const response = await transport(input, { ...init, signal })
            if (!response.ok) emit(context, { ...base(), failure: 'upstream_http', errorName: 'HttpError', causeCode: 'NONE', upstreamStatus: response.status })
            return response
        } catch (error) {
            emit(context, { ...base(), failure: deadline.aborted ? 'deadline' : caller?.aborted ? 'caller_cancelled' : 'transport', errorName: allowedProperty(error, 'name', errorNames, 'UnknownError'), causeCode: causeCode(error), upstreamStatus: null })
            throw error
        }
    }
}

/** The SDK returned an unusable limiter result; its body must remain private. */
export function reportLimiterResultFailure(context: PrivilegedFetchContext, started: number, error: boolean, upstreamStatus: unknown) {
    emit(context, {
        operation: 'runtime_limiter', failure: error ? 'rpc_error' : 'malformed_result',
        elapsedMs: Math.max(0, Math.round(performance.now() - started)), deadlineAborted: null,
        errorName: 'RpcError', causeCode: 'NONE',
        upstreamStatus: typeof upstreamStatus === 'number' && Number.isInteger(upstreamStatus) && upstreamStatus >= 100 && upstreamStatus <= 599 ? upstreamStatus : null,
    })
}
