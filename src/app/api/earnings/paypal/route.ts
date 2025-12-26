import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { validatePayPalSlug } from '@/lib/earnings'

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch { }
                    },
                },
            }
        )

        // Get authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Parse request body
        const body = await request.json()
        const { paypalMeSlug } = body

        // Validate PayPal slug
        if (!validatePayPalSlug(paypalMeSlug)) {
            return NextResponse.json(
                { error: 'Invalid PayPal.me slug format. Use only letters, numbers, hyphens, and underscores.' },
                { status: 400 }
            )
        }

        // Update user's PayPal slug
        const { error: updateError } = await supabase
            .from('users')
            .update({ paypal_me_slug: paypalMeSlug || null })
            .eq('id', user.id)

        if (updateError) {
            console.error('Error updating PayPal slug:', updateError)
            return NextResponse.json(
                { error: 'Failed to update PayPal information' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            paypalMeSlug: paypalMeSlug || null
        })
    } catch (error) {
        console.error('Unexpected error in PayPal update:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
