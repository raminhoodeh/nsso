'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import GlassCard from '@/components/ui/GlassCard'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { GlassSwitch } from '@/components/ui/GlassSwitch'
import { useToast } from '@/components/ui/Toast'
import type { User } from '@/lib/types'
import { isAdminEmailEligible } from '@/lib/admin-access'

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
                    if (response.status === 403) { const denied = await response.json(); router.push(denied.code === 'mfa_required' ? '/dashboard/security?next=/admin' : '/dashboard'); return }
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
                <TahoeGlassSurface variant="pill" tone="dark" className="px-6 py-3" contentClassName="text-xl text-center">
                    All of you...<br />all in one place
                </TahoeGlassSurface>
            </main>
        )
    }

    return (
        <main className="min-h-screen pb-12 text-slate-950">

            <div className="pt-[120px] px-6 lg:px-[165px] max-w-[1470px] mx-auto">
                <GlassCard chromiumAppearance="light" materialFinish="satin" tone="dark" semanticTint="light" semanticTintOpacity={0.18} className="nsso-crystal-panel p-6 lg:p-8">
                    <h1 className="text-3xl font-bold text-slate-950 mb-2">Administrative Overview</h1>
                    <p className="text-slate-950 mb-8">Manage users and permissions. Premium access is free for everyone.</p>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="card" radius={12} tone="dark" semanticTint="light" semanticTintOpacity={0.18} className="nsso-crystal-panel p-4" contentClassName="text-center">
                            <div className="text-3xl font-bold text-slate-950">{users.length}</div>
                            <div className="text-slate-950 text-sm">Total Users</div>
                        </TahoeGlassSurface>
                        <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="card" radius={12} tone="dark" semanticTint="light" semanticTintOpacity={0.18} className="nsso-crystal-panel p-4" contentClassName="text-center">
                            <div className="text-3xl font-bold text-slate-950">
                                {users.filter(u => u.is_premium).length}
                            </div>
                            <div className="text-slate-950 text-sm">Premium</div>
                        </TahoeGlassSurface>
                        <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="card" radius={12} tone="dark" semanticTint="light" semanticTintOpacity={0.18} className="nsso-crystal-panel p-4" contentClassName="text-center">
                            <div className="text-3xl font-bold text-slate-950">
                                {users.filter(u => u.user_type === 'admin').length}
                            </div>
                            <div className="text-slate-950 text-sm">Admins</div>
                        </TahoeGlassSurface>
                        <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="card" radius={12} tone="dark" semanticTint="light" semanticTintOpacity={0.18} className="nsso-crystal-panel p-4" contentClassName="text-center">
                            <div className="text-3xl font-bold text-slate-950">
                                {users.filter(u => u.permissions?.includes('razinflix:manage')).length}
                            </div>
                            <div className="text-slate-950 text-sm">Film editors</div>
                        </TahoeGlassSurface>
                    </div>

                    {/* User Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-slate-500/20">
                                    <th className="text-left text-slate-950 text-sm font-medium py-3 px-4">User Info</th>
                                    <th className="text-left text-slate-950 text-sm font-medium py-3 px-4">Handle</th>
                                    <th className="text-left text-slate-950 text-sm font-medium py-3 px-4">Status</th>
                                    <th className="text-center text-slate-950 text-sm font-medium py-3 px-4">Make Admin</th>
                                    <th className="text-center text-slate-950 text-sm font-medium py-3 px-4">RazinFlix editor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => (
                                    <tr key={user.id} className="border-b border-slate-500/20 hover:bg-white/5">
                                        <td className="py-2 px-4">
                                            <div className="text-slate-950 font-medium">
                                                {user.profiles?.full_name || 'No name'}
                                            </div>
                                            <div className="text-slate-950 text-sm">{user.email}</div>
                                        </td>
                                        <td className="py-2 px-4">
                                            <span className="text-slate-950">nsso.me/{user.username}</span>
                                        </td>
                                        <td className="py-2 px-4">
                                            <div className="flex gap-2">
                                                {user.user_type === 'admin' && (
                                                    <TahoeGlassSurface variant="pill" tone="dark" className="px-2 py-1" contentClassName="text-purple-900 text-xs">
                                                        Admin
                                                    </TahoeGlassSurface>
                                                )}
                                                {user.is_premium ? (
                                                    <TahoeGlassSurface variant="pill" tone="dark" className="px-2 py-1" contentClassName="text-amber-900 text-xs">
                                                        Premium
                                                    </TahoeGlassSurface>
                                                ) : (
                                                    <TahoeGlassSurface variant="pill" tone="dark" className="px-2 py-1" contentClassName="text-slate-950 text-xs">
                                                        Free
                                                    </TahoeGlassSurface>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-2 px-4">
                                            <div className="flex justify-center">
                                                <GlassSwitch
                                                    onClick={() => toggleAdmin(user.id, user.user_type)}
                                                    disabled={user.id === currentUserId || (user.user_type !== 'admin' && !isAdminEmailEligible(user.email))}
                                                    title={!isAdminEmailEligible(user.email) && user.user_type !== 'admin' ? 'Administrator access is limited to the approved email addresses.' : undefined}
                                                    checked={user.user_type === 'admin'}
                                                    aria-label={`Administrator access for ${user.email}`}
                                                />
                                            </div>
                                        </td>
                                        <td className="py-2 px-4">
                                            <div className="flex justify-center">
                                                <GlassSwitch
                                                    onClick={() => toggleFilmEditor(user.id, user.permissions?.includes('razinflix:manage') || false)}
                                                    checked={user.permissions?.includes('razinflix:manage') || false}
                                                    aria-label={`RazinFlix editing for ${user.email}`}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {users.length === 0 && (
                        <div className="text-center py-12 text-slate-950">
                            No users found.
                        </div>
                    )}
                </GlassCard>
            </div>
        </main>
    )
}
