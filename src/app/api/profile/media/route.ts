import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, createPrivilegedClient, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedBody, requestBodyErrorResponse } from '@/lib/server/bounded-request'
import { normalizeProfileImage, MediaValidationError, type ProfileMediaKind } from '@/lib/server/profile-media'
import { reportRuntimeSignal } from '@/lib/server/runtime-signals'
import { guardActorUpload } from '@/lib/server/runtime-guard'

export const runtime = 'nodejs'
export const maxDuration = 30
const respond = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })

export async function POST(request: Request) {
    try {
        assertSameOrigin(request)
        const session = await createClient()
        const { data: { user }, error: authError } = await session.auth.getUser()
        if (authError && (authError.status === undefined || authError.status <= 0 || authError.status >= 500)) return respond({ error: 'Image uploads are temporarily unavailable. Your crop has been kept.' }, 503)
        if (authError || !user) return respond({ error: 'Please sign in to upload an image.' }, 401)
        // A stale tab may not upload account A's draft into account B's namespace.
        if (request.headers.get('x-nsso-account') !== user.id) return respond({ error: 'Your account changed. Reopen the image editor before uploading.', code: 'ACCOUNT_CHANGED' }, 409)
        const quotaDenied = await guardActorUpload(user.id)
        if (quotaDenied) return quotaDenied
        request.signal.throwIfAborted()
        const contentType = request.headers.get('content-type') || ''
        if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return respond({ error: 'Send an image using the upload form.' }, 415)
        const bytes = await readBoundedBody(request, 10 * 1024 * 1024 + 32768)
        let form: FormData
        try { form = await new Response(new Uint8Array(bytes).buffer, { headers: { 'Content-Type': contentType } }).formData() }
        catch { return respond({ error: 'The upload form could not be read.' }, 400) }
        if ([...form.keys()].some(key => key !== 'file' && key !== 'kind') || form.getAll('file').length !== 1 || form.getAll('kind').length !== 1) return respond({ error: 'Send one image and its image type.' }, 400)
        const kind = form.get('kind')
        const file = form.get('file')
        if (!['avatar', 'project', 'product'].includes(String(kind)) || !(file instanceof File)) return respond({ error: 'Choose a profile, project or product image.' }, 400)
        const output = await normalizeProfileImage(file, kind as ProfileMediaKind, request.signal)
        request.signal.throwIfAborted()
        const bucket = kind === 'avatar' ? 'avatars' : 'portfolio-assets'
        const path = `${user.id}/${kind}/${randomUUID()}.jpg`
        const trusted = createPrivilegedClient()
        const { error: uploadError } = await trusted.storage.from(bucket).upload(path, output, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
        if (uploadError) return respond({ error: 'The image was not uploaded. Your crop has been kept so you can retry.' }, 503)
        let registered = false
        for (let attempt = 0; attempt < 2 && !registered; attempt++) {
            try {
                const { data, error } = await trusted.rpc('register_profile_media', { p_actor_id: user.id, p_bucket_id: bucket, p_object_name: path, p_content_type: 'image/jpeg', p_bytes: output.length })
                registered = !error && data?.bucket === bucket && data?.objectName === path && data?.bytes === output.length && data?.contentType === 'image/jpeg'
            } catch { /* Reconcile using the same idempotent identity, never create another upload. */ }
        }
        if (!registered) {
            // The RPC may have committed despite a dropped response. Keep the
            // object; deleting it could invalidate its registered ownership.
            const requestId = reportRuntimeSignal('upstream_failed')
            return respond({ error: 'The image could not be confirmed. Your crop has been kept so you can retry.', requestId }, 503)
        }
        const { data } = trusted.storage.from(bucket).getPublicUrl(path)
        return respond({ url: data.publicUrl, path, accountId: user.id })
    } catch (error) {
        if (error instanceof MediaValidationError) return respond({ error: error.message }, error.status)
        if (request.signal.aborted) return respond({ error: 'This upload was cancelled.' }, 499)
        return permissionErrorResponse(error) || requestBodyErrorResponse(error) || respond({ error: 'The image was not uploaded. Your crop has been kept so you can retry.' }, 503)
    }
}
