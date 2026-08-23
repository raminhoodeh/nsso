'use client'

import { useState, useEffect } from 'react'
import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import { useToast } from '@/components/ui/Toast'
import { formatEarnings, type EarningsStats } from '@/lib/earnings'
import { useUI } from '@/components/providers/UIProvider'
import ReferralsTable from './ReferralsTable'
import Skeleton from '@/components/ui/Skeleton'
import { TahoeGlassButton, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface EarningsTabProps {
    initialData?: EarningsStats
}

export default function EarningsTab({ initialData }: EarningsTabProps) {
    const { showToast } = useToast()
    const { setBackgroundDimmed } = useUI()
    const [loading, setLoading] = useState(!initialData)
    const [stats, setStats] = useState<EarningsStats | null>(initialData || null)
    const [paypalSlug, setPaypalSlug] = useState(initialData?.paypalMeSlug || '')
    const [updating, setUpdating] = useState(false)

    // Handle background dimming when component mounts
    useEffect(() => {
        setBackgroundDimmed(true)
        return () => setBackgroundDimmed(false)
    }, [setBackgroundDimmed])

    // Load earnings stats
    useEffect(() => {
        if (initialData) return

        const loadStats = async () => {
            try {
                const response = await fetch('/api/earnings/stats')
                if (response.ok) {
                    const data = await response.json()
                    setStats(data)
                    setPaypalSlug(data.paypalMeSlug || '')
                } else {
                    showToast('Failed to load earnings data', 'error')
                }
            } catch (error) {
                console.error('Error loading earnings:', error)
                showToast('Failed to load earnings data', 'error')
            } finally {
                setLoading(false)
            }
        }

        loadStats()
    }, [initialData])

    const copyReferralCode = () => {
        if (stats?.referralCode) {
            navigator.clipboard.writeText(stats.referralCode)
            showToast('Referral code copied!', 'success')
        }
    }

    const updatePayPal = async () => {
        setUpdating(true)
        try {
            const response = await fetch('/api/earnings/paypal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paypalMeSlug: paypalSlug }),
            })

            if (response.ok) {
                showToast('PayPal information updated!', 'success')
                const statsResponse = await fetch('/api/earnings/stats')
                if (statsResponse.ok) {
                    const data = await statsResponse.json()
                    setStats(data)
                }
            } else {
                const error = await response.json()
                showToast(error.error || 'Failed to update PayPal information', 'error')
            }
        } catch (error) {
            console.error('Error updating PayPal:', error)
            showToast('Failed to update PayPal information', 'error')
        } finally {
            setUpdating(false)
        }
    }

    if (loading) {
        return (
            <GlassCard className="p-6 lg:p-8 relative pt-[48px]">
                <Skeleton className="h-8 w-64 mb-12 bg-white/10" />

                {/* Section 1 Skeleton */}
                <div className="mb-10 pb-10 border-b border-white/10">
                    <Skeleton className="h-6 w-48 mb-4 bg-white/10" />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Skeleton className="h-[200px] w-full rounded-2xl bg-white/5" />
                        <div className="space-y-4">
                            <Skeleton className="h-20 w-full rounded-xl bg-white/5" />
                            <div className="flex gap-3">
                                <Skeleton className="h-10 w-32 rounded-full bg-white/5" />
                                <Skeleton className="h-10 w-32 rounded-full bg-white/5" />
                            </div>
                        </div>
                    </div>
                </div>
            </GlassCard>
        )
    }

    return (
        <div className="space-y-6">
            <GlassCard refractive className="p-6 lg:p-8 relative pt-[48px]">
                <h2 className="text-2xl font-bold text-white mb-12 lg:mb-8">Referral & Payout Management</h2>

                {/* Section 1: Referral Identity */}
                <div className="mb-10 pb-10 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white mb-4">Your Referral Code</h3>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column: Referral Code Display with Copy Button */}
                        <div className="space-y-3">
                            <TahoeGlassSurface variant="recessed" radius={12} tone="light" className="h-[54px] max-w-md" contentClassName="flex h-full items-center">
                                    {/* Read-only code display */}
                                    <input
                                        type="text"
                                        value={stats?.referralCode || ''}
                                        readOnly
                                        className="flex-1 min-w-0 bg-transparent border-none outline-none text-[22px] font-medium text-white px-4 select-all cursor-pointer"
                                        style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
                                        onClick={copyReferralCode}
                                    />

                                    {/* Copy Button - Desktop Only */}
                                    <div className="mr-1.5 hidden md:block">
                                            <TahoeGlassButton
                                                onClick={copyReferralCode}
                                                className="h-[42px] w-[100px] p-0"
                                                contentClassName="text-white/95"
                                            >
                                                <span className="text-[16px] font-semibold tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>
                                                    Copy
                                                </span>
                                            </TahoeGlassButton>
                                    </div>
                            </TahoeGlassSurface>

                            {/* Mobile Copy Button */}
                            <div className="md:hidden w-full max-w-md">
                                    <TahoeGlassButton
                                        onClick={copyReferralCode}
                                        className="h-[42px] w-full p-0"
                                        contentClassName="text-white/95"
                                    >
                                        <span className="text-[16px] font-semibold tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>
                                            Copy
                                        </span>
                                    </TahoeGlassButton>
                            </div>

                            {/* Earnings Page Link */}
                            <p className="text-white/60 text-sm">
                                Check out our <a href="/earnings" target="_blank" rel="noopener noreferrer" className="text-white underline hover:no-underline">Earnings landing page</a> for more information
                            </p>
                        </div>

                        {/* Right Column: Annotation Text and Resource Links */}
                        <div className="space-y-4">
                            {/* Annotation Text */}
                            <p className="text-white/70 text-sm leading-relaxed">
                                Whenever users get their nsso.me/ domain and use this discount code, you receive <strong className="text-white">40%</strong> of their subscription fee, forever. Check out the below resources to learn how to pitch nsso.me/
                            </p>

                            {/* Resource Buttons */}
                            <div className="flex flex-wrap gap-3">
                                <TahoeGlassSurface
                                    as="a"
                                    variant="button"
                                    href="https://youtu.be/n9-WjzJlq-Q"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    tone="light"
                                    className="px-4 py-2"
                                    contentClassName="inline-flex items-center gap-2 text-white text-sm font-medium"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    Video Pitch
                                </TahoeGlassSurface>
                                <TahoeGlassSurface
                                    as="a"
                                    variant="button"
                                    href="https://docs.google.com/document/d/1qWvjW8vHbGdvdI33AwqB1dtAwyHlGA5Y/edit?usp=sharing&ouid=101610035816693766218&rtpof=true&sd=true"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    tone="light"
                                    className="px-4 py-2"
                                    contentClassName="inline-flex items-center gap-2 text-white text-sm font-medium"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    Pitch CONTEXT
                                </TahoeGlassSurface>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 2: Earnings Statistics */}
                <div className="mb-10 pb-10 border-b border-white/10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column: Total Users */}
                        <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" className="p-6">
                            <h4 className="text-white/60 text-sm font-medium uppercase tracking-wider mb-2">Total nsso.me/ users</h4>
                            <p className="text-4xl font-bold text-white">{stats?.activeReferrals || 0}</p>
                        </TahoeGlassSurface>

                        {/* Right Column: Expected Earnings */}
                        <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" className="p-6">
                            <h4 className="text-white/60 text-sm font-medium uppercase tracking-wider mb-2">Expected earnings in next payroll</h4>
                            <p className="text-4xl font-bold text-white">{formatEarnings(stats?.expectedEarnings || 0)}</p>
                        </TahoeGlassSurface>
                    </div>
                </div>

                {/* Section 3: Payout Destination */}
                <div>
                    <h3 className="text-xl font-bold text-white mb-4">PayPal Username</h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Input and Button */}
                        <div>
                            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-4">
                                <TahoeGlassSurface variant="recessed" radius={12} tone="light" className="h-[54px] w-full md:flex-1" contentClassName="flex h-full items-center px-4">
                                        {/* Prefix */}
                                        <span className="text-[22px] font-medium text-white/96 shrink-0" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                                            paypal.me/
                                        </span>

                                        {/* Input */}
                                        <input
                                            type="text"
                                            value={paypalSlug}
                                            onChange={(e) => setPaypalSlug(e.target.value)}
                                            placeholder="username"
                                            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[22px] font-medium text-white placeholder:text-white/50"
                                            style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
                                        />
                                </TahoeGlassSurface>

                                {/* UPDATE Button */}
                                    <TahoeGlassButton
                                        onClick={updatePayPal}
                                        disabled={updating}
                                        className="h-[54px] w-full px-5 md:w-[120px]"
                                        contentClassName="text-white/95"
                                    >
                                        <span className="text-[16px] font-semibold tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>
                                            {updating ? 'Updating...' : 'UPDATE'}
                                        </span>
                                    </TahoeGlassButton>
                            </div>
                        </div>

                        {/* Right: Explanatory Text */}
                        <div className="flex items-center">
                            <p className="text-white/70 text-sm leading-relaxed">
                                Go to <a href="https://www.paypal.me" target="_blank" rel="noopener noreferrer" className="text-white underline hover:no-underline">www.paypal.me</a> and click on "My PayPal Me" in the upper right corner. Log in with your account credentials. It will show you your paypal.me link there.
                            </p>
                        </div>
                    </div>
                </div>
            </GlassCard>

            <ReferralsTable />
        </div>
    )
}
