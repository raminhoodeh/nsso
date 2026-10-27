import { withRuntimeGuard } from '@/lib/server/runtime-route'
import { isTransientAuthError } from '@/lib/auth-errors'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

async function handleGET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const sort = searchParams.get('sort') || 'date'
        const order = searchParams.get('order') || 'desc'
        const search = searchParams.get('search') || ''
        if (search.length > 200 || !['date','location','name'].includes(sort) || !['asc','desc'].includes(order)) return NextResponse.json({ error: 'Choose a valid filter.' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } })

        const supabase = await createClient()

        // Get authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (isTransientAuthError(authError)) return NextResponse.json({ error: 'Connections are temporarily unavailable. Please retry.' }, { status: 503, headers: privateHeaders })
        if (authError || !user) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401, headers: privateHeaders }
            )
        }

        // Build query
        // Note: We need to join with users and then profiles to get connection details
        // my_nsso.connected_user_id -> users.id -> profiles.user_id

        // Supabase select syntax for nested relations
        // We select all fields from my_nsso, plus details from the connected user
        let query = supabase
            .from('my_nsso')
            .select(`
                id,
                date_met,
                location_name,
                notes,
                connected_user_id,
                connected_user:users!connected_user_id (
                    username,
                    profiles (
                        full_name,
                        headline,
                        profile_pic_url
                    )
                )
            `)
            .eq('user_id', user.id).limit(1000)

        // Apply sorting
        if (sort === 'date') {
            query = query.order('date_met', { ascending: order === 'asc' })
        } else if (sort === 'location') {
            query = query.order('location_name', { ascending: order === 'asc' })
        }
        // Note: Sorting by nested fields (like name/profiles.full_name) is tricky in Supabase basic client.
        // It's often easier to sort in-memory for small datasets or use an RPC if needed.
        // For V1, we'll handle name sorting in memory if requested, or just ignore for now and let frontend handle it 
        // if pagination is not heavy. Given < 1000 contacts usually, client-side sort is fine. 
        // But let's try to order by date at least as standard.

        const { data, error } = await query

        if (error) {
            console.error('Connections unavailable', { code: 'CONNECTION_READ_FAILED' })
            return NextResponse.json(
                { error: 'Failed to fetch connections' },
                { status: 503, headers: privateHeaders }
            )
        }

        // Transform data
        let connections = data.map((item: any) => {
            // Handle profiles relation (Supabase can return array or object depending on relation type detected)
            const profile = Array.isArray(item.connected_user?.profiles)
                ? item.connected_user.profiles[0]
                : item.connected_user?.profiles

            return {
                id: item.id,
                connectedUserId: item.connected_user_id,
                dateMet: item.date_met,
                location: item.location_name,
                notes: item.notes,
                username: item.connected_user?.username,
                fullName: profile?.full_name || item.connected_user?.username || 'Unknown User',
                headline: profile?.headline,
                profilePicUrl: profile?.profile_pic_url
            }
        })

        // Search filtering (in-memory for V1 simplicity with joining)
        if (search) {
            const lowerSearch = search.toLowerCase()
            connections = connections.filter((c: any) =>
                (c.fullName && c.fullName.toLowerCase().includes(lowerSearch)) ||
                (c.location && c.location.toLowerCase().includes(lowerSearch)) ||
                (c.username && c.username.toLowerCase().includes(lowerSearch))
            )
        }

        // Handle name sorting manually if needed
        if (sort === 'name') {
            connections.sort((a: any, b: any) => {
                const nameA = (a.fullName || '').toLowerCase()
                const nameB = (b.fullName || '').toLowerCase()
                return order === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA)
            })
        }

        return NextResponse.json({ connections }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })
    } catch {
        console.error('Connections unavailable', { code: 'CONNECTION_READ_FAILED' })
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 503, headers: privateHeaders }
        )
    }
}

export const GET = withRuntimeGuard(handleGET)
