import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { createClient } from '@/lib/supabase/server'
import { validateProfileUsername } from '@/lib/profile-username'

async function handleGET(request: Request) {
    const { searchParams } = new URL(request.url)
    const validated = validateProfileUsername(searchParams.get('username'))
    if ('error' in validated) {
        return Response.json({ available: false, reason: validated.error })
    }

    const supabase = await createClient()
    const { data: existingUser, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', validated.username)
        .maybeSingle()

    if (error) {
        return Response.json({ available: false, reason: 'Failed to check username availability' }, { status: 500 })
    }

    return Response.json(existingUser
        ? { available: false, reason: 'Username is already taken' }
        : { available: true })
}

export const GET = withRuntimeGuard(handleGET)
