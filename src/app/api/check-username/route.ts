import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')

    if (!username) {
        return NextResponse.json({ error: 'Username required' }, { status: 400 })
    }

    // Validate username format (alphanumeric, underscores, hyphens, 3-30 chars)
    const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/
    if (!usernameRegex.test(username)) {
        return NextResponse.json({
            available: false,
            reason: 'Username must be 3-30 characters, alphanumeric with underscores or hyphens only'
        })
    }

    // Check reserved words
    const reservedWords = ['admin', 'api', 'www', 'app', 'dashboard', 'preview', 'sign-in', 'sign-up', 'reset-password', 'auth', 'settings', 'profile']
    if (reservedWords.includes(username.toLowerCase())) {
        return NextResponse.json({ available: false, reason: 'This username is reserved' })
    }

    const supabase = await createClient()

    // Check if username is already taken
    const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('username', username.toLowerCase())
        .single()

    if (existingUser) {
        return NextResponse.json({ available: false, reason: 'Username is already taken' })
    }

    return NextResponse.json({ available: true })
}
