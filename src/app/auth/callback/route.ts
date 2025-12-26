import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const next = requestUrl.searchParams.get('next') ?? '/dashboard'

    if (code) {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data.user) {
            // Check if user record exists, if not create it
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('id', data.user.id)
                .single()

            if (!existingUser) {
                // Create user record
                const username = nanoid(8).toLowerCase()
                await supabase.from('users').insert({
                    id: data.user.id,
                    email: data.user.email,
                    auth_provider: 'email',
                    username: username,
                })

                // Create profile record
                await supabase.from('profiles').insert({
                    user_id: data.user.id,
                })
            }

            return NextResponse.redirect(new URL(next, requestUrl.origin))
        }
    }

    // Return the user to an error page with some instructions
    return NextResponse.redirect(new URL('/sign-in?error=auth', requestUrl.origin))
}
