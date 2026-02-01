'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GlassCard from '@/components/ui/GlassCard'
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
                <div className="text-white text-xl text-center">
                    All of you...<br />all in one place
                </div>
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
                        <div className="bg-white/10 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-white">{users.length}</div>
                            <div className="text-white/50 text-sm">Total Users</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-white">
                                {users.filter(u => u.is_premium).length}
                            </div>
                            <div className="text-white/50 text-sm">Premium</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-white">
                                {users.filter(u => u.user_type === 'admin').length}
                            </div>
                            <div className="text-white/50 text-sm">Admins</div>
                        </div>
                        <div className="bg-white/10 rounded-xl p-4 text-center">
                            <div className="text-3xl font-bold text-white">
                                {users.filter(u => !u.is_premium).length}
                            </div>
                            <div className="text-white/50 text-sm">Free Users</div>
                        </div>
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
                                                    <span className="px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs">
                                                        Admin
                                                    </span>
                                                )}
                                                {user.is_premium ? (
                                                    <span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300 text-xs">
                                                        Premium
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 rounded-full bg-gray-500/20 text-gray-300 text-xs">
                                                        Free
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex justify-center">
                                                <button
                                                    onClick={() => toggleAdmin(user.id, user.user_type)}
                                                    disabled={user.id === currentUserId}
                                                    className={`
                            w-12 h-6 rounded-full transition-all
                            ${user.user_type === 'admin'
                                                            ? 'bg-purple-500'
                                                            : 'bg-white/20'
                                                        }
                            ${user.id === currentUserId
                                                            ? 'opacity-50 cursor-not-allowed'
                                                            : 'cursor-pointer hover:opacity-80'
                                                        }
                            relative
                          `}
                                                >
                                                    <div
                                                        className={`
                              absolute top-1 w-4 h-4 rounded-full bg-white transition-all
                              ${user.user_type === 'admin' ? 'left-7' : 'left-1'}
                            `}
                                                    />
                                                </button>
                                            </div>
                                        </td>
                                        <td className="py-4 px-4">
                                            <div className="flex justify-center">
                                                <button
                                                    onClick={() => togglePremium(user.id, user.is_premium)}
                                                    className={`
                            w-12 h-6 rounded-full transition-all cursor-pointer hover:opacity-80
                            ${user.is_premium
                                                            ? 'bg-yellow-500'
                                                            : 'bg-white/20'
                                                        }
                            relative
                          `}
                                                >
                                                    <div
                                                        className={`
                              absolute top-1 w-4 h-4 rounded-full bg-white transition-all
                              ${user.is_premium ? 'left-7' : 'left-1'}
                            `}
                                                    />
                                                </button>
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
