import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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

        const { error } = await supabase
            .from('feed_likes')
            .insert({
                post_id: params.postId,
                user_id: user.id
            })

        if (error) {
            // formatting error code 23505 is unique violation (already liked)
            if (error.code === '23505') {
                return NextResponse.json({ message: 'Already liked' }, { status: 200 })
            }
            throw error
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error liking post:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: { postId: string } }
) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { error } = await supabase
            .from('feed_likes')
            .delete()
            .match({
                post_id: params.postId,
                user_id: user.id
            })

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error unliking post:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
