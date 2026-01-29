import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { restoreUser } from '@/lib/auth-helpers'

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
            // Auto-Heal: Check for Foreign Key violation (Code 23503) indicating orphaned user
            if (error.code === '23503') {
                await restoreUser(supabase, user)

                // Retry the insert once
                const { error: retryError } = await supabase
                    .from('feed_likes')
                    .insert({
                        post_id: params.postId,
                        user_id: user.id
                    })

                if (retryError) {
                    if (retryError.code === '23505') {
                        return NextResponse.json({ message: 'Already liked' }, { status: 200 })
                    }
                    throw retryError
                }
                // Success on retry
                return NextResponse.json({ success: true })
            }

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
