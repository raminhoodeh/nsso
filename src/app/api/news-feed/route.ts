import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { assertSameOrigin, permissionErrorResponse } from '@/lib/server/permissions'
import { readBoundedJson, requestBodyErrorResponse } from '@/lib/server/bounded-request'

export async function GET(request: Request) {
    const supabase = await createClient()

    try {
        const { searchParams } = new URL(request.url)
        const cursor = searchParams.get('cursor')
        const limit = 20

        // In a real scenario with connections, we would filter by:
        // WHERE user_id IN (SELECT connected_user_id FROM my_nsso WHERE user_id = auth.uid()) 
        // OR user_id = auth.uid()
        // OR (public feed logic)

        // For now, let's fetch global feed (as per "Publicly viewable" start)
        let query = supabase
            .from('feed_posts')
            .select(`
                *,
                user:users!user_id(
                    username, 
                    profile:profiles(full_name, profile_pic_url)
                ),
                likes:feed_likes(user_id),
                _count:feed_comments(count)
            `)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (cursor && (!Number.isFinite(Date.parse(cursor)) || cursor.length > 40)) return NextResponse.json({ error: 'Invalid feed cursor.' }, { status: 400 })
        if (cursor) {
            query = query.lt('created_at', cursor)
        }

        const { data, error } = await query

        if (error) throw error

        return NextResponse.json({
            posts: data,
            nextCursor: data.length === limit ? data[data.length - 1].created_at : null
        })

    } catch (error) {
        console.error('Feed unavailable', { code: 'FEED_READ_FAILED' })
        return NextResponse.json({ error: 'Failed to fetch feed' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    const supabase = await createClient()

    try {
        assertSameOrigin(request)
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { content, ...extra } = await readBoundedJson(request, 16_384)
        if (Object.keys(extra).length || typeof content !== 'string' || !content.trim() || content.length > 4000) return NextResponse.json({ error: 'Write a post of up to 4,000 characters.' }, { status: 400 })
        const { data, error } = await supabase
            .from('feed_posts')
            .insert({
                user_id: user.id,
                type: 'manual',
                content,
                metadata: {}
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json(data)

    } catch (error) {
        console.error('Feed unavailable', { code: 'FEED_WRITE_FAILED' })
        return permissionErrorResponse(error) ?? requestBodyErrorResponse(error) ?? NextResponse.json({ error: 'Your post could not be saved. Please retry.' }, { status: 503 })
    }
}
