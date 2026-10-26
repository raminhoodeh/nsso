export type ProfileMediaKind = 'avatar' | 'project' | 'product'

/** The account header is a precondition, never a requested upload owner. */
export async function uploadProfileMedia(file: Blob, kind: ProfileMediaKind, expectedAccountId: string, signal?: AbortSignal): Promise<{ url: string; path: string }> {
    const form = new FormData()
    form.set('kind', kind)
    form.set('file', file, 'cropped-image.jpg')
    const response = await fetch('/api/profile/media', { method: 'POST', headers: { 'X-Nsso-Account': expectedAccountId }, body: form, signal, cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) throw new Error(typeof result.error === 'string' && result.error.length <= 300 ? result.error : 'The image was not uploaded. Your crop has been kept so you can retry.')
    if (result.accountId !== expectedAccountId || typeof result.url !== 'string' || typeof result.path !== 'string' || !result.path.startsWith(`${expectedAccountId}/${kind}/`)) throw new Error('Your account changed. Reopen the image editor before uploading.')
    return { url: result.url, path: result.path }
}
