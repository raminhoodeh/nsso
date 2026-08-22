'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GlassCard from '@/components/ui/GlassCard'
import { TahoeGlassButton, TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { useToast } from '@/components/ui/Toast'
import type { User } from '@/lib/types'

interface UserWithProfile extends User {
    profiles: { full_name: string | null } | null
}

export default function AdminPage() {
    const router = useRouter()
    const supabase = createClient()
    const { showToast } = useToast()

    const [users, setUsers] = useState<UserWithProfile[]>([])
    const [loading, setLoading] = useState(true)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser()

            if (!authUser) {
                router.push('/sign-in')
                return
            }

            setCurrentUserId(authUser.id)

            // Check if current user is admin
            const { data: currentUserData } = await supabase
                .from('users')
                .select('user_type')
                .eq('id', authUser.id)
                .single()

            if (currentUserData?.user_type !== 'admin') {
                showToast('Access denied. Admin only.', 'error')
                router.push('/dashboard')
                return
            }

            // Load all users with their profiles
            const { data: usersData, error } = await supabase
                .from('users')
                .select(`
          *,
          profiles (full_name)
        `)
                .order('created_at', { ascending: false })

            if (error) {
                showToast('Failed to load users', 'error')
            } else if (usersData) {
                setUsers(usersData as UserWithProfile[])
            }

            setLoading(false)
        }

        loadData()
    }, [supabase, router, showToast])

    const toggleAdmin = async (userId: string, currentType: string) => {
        const newType = currentType === 'admin' ? 'standard' : 'admin'

        const { error } = await supabase
            .from('users')
            .update({ user_type: newType })
            .eq('id', userId)

        if (error) {
            showToast('Failed to update user', 'error')
        } else {
            setUsers(users.map(u =>
                u.id === userId ? { ...u, user_type: newType as 'standard' | 'admin' } : u
            ))
            showToast(`User ${newType === 'admin' ? 'promoted to' : 'removed from'} admin`, 'success')
        }
    }

    const togglePremium = async (userId: string, currentPremium: boolean) => {
        const { error } = await supabase
            .from('users')
            .update({ is_premium: !currentPremium })
            .eq('id', userId)

        if (error) {
            showToast('Failed to update user', 'error')
        } else {
            setUsers(users.map(u =>
                u.id === userId ? { ...u, is_premium: !currentPremium } : u
            ))
            showToast(`Premium ${!currentPremium ? 'granted' : 'revoked'}`, 'success')
        }
    }

    if (loading) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <TahoeGlassSurface variant="pill" tone="light" className="px-6 py-3" contentClassName="text-xl text-center">
                    All of you...<br />all in one place
                </TahoeGlassSurface>
            </main>
        )
    }

    return (
        <main className="min-h-screen pb-12">

            <div className="pt-[120px] px-6 lg:px-[165px] max-w-[1470px] mx-auto">
                <GlassCard className="p-6 lg:p-8">
                    <h1 className="text-3xl font-bold text-white mb-2">Administrative Overview</h1>
                    <p className="text-white/70 mb-8">Manage users and permissions</p>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <TahoeGlassSurface variant="card" radius={12} tone="light" className="p-4" contentClassName="text-center">
                            <div className="text-3xl font-bold text-white">{users.length}</div>
                            <div className="text-white/50 text-sm">Total Users</div>
                        </TahoeGlassSurface>
                        <TahoeGlassSurface variant="card" radius={12} tone="light" className="p-4" contentClassName="text-center">
                            <div className="text-3xl font-bold text-white">
                                {users.filter(u => u.is_premium).length}
                            </div>
                            <div className="text-white/50 text-sm">Premium</div>
                        </TahoeGlassSurface>
                        <TahoeGlassSurface variant="card" radius={12} tone="light" className="p-4" contentClassName="text-center">
                            <div className="text-3xl font-bold text-white">
                                {users.filter(u => u.user_type === 'admin').length}
                            </div>
                            <div className="text-white/50 text-sm">Admins</div>
                        </TahoeGlassSurface>
                        <TahoeGlassSurface variant="card" radius={12} tone="light" className="p-4" contentClassName="text-center">
                            <div className="text-3xl font-bold text-white">
                                {users.filter(u => !u.is_premium).length}
                            </div>
                            <div className="text-white/50 text-sm">Free Users</div>
                        </TahoeGlassSurface>
                    </div>

                    {/* User Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-white/10">
                                    <th className="text-left text-white/50 text-sm font-medium py-3 px-4">User Info</th>
                                    <th className="text-left text-white/50 text-sm font-medium py-3 px-4">Handle</th>
                                    <th className="text-left text-white/50 text-sm font-medium py-3 px-4">Status</th>
                                    <th className="text-center text-white/50 text-sm font-medium py-3 px-4">Make Admin</th>
                                    <th className="text-center text-white/50 text-sm font-medium py-3 px-4">Make Premium</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="py-4 px-4">
                                            <div className="text-white font-medium">
                                                {user.profiles?.full_name || 'No name'}
                                            </div>
                                            <div className="text-white/50 text-sm">{user.email}</div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <span className="text-white/70">nsso.me/{user.username}</span>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex gap-2">
                                                {user.user_type === 'admin' && (
                                                    <TahoeGlassSurface variant="pill" tone="light" className="px-2 py-1" contentClassName="text-purple-200 text-xs">
                                                        Admin
                                                    </TahoeGlassSurface>
                                                )}
                                                {user.is_premium ? (
                                                    <TahoeGlassSurface variant="pill" tone="light" className="px-2 py-1" contentClassName="text-yellow-200 text-xs">
                                                        Premium
                                                    </TahoeGlassSurface>
                                                ) : (
                                                    <TahoeGlassSurface variant="pill" tone="light" className="px-2 py-1" contentClassName="text-gray-200 text-xs">
                                                        Free
                                                    </TahoeGlassSurface>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex justify-center">
                                                <TahoeGlassButton
                                                    onClick={() => toggleAdmin(user.id, user.user_type)}
                                                    disabled={user.id === currentUserId}
                                                    role="switch"
                                                    aria-checked={user.user_type === 'admin'}
                                                    aria-label={`Administrator access for ${user.email}`}
                                                    semanticTint={user.user_type === 'admin' ? 'light' : 'dark'}
                                                    className="h-7 w-14 p-0"
                                                    contentClassName="relative block h-full w-full"
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        className={`
                              absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all
                              ${user.user_type === 'admin' ? 'left-8' : 'left-1'}
                            `}
                                                    />
                                                </TahoeGlassButton>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex justify-center">
                                                <TahoeGlassButton
                                                    onClick={() => togglePremium(user.id, user.is_premium)}
                                                    role="switch"
                                                    aria-checked={user.is_premium}
                                                    aria-label={`Premium access for ${user.email}`}
                                                    semanticTint={user.is_premium ? 'light' : 'dark'}
                                                    className="h-7 w-14 p-0"
                                                    contentClassName="relative block h-full w-full"
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        className={`
                              absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all
                              ${user.is_premium ? 'left-8' : 'left-1'}
                            `}
                                                    />
                                                </TahoeGlassButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {users.length === 0 && (
                        <div className="text-center py-12 text-white/50">
                            No users found.
                        </div>
                    )}
                </GlassCard>
            </div>
        </main>
    )
}
