'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import Link from 'next/link'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface ReferredUser {
    full_name: string | null
    username: string | null
    status: string
    activated_at: string | null
}

export default function ReferralsTable() {
    const [referrals, setReferrals] = useState<ReferredUser[]>([])
    const [loading, setLoading] = useState(true)
    const supabase = createClient()

    useEffect(() => {
        const loadReferrals = async () => {
            const { data, error } = await supabase.rpc('get_referred_users_details')

            if (error) {
                console.error('Error fetching referrals:', error)
            } else if (data) {
                setReferrals(data as ReferredUser[])
            }
            setLoading(false)
        }

        loadReferrals()
    }, [supabase])

    if (loading) {
        return (
            <GlassCard className="p-6 lg:p-8 mt-6">
                <div className="text-white text-center py-8">Loading referred users...</div>
            </GlassCard>
        )
    }

    return (
        <GlassCard className="p-6 lg:p-8 mt-6">
            <h2 className="text-2xl font-bold text-white mb-2">Referral history</h2>
            <p className="text-white/70 mb-8">Previously recorded referrals. New subscription-based commissions are paused.</p>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left text-white/50 text-sm font-medium py-3 px-4">Full Name</th>
                            <th className="text-left text-white/50 text-sm font-medium py-3 px-4">nsso.me URL</th>
                            <th className="text-left text-white/50 text-sm font-medium py-3 px-4">Recorded status</th>
                            <th className="text-left text-white/50 text-sm font-medium py-3 px-4">Recorded activation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {referrals.map((user, index) => (
                            <tr key={index} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="py-4 px-4">
                                    <div className="text-white font-medium">
                                        <Link href={`/${user.username}`} target="_blank" className="hover:underline">
                                            {user.full_name || 'No name'}
                                        </Link>
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    {user.username ? (
                                        <Link href={`/${user.username}`} target="_blank" className="text-white/70 hover:text-white transition-colors">
                                            nsso.me/{user.username}
                                        </Link>
                                    ) : (
                                        <span className="text-white/30">No username</span>
                                    )}
                                </td>
                                <td className="py-4 px-4">
                                    <TahoeGlassSurface variant="pill" tone="light" className="px-2 py-1" contentClassName="text-white/80 text-xs font-medium">
                                        {user.status || 'Recorded'}
                                    </TahoeGlassSurface>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="text-white/80 text-sm">
                                        {user.activated_at
                                            ? new Date(user.activated_at).toLocaleDateString('en-GB', {
                                                day: 'numeric',
                                                month: 'short',
                                                year: 'numeric'
                                            })
                                            : '-'
                                        }
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {referrals.length === 0 && (
                <div className="text-center py-12 text-white/50">
                    No referral records yet.
                </div>
            )}
        </GlassCard>
    )
}
