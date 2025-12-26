'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import GlassCard from '@/components/ui/GlassCard'
import Link from 'next/link'

interface ReferredUser {
    full_name: string | null
    username: string | null
    status: string
    activated_at: string | null
    is_premium: boolean
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

    // Helper to calculate total value
    const calculateTotalValue = (activatedAt: string | null) => {
        if (!activatedAt) return '£0.00';

        const start = new Date(activatedAt);
        const now = new Date();

        // Calculate difference in months
        let months = (now.getFullYear() - start.getFullYear()) * 12;
        months -= start.getMonth();
        months += now.getMonth();

        // Ensure at least 1 month if it's the current month, assuming upfront payment
        // Adjust logic: if active, count current month.
        // Or if strictly time based:
        if (months <= 0) months = 1;

        // Value = Months * £8.00 * 40% = Months * £3.20
        const value = months * 3.20;

        return new Intl.NumberFormat('en-GB', {
            style: 'currency',
            currency: 'GBP'
        }).format(value);
    }

    if (loading) {
        return (
            <GlassCard className="p-6 lg:p-8 mt-6">
                <div className="text-white text-center py-8">Loading referred users...</div>
            </GlassCard>
        )
    }

    return (
        <GlassCard className="p-6 lg:p-8 mt-6">
            <h2 className="text-2xl font-bold text-white mb-2">Referred Users</h2>
            <p className="text-white/70 mb-8">Track your referrals and earnings history</p>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="text-left text-white/50 text-sm font-medium py-3 px-4">Full Name</th>
                            <th className="text-left text-white/50 text-sm font-medium py-3 px-4">nsso.me URL</th>
                            <th className="text-left text-white/50 text-sm font-medium py-3 px-4">Status</th>
                            <th className="text-left text-white/50 text-sm font-medium py-3 px-4">Sign-up Date</th>
                            <th className="text-right text-white/50 text-sm font-medium py-3 px-4">Total Value</th>
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
                                    {user.is_premium ? (
                                        <span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-300 text-xs font-medium">
                                            Active
                                        </span>
                                    ) : (
                                        <span className="px-2 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-medium">
                                            Inactive
                                        </span>
                                    )}
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
                                <td className="py-4 px-4 text-right">
                                    <div className="text-green-400 font-medium font-mono">
                                        {calculateTotalValue(user.activated_at)}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {referrals.length === 0 && (
                <div className="text-center py-12 text-white/50">
                    No referred users yet. Share your code to start earning!
                </div>
            )}
        </GlassCard>
    )
}
