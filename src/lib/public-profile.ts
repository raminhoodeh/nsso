import 'server-only'
import { createPublicReadClient } from '@/lib/supabase/public'
import { createClient as createSessionClient } from '@/lib/supabase/server'
import { PRODUCT_CARD_SELECT } from '@/lib/payments/product-presentation'

export async function loadPublicProfileMetadata(username: string) {
    const client = createPublicReadClient()
    const { data: user } = await client.from('users').select('id').eq('username', username).single()
    if (!user) return null
    const { data: profile } = await client.from('profiles').select('full_name,headline').eq('user_id', user.id).single()
    return { user, profile }
}

export async function loadPublicProfile(username: string) {
    const client = createPublicReadClient()
    const { data: user, error } = await client.from('users').select('id,username,is_premium,created_at').eq('username', username).single()
    if (error || !user) return null
    const [profile, links, contacts, experiences, qualifications, projects, products] = await Promise.all([
        client.from('profiles').select('user_id,full_name,headline,bio,profile_pic_url').eq('user_id', user.id).single(),
        client.from('links').select('*').eq('user_id', user.id).order('display_order', { ascending: true }).order('created_at', { ascending: true }).order('id'),
        client.from('contacts').select('*').eq('user_id', user.id).order('display_order').order('created_at').order('id'),
        client.from('experiences').select('*').eq('user_id', user.id).order('display_order', { ascending: true }).order('start_year', { ascending: false }).order('id'),
        client.from('qualifications').select('*').eq('user_id', user.id).order('display_order', { ascending: true }).order('end_year', { ascending: false }).order('id'),
        client.from('projects').select('*').eq('user_id', user.id).order('display_order', { ascending: true }).order('created_at', { ascending: false }).order('id'),
        client.from('products').select(PRODUCT_CARD_SELECT).eq('user_id', user.id).order('display_order').order('created_at', { ascending: false }).order('id'),
    ])
    return { user, profile: profile.data, links: links.data ?? [], contacts: contacts.data ?? [], experiences: experiences.data ?? [], qualifications: qualifications.data ?? [], projects: projects.data ?? [], products: products.data ?? [] }
}

/** Viewer flags are optional; a broken Auth service must not hide public content. */
export async function loadPublicProfileViewer(profileUserId: string): Promise<{ viewer: { id: string } | null; connectionExists: boolean }> {
    const guest = { viewer: null, connectionExists: false }
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        const resolveViewer = async () => {
            const client = await createSessionClient({ timeoutMs: 2_000, signal: controller.signal })
            const { data: { user }, error } = await client.auth.getUser()
            if (controller.signal.aborted || error || !user) return guest
            const { data: connection } = await client.from('my_nsso').select('id').eq('user_id', user.id).eq('connected_user_id', profileUserId).maybeSingle()
            if (controller.signal.aborted) return guest
            return { viewer: { id: user.id }, connectionExists: Boolean(connection) }
        }
        // Auth's refresh backoff can outlive one fetch timeout. Bound the whole
        // optional lookup, abort its transport and consume any eventual result.
        return await Promise.race([resolveViewer(), new Promise<typeof guest>(resolve => {
            timer = setTimeout(() => { controller.abort(); resolve(guest) }, 2_000)
        })])
    } catch {
        return guest
    } finally {
        clearTimeout(timer)
    }
}
