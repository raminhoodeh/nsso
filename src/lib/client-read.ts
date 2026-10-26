/** Bound the complete read, including body decoding and transports that ignore abort. */
export async function boundedClientRead<T>(read: (signal: AbortSignal) => Promise<T>, { signal, timeoutMs = 8_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    if (signal?.aborted) throw signal.reason ?? new DOMException('Read canceled', 'AbortError')
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancel = () => {}
    const interrupted = new Promise<never>((_resolve, reject) => {
        cancel = () => { const reason = signal?.reason ?? new DOMException('Read canceled', 'AbortError'); controller.abort(reason); reject(reason) }
        signal?.addEventListener('abort', cancel, { once: true })
        timer = setTimeout(() => { const reason = new DOMException('Read timed out', 'TimeoutError'); controller.abort(reason); reject(reason) }, timeoutMs)
    })
    try { return await Promise.race([Promise.resolve().then(() => read(controller.signal)), interrupted]) }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}
