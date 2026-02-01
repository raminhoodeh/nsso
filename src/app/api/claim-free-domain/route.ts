import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const { desiredUsername } = await request.json()
        const cookieStore = await cookies()

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    get(name: string) {
                        return cookieStore.get(name)?.value
                    },
                    set(name: string, value: string, options: CookieOptions) {
                        cookieStore.set({ name, value, ...options })
                    },
                    remove(name: string, options: CookieOptions) {
                        cookieStore.set({ name, value: '', ...options })
                    },
                },
            }
        )

        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        if (!desiredUsername) {
            return NextResponse.json(
                { error: 'Username is required' },
                { status: 400 }
            )
        }

        // Validate username format (alphanumeric, 3-30 chars)
        const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/
        if (!usernameRegex.test(desiredUsername)) {
            return NextResponse.json(
                { error: 'Invalid username format. Use 3-30 alphanumeric characters.' },
                { status: 400 }
            )
        }

        // Check availability one last time (race condition check)
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', desiredUsername)
            .single()

        if (existingUser) {
            return NextResponse.json(
                { error: 'Username is already taken' },
                { status: 409 }
            )
        }

        // --- Execute Free Upgrade ---

        // Initialize Admin Client to bypass RLS for is_premium update
        const { createClient } = await import('@supabase/supabase-js')
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // 1. Update User Record using Admin Client
        const { error: updateUserError } = await supabaseAdmin
            .from('users')
            .update({
                username: desiredUsername,
                is_premium: true, // Grant premium status freely
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)

        if (updateUserError) {
            console.error('Error updating user record:', updateUserError)
            return NextResponse.json(
                { error: 'Failed to update user record' },
                { status: 500 }
            )
        }

        // 2. Create "Free Tier" Subscription Record
        // We record a subscription so the system knows it's active, even if unpaid.
        const { error: subError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
                user_id: user.id,
                status: 'active',
                polar_sub_id: 'free_tier_grant', // specific marker
                created_at: new Date().toISOString()
            })

        if (subError) {
            // Log but don't fail the request, as the user record is the source of truth for access
            console.error('Error creating subscription record:', subError)
        }

        return NextResponse.json({
            success: true,
            username: desiredUsername
        })

    } catch (err) {
        console.error('Claim Domain Error:', err)
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        )
    }
}
