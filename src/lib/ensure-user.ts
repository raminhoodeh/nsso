import { createClient } from '@/lib/supabase/server'
import { nanoid } from 'nanoid'

/**
 * Ensures a user record exists in public.users and public.profiles
 * Call this when a user first accesses authenticated pages
 */
export async function ensureUserExists(authUserId: string, email: string) {
    const supabase = await createClient()

    // Check if user already exists
    const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('id', authUserId)
        .single()

    if (existingUser) {
        return existingUser
    }

    // Create new user with random username
    const username = nanoid(8).toLowerCase()

    const { data: newUser, error: userError } = await supabase
        .from('users')
        .insert({
            id: authUserId,
            email: email,
            auth_provider: 'email',
            username: username,
        })
        .select()
        .single()

    if (userError) {
        console.error('Error creating user:', userError)
        throw userError
    }

    // Create empty profile
    const { error: profileError } = await supabase
        .from('profiles')
        .insert({
            user_id: authUserId,
        })

    if (profileError) {
        console.error('Error creating profile:', profileError)
    }

    return newUser
}
