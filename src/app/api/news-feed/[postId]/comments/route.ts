import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET comments for a post
export async function GET(
    request: Request,
    { params }: { params: { postId: string } }
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        // Optional: Check if user is allowed to view (public/connected)
        // For now, RLS handles it, but we need auth context
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: comments, error } = await supabase
            .from('feed_comments')
            .select(`
                *,
                user:users(username, first_name, last_name, avatar_url)
            `)
            .eq('post_id', params.postId)
            .order('created_at', { ascending: true })

        if (error) throw error

        // Transform user data to match frontend expectations
        const formattedComments = (comments || []).map((comment: any) => ({
            ...comment,
            user: {
                username: comment.user.username,
                full_name: `${comment.user.first_name || ''} ${comment.user.last_name || ''}`.trim() || comment.user.username,
                avatar_url: comment.user.avatar_url
            }
        }))

        return NextResponse.json(formattedComments)
    } catch (error) {
        console.error('Error fetching comments:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

// POST a new comment
export async function POST(
    request: Request,
    { params }: { params: { postId: string } }
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const json = await request.json()
        const { content } = json

        if (!content || !content.trim()) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 })
        }

        const { data: comment, error } = await supabase
            .from('feed_comments')
            .insert({
                post_id: params.postId,
                user_id: user.id,
                content: content.trim()
            })
            .select(`
                *,
                user:users(username, first_name, last_name, avatar_url)
            `)
            .single()

        if (error) throw error

        const formattedComment = {
            ...comment,
            user: {
                username: comment.user.username,
                full_name: `${comment.user.first_name || ''} ${comment.user.last_name || ''}`.trim() || comment.user.username,
                avatar_url: comment.user.avatar_url
            }
        }

        return NextResponse.json(formattedComment)
    } catch (error) {
        console.error('Error creating comment:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
