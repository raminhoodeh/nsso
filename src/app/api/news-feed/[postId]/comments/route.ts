import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { createClient } from '@/lib/supabase/server'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const selection = 'id,post_id,user_id,content,created_at,user:users(username,profile:profiles(full_name,profile_pic_url))'
type CommentUser = { username: string; profile: { full_name: string | null; profile_pic_url: string | null } | { full_name: string | null; profile_pic_url: string | null }[] | null } | null
type Comment = { user: CommentUser | CommentUser[] }
function present<T extends Comment>(comment: T) {
    const user = Array.isArray(comment.user) ? comment.user[0] : comment.user
    const profile = Array.isArray(user?.profile) ? user.profile[0] : user?.profile
    return { ...comment, user: { username: user?.username ?? '', full_name: profile?.full_name || user?.username || 'nsso user', avatar_url: profile?.profile_pic_url ?? null } }
}
async function handleGET(_request: Request, { params }: { params: Promise<{ postId: string }> }) {
    try {
        const { postId } = await params
        if (!uuid.test(postId)) return Response.json({ error: 'Invalid post.' }, { status: 400, headers })
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return Response.json({ error: 'Please sign in.' }, { status: 401, headers })
        const { data, error } = await supabase.from('feed_comments').select(selection).eq('post_id', postId).order('created_at', { ascending: true }).limit(100)
        if (error) throw error
        return Response.json((data ?? []).map(present), { headers })
    } catch {
        return Response.json({ error: 'Comments could not be loaded. Please retry.' }, { status: 503, headers })
    }
}
async function handlePOST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
    try {
        assertSameOrigin(request)
        const { postId } = await params
        if (!uuid.test(postId)) return Response.json({ error: 'Invalid post.' }, { status: 400, headers })
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return Response.json({ error: 'Please sign in.' }, { status: 401, headers })
        const body = await readBoundedJson(request, 16_384)
        if (Object.keys(body).some(key => key !== 'content') || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 4000) return Response.json({ error: 'Write a comment of up to 4,000 characters.' }, { status: 400, headers })
        const { data, error } = await supabase.from('feed_comments').insert({ post_id: postId, user_id: user.id, content: body.content.trim() }).select(selection).single()
        if (error || !data) throw error
        return Response.json(present(data), { headers })
    } catch (error) {
        return permissionErrorResponse(error) ?? requestBodyErrorResponse(error) ?? Response.json({ error: 'Your comment could not be saved. Please retry.' }, { status: 503, headers })
    }
}

export const GET = withRuntimeGuard(handleGET)
export const POST = withRuntimeGuard(handlePOST)
