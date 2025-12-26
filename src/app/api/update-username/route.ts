import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const { username } = await request.json()

        if (!username) {
            return NextResponse.json({ error: 'Username required' }, { status: 400 })
        }

        // Validate username format (alphanumeric, underscores, hyphens, 3-30 chars)
        const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/
        if (!usernameRegex.test(username)) {
            return NextResponse.json({
                error: 'Username must be 3-30 characters, alphanumeric with underscores or hyphens only'
            }, { status: 400 })
        }

        // Check reserved words
        const reservedWords = ['admin', 'api', 'www', 'app', 'dashboard', 'preview', 'sign-in', 'sign-up', 'reset-password', 'auth', 'settings', 'profile']
        if (reservedWords.includes(username.toLowerCase())) {
            return NextResponse.json({ error: 'This username is reserved' }, { status: 400 })
        }

        const supabase = await createClient()

        // Get current user and verify premium status
        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { data: userData } = await supabase
            .from('users')
            .select('is_premium')
            .eq('id', authUser.id)
            .single()

        if (!userData?.is_premium) {
            return NextResponse.json({ error: 'Premium subscription required' }, { status: 403 })
        }

        // Check availability
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', username.toLowerCase())
            .single()

        if (existingUser) {
            return NextResponse.json({ error: 'Username is already taken' }, { status: 400 })
        }

        // Update username
        const { error: updateError } = await supabase
            .from('users')
            .update({ username: username.toLowerCase() })
            .eq('id', authUser.id)

        if (updateError) {
            console.error('Error updating username:', updateError)
            return NextResponse.json({ error: 'Failed to update username' }, { status: 500 })
        }

        return NextResponse.json({ success: true, username: username.toLowerCase() })
    } catch (error) {
        console.error('Update username error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
