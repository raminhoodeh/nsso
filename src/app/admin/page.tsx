'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import GlassCard from '@/components/ui/GlassCard'
import { TahoeGlassButton, TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { useToast } from '@/components/ui/Toast'
import type { User } from '@/lib/types'

interface UserWithProfile extends User {
    profiles: { full_name: string | null } | null
}

export default function AdminPage() {
    const router = useRouter()
    const { showToast } = useToast()

    const [users, setUsers] = useState<UserWithProfile[]>([])
    const [loading, setLoading] = useState(true)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    useEffect(() => {
        const loadData = async () => {
            try {
                let offset: number | null = 0
                const accounts: UserWithProfile[] = []
                while (offset !== null) {
                    const response: Response = await fetch(`/api/admin/users?offset=${offset}`, { cache: 'no-store' })
                    if (response.status === 401) { router.push('/sign-in'); return }
                    if (response.status === 403) { router.push('/dashboard'); return }
                    if (!response.ok) throw new Error('Accounts unavailable')
                    const page: { users: UserWithProfile[]; currentUserId: string; nextOffset: number | null } = await response.json()
                    accounts.push(...page.users)
                    setCurrentUserId(page.currentUserId)
                    offset = page.nextOffset
                }
                setUsers(accounts)
            } catch { showToast('Accounts could not be loaded. Please try again.', 'error') }

            setLoading(false)
        }

        loadData()
    }, [router, showToast])

    const changePermission = async (userId: string, permission: 'nsso:admin' | 'razinflix:manage', granted: boolean) => {
        try {
            const response = await fetch('/api/admin/users', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, permission, granted }),
            })
            const result = await response.json()
            if (!response.ok) throw new Error(result.error || 'Permission could not be saved.')
            setUsers(current => current.map(account => {
                if (account.id !== userId) return account
                const permissions = new Set(account.permissions || [])
                if (granted) permissions.add(permission)
                else permissions.delete(permission)
                return { ...account, permissions: [...permissions], user_type: permission === 'nsso:admin' ? (granted ? 'admin' : 'standard') : account.user_type }
            }))
            showToast('Permission saved.', 'success')
        } catch (error) { showToast(error instanceof Error ? error.message : 'Permission could not be saved.', 'error') }
    }
    const toggleAdmin = (userId: string, currentType: string) => changePermission(userId, 'nsso:admin', currentType !== 'admin')
    const toggleFilmEditor = (userId: string, granted: boolean) => changePermission(userId, 'razinflix:manage', !granted)

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
                    <p className="text-white/70 mb-8">Manage users and permissions. Premium access is free for everyone.</p>

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
                                {users.filter(u => u.permissions?.includes('razinflix:manage')).length}
                            </div>
                            <div className="text-white/50 text-sm">Film editors</div>
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
                                    <th className="text-center text-white/50 text-sm font-medium py-3 px-4">RazinFlix editor</th>
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
                                                    onClick={() => toggleFilmEditor(user.id, user.permissions?.includes('razinflix:manage') || false)}
                                                    role="switch"
                                                    aria-checked={user.permissions?.includes('razinflix:manage') || false}
                                                    aria-label={`RazinFlix editing for ${user.email}`}
                                                    semanticTint={user.permissions?.includes('razinflix:manage') ? 'light' : 'dark'}
                                                    className="h-7 w-14 p-0"
                                                    contentClassName="relative block h-full w-full"
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        className={`
                              absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-all
                              ${user.permissions?.includes('razinflix:manage') ? 'left-8' : 'left-1'}
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
