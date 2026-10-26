import { createClient } from '@/lib/supabase/server'
import { validateProfileUsername } from '@/lib/profile-username'

export async function updateFreeProfileUsername(request: Request, field: 'username' | 'desiredUsername') {
    try {
        const supabase = await createClient()
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: unknown
        try {
            body = await request.json()
        } catch {
            return Response.json({ error: 'Invalid JSON request' }, { status: 400 })
        }

        const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[field] : undefined
        const validated = validateProfileUsername(value)
        if ('error' in validated) {
            return Response.json({ error: validated.error }, { status: 400 })
        }
        const { username } = validated

        const { data: existingUser, error: lookupError } = await supabase
            .from('users')
            .select('id')
            .eq('username', username)
            .maybeSingle()

        if (lookupError) {
            console.error('Username availability check failed:', lookupError)
            return Response.json({ error: 'Failed to check username availability' }, { status: 500 })
        }
        if (existingUser && existingUser.id !== user.id) {
            return Response.json({ error: 'Username is already taken' }, { status: 409 })
        }

        // Premium access is free. The legacy flag is retained for existing clients;
        // claiming a name creates no subscription, billing event or referral revenue.
        const { error: updateError } = await supabase
            .from('users')
            .update({ username, is_premium: true })
            .eq('id', user.id)
            .select('id')
            .single()

        if (updateError) {
            if (updateError.code === '23505') {
                return Response.json({ error: 'Username is already taken' }, { status: 409 })
            }
            console.error('Username update failed:', updateError)
            return Response.json({ error: 'Failed to update username' }, { status: 500 })
        }

        return Response.json({ success: true, username })
    } catch (error) {
        console.error('Free profile username error:', error)
        return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
}
