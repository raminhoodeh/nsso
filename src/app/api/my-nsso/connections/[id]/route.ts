import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await request.json()
        const { notes, location } = body

        // Validate payload
        // Allow updating either notes or location, or both
        if (notes === undefined && location === undefined) {
            return NextResponse.json(
                { error: 'Nothing to update' },
                { status: 400 }
            )
        }

        if (notes && notes.length > 3333) {
            return NextResponse.json(
                { error: 'Notes exceed 3333 characters' },
                { status: 400 }
            )
        }

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

        // Verify ownership (RLS handles this but good to be explicit/optimistic checks)
        // We will just perform the update with the user_id filter
        const updateData: any = { updated_at: new Date().toISOString() }
        if (notes !== undefined) updateData.notes = notes
        if (location !== undefined) updateData.location_name = location

        const { error } = await supabase
            .from('my_nsso')
            .update(updateData)
            .eq('id', id)
            .eq('user_id', user.id) // Security check

        if (error) {
            console.error('Update connections error:', error)
            return NextResponse.json(
                { error: 'Failed to update connection' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Unexpected error updating connection:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
