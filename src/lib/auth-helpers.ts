import type { SupabaseClient, User } from '@supabase/supabase-js'

/** Repair only the verified caller; never accept browser metadata as account authority. */
export async function restoreUser(supabase: SupabaseClient, _user: User) {
    const { error } = await supabase.rpc('ensure_current_account')
    if (error) throw new Error('Your account could not be prepared. Please try again.')
}
