export type ProfileMediaKind = 'avatar' | 'project' | 'product'

const unconfirmedImage = 'The image save could not be confirmed. Your crop has been kept; check your profile before retrying.'

/** One explicit image attempt; cancellation never retries a possibly committed upload. */
export async function runProfileMediaAttempt<T>(work: (signal: AbortSignal) => Promise<T>, { signal, timeoutMs = 30_000 }: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<T> {
    if (signal?.aborted) throw new Error(unconfirmedImage)
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancel = () => {}
    const interrupted = new Promise<never>((_resolve, reject) => {
        cancel = () => { controller.abort(); reject(new Error(unconfirmedImage)) }
        signal?.addEventListener('abort', cancel, { once: true })
        timer = setTimeout(cancel, timeoutMs)
    })
    try {
        return await Promise.race([Promise.resolve().then(() => {
            if (controller.signal.aborted) throw new Error(unconfirmedImage)
            return work(controller.signal)
        }), interrupted])
    } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', cancel)
    }
}

/** The account header is a precondition, never a requested upload owner. */
export async function uploadProfileMedia(file: Blob, kind: ProfileMediaKind, expectedAccountId: string, signal?: AbortSignal): Promise<{ url: string; path: string }> {
    const form = new FormData()
    form.set('kind', kind)
    form.set('file', file, 'cropped-image.jpg')
    return runProfileMediaAttempt(async uploadSignal => {
        const response = await fetch('/api/profile/media', { method: 'POST', headers: { 'X-Nsso-Account': expectedAccountId }, body: form, signal: uploadSignal, cache: 'no-store' })
        const result = await response.json()
        if (!response.ok) throw new Error(typeof result.error === 'string' && result.error.length <= 300 ? result.error : 'The image was not uploaded. Your crop has been kept so you can retry.')
        if (result.accountId !== expectedAccountId || typeof result.url !== 'string' || typeof result.path !== 'string' || !result.path.startsWith(`${expectedAccountId}/${kind}/`)) throw new Error('Your account changed. Reopen the image editor before uploading.')
        return { url: result.url, path: result.path }
    }, { signal, timeoutMs: 20_000 })
}
