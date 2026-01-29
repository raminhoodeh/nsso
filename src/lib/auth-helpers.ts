import { SupabaseClient } from '@supabase/supabase-js'
import { User } from '@supabase/supabase-js'

export async function restoreUser(supabase: SupabaseClient, user: User) {
    console.log('Attempting to restore orphaned user:', user.id)

    // 1. Restore public.users
    // Generate a safe username from metadata or email, with random suffix to ensure uniqueness
    const baseName = (user.user_metadata?.username || user.email?.split('@')[0] || 'user')
        .replace(/[^a-zA-Z0-9_-]/g, '')

    const safeUsername = `${baseName}_${Math.random().toString(36).slice(2, 6)}`

    const { error: userError } = await supabase
        .from('users')
        .insert({
            id: user.id, // Must match auth.users id
            email: user.email,
            username: safeUsername,
            created_at: user.created_at
        })

    if (userError) {
        // If error is strictly about duplicate ID, it means user exists, which is fine.
        // If other error, we log it.
        console.log('Restore user insert result:', userError.code, userError.message)
    } else {
        console.log('Restored public.users record for:', user.id)
    }

    // 2. Restore public.profiles
    const fullName = user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        'Unknown User'

    const { error: profileError } = await supabase
        .from('profiles')
        .insert({
            user_id: user.id,
            full_name: fullName,
            profile_pic_url: user.user_metadata?.avatar_url
        })

    if (profileError) {
        console.log('Restore profile insert result:', profileError.code, profileError.message)
    } else {
        console.log('Restored public.profiles record for:', user.id)
    }
}
