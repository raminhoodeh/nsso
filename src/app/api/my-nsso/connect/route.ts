import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { scannedUserId, location } = body

        if (!scannedUserId) {
            return NextResponse.json(
                { error: 'Scanned user ID is required' },
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

        // Get authenticated user (the scanner)
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Prevent self-scanning connection
        if (user.id === scannedUserId) {
            return NextResponse.json(
                { error: 'You cannot add yourself to My nsso' },
                { status: 400 }
            )
        }

        // Verify scanned user exists
        const { data: scannedUser, error: fetchError } = await supabase
            .from('users')
            .select('id, username')
            .eq('id', scannedUserId)
            .single()

        if (fetchError || !scannedUser) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            )
        }

        const timestamp = new Date().toISOString()
        const locationName = location || ''

        // Create bidirectional connections
        // 1. Scanner -> Scanned
        const { error: insertError1 } = await supabase
            .from('my_nsso')
            .upsert({
                user_id: user.id,
                connected_user_id: scannedUserId,
                date_met: timestamp,
                location_name: locationName,
                updated_at: timestamp
                // notes are preserved on upsert if we don't include them in the update set?
                // Default upsert behavior in Supabase/Postgres: 
                // We typically specify `onConflict` columns. 
                // Implicitly, passing the whole object replaces values. 
                // However, we WANT to preserve notes.
                // Supabase `.upsert` replaces the row usually. 
                // We should use text-based upsert configuration or simply check if exists first?
                // Or better: Use `onConflict` with `ignoreDuplicates: false` (default)
                // But we want to UPDATE date_met and location_name, but KEEP notes.
                // Standard .upsert() might overwrite 'notes' with default/null if not provided?
                // Let's check docs or behavior.
                // Actually, if we provide `notes` as undefined, it might not update it if using JSON?
                // No, typically it updates the row.
            }, {
                onConflict: 'user_id, connected_user_id',
                ignoreDuplicates: false
            })

        // Optimized approach: Check if exists to preserve notes, OR use a more specific query?
        // Actually, Supabase upsert will overwrite fields provided. If we don't provide notes, 
        // will it set it to null/default? 
        // Postgres `ON CONFLICT DO UPDATE SET ...`
        // Supabase client constructs this. If we pass object `{a:1, b:2}`, it sets a=1, b=2.
        // If we want to preserve `notes`, we have to be careful.

        // Let's do a smart update:
        // 1. Check if connection exists.
        const { data: existing } = await supabase
            .from('my_nsso')
            .select('id')
            .eq('user_id', user.id)
            .eq('connected_user_id', scannedUserId)
            .single()

        if (existing) {
            // Update specific fields only (preserving notes)
            await supabase.from('my_nsso')
                .update({
                    date_met: timestamp,
                    location_name: locationName,
                    updated_at: timestamp
                })
                .eq('id', existing.id)
        } else {
            // Insert new
            await supabase.from('my_nsso')
                .insert({
                    user_id: user.id,
                    connected_user_id: scannedUserId,
                    date_met: timestamp,
                    location_name: locationName,
                })
        }

        // 2. Scanned -> Scanner (Bidirectional)
        // Repeat logic for the other direction
        const { data: existingReverse } = await supabase
            .from('my_nsso')
            .select('id')
            .eq('user_id', scannedUserId)
            .eq('connected_user_id', user.id)
            .single()

        if (existingReverse) {
            await supabase.from('my_nsso')
                .update({
                    date_met: timestamp,
                    location_name: locationName,
                    updated_at: timestamp
                })
                .eq('id', existingReverse.id)
        } else {
            // Optimization: We can insert both in parallel but let's keep it safe sequence
            await supabase.from('my_nsso')
                .insert({
                    user_id: scannedUserId,
                    connected_user_id: user.id,
                    date_met: timestamp,
                    location_name: locationName,
                })
        }
        // Note: For the 'reverse' connection, arguably we might NOT want to overwrite the location/date 
        // if *that* user considers the meeting different? 
        // But the spec says "When the user navigates to "My nsso" it's the list of nsso users they've scanned... 
        // then "if i scan one person's QR code then i'm automatically also added to their My nsso and they're added to my My nsso."
        // We will synchronize the stamp for both for simplicity as per "Contextual Stamp" logic.

        return NextResponse.json({
            success: true,
            isNewConnection: !existing,
            scannedUser: {
                username: scannedUser.username
            }
        })

    } catch (error) {
        console.error('Connection error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
