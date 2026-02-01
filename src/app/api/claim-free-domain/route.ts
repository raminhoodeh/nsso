import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
    try {
        const { desiredUsername } = await request.json()
        // ... (rest of function)

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
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!serviceRoleKey) {
            console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY is missing')
            return NextResponse.json(
                { error: 'Configuration Error: Service Role Key missing' },
                { status: 500 }
            )
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            serviceRoleKey,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // 1. Update User Record using Admin Client
        console.log(`Attempting admin update for user ${user.id} to set username: ${desiredUsername}`)

        const { error: updateUserError } = await supabaseAdmin
            .from('users')
            .update({
                username: desiredUsername,
                is_premium: true // Grant premium status freely
            })
            .eq('id', user.id)

        if (updateUserError) {
            console.error('Detailed Admin Update Error:', JSON.stringify(updateUserError, null, 2))
            return NextResponse.json(
                { error: `Failed to update user record: ${updateUserError.message}` },
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
