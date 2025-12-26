'use client'

import { useState, useEffect } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import { useToast } from '@/components/ui/Toast'
import { formatEarnings, type EarningsStats } from '@/lib/earnings'
import { useUI } from '@/components/providers/UIProvider'
import ReferralsTable from './ReferralsTable'

export default function EarningsTab() {
    const { showToast } = useToast()
    const { setBackgroundDimmed } = useUI()
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState<EarningsStats | null>(null)
    const [paypalSlug, setPaypalSlug] = useState('')
    const [updating, setUpdating] = useState(false)

    // Handle background dimming when component mounts
    useEffect(() => {
        setBackgroundDimmed(true)
        return () => setBackgroundDimmed(false)
    }, [setBackgroundDimmed])

    // Load earnings stats
    useEffect(() => {
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
    }, [])

    // Copy referral code to clipboard
    const copyReferralCode = () => {
        if (stats?.referralCode) {
            navigator.clipboard.writeText(stats.referralCode)
            showToast('Referral code copied!', 'success')
        }
    }

    // Update PayPal slug
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
                // Refresh stats
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
            <GlassCard className="p-6 lg:p-8">
                <div className="text-white text-center py-12">Loading earnings data...</div>
            </GlassCard>
        )
    }

    return (
        <div className="space-y-6">
            <GlassCard className="p-6 lg:p-8">
                <h2 className="text-2xl font-bold text-white mb-8">Referral & Payout Management</h2>

                {/* Section 1: Referral Identity */}
                <div className="mb-10 pb-10 border-b border-white/10">
                    <h3 className="text-xl font-bold text-white mb-4">Your Referral Code</h3>

                    {/* Two-column layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left Column: Referral Code Display with Copy Button */}
                        <div className="space-y-3">
                            <div className="relative flex-1 max-w-md h-[54px]">
                                <div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                                    {/* Glassmorphic background */}
                                    <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                                    <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />

                                    {/* Read-only code display */}
                                    <input
                                        type="text"
                                        value={stats?.referralCode || ''}
                                        readOnly
                                        className="relative z-10 flex-1 bg-transparent border-none outline-none text-[22px] font-medium text-white px-4 select-all cursor-pointer"
                                        style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
                                        onClick={copyReferralCode}
                                    />

                                    {/* Copy Button - Desktop Only */}
                                    <div className="relative z-10 mr-1.5 hidden md:block">
                                        <div className="p-[0.75px] rounded-[12px]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)' }}>
                                            <button
                                                onClick={copyReferralCode}
                                                className="relative h-[42px] w-[100px] rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                                                style={{ boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)' }}
                                            >
                                                <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" />
                                                <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" />
                                                <span className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>
                                                    Copy
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Inset shadow */}
                                    <div className="absolute inset-0 pointer-events-none rounded-[12px]" style={{ boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)' }} />
                                </div>
                            </div>

                            {/* Mobile Copy Button */}
                            <div className="md:hidden w-full max-w-md">
                                <div className="p-[0.75px] rounded-[12px]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)' }}>
                                    <button
                                        onClick={copyReferralCode}
                                        className="relative h-[42px] w-full rounded-[12px] flex items-center justify-center transition-all active:scale-[0.98]"
                                        style={{ boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)' }}
                                    >
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" />
                                        <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" />
                                        <span className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>
                                            Copy
                                        </span>
                                    </button>
                                </div>
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
                                <a
                                    href="https://youtu.be/n9-WjzJlq-Q"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    Video Pitch
                                </a>
                                <a
                                    href="https://docs.google.com/document/d/1qWvjW8vHbGdvdI33AwqB1dtAwyHlGA5Y/edit?usp=sharing&ouid=101610035816693766218&rtpof=true&sd=true"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-medium transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    Pitch CONTEXT
                                </a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Section 2: Earnings Statistics */}
                <div className="mb-10 pb-10 border-b border-white/10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Left Column: Total Users */}
                        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                            <h4 className="text-white/60 text-sm font-medium uppercase tracking-wider mb-2">Total nsso.me/ users</h4>
                            <p className="text-4xl font-bold text-white">{stats?.activeReferrals || 0}</p>
                        </div>

                        {/* Right Column: Expected Earnings */}
                        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
                            <h4 className="text-white/60 text-sm font-medium uppercase tracking-wider mb-2">Expected earnings in next payroll</h4>
                            <p className="text-4xl font-bold text-white">{formatEarnings(stats?.expectedEarnings || 0)}</p>
                        </div>
                    </div>
                </div>

                {/* Section 3: Payout Destination */}
                <div>
                    <h3 className="text-xl font-bold text-white mb-4">PayPal Username</h3>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left: Input and Button */}
                        <div>
                            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-4">
                                <div className="relative w-full md:flex-1 h-[54px]">
                                    <div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                                        {/* Glassmorphic background */}
                                        <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />

                                        {/* Siri gradient background image */}
                                        <div
                                            className="absolute inset-0 opacity-40 rounded-[12px]"
                                            style={{
                                                backgroundImage: 'url(/siri-gradient.png)',
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center'
                                            }}
                                        />

                                        {/* Prefix */}
                                        <span className="relative z-10 text-[22px] font-medium text-white/96 shrink-0 pl-4" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                                            paypal.me/
                                        </span>

                                        {/* Input */}
                                        <input
                                            type="text"
                                            value={paypalSlug}
                                            onChange={(e) => setPaypalSlug(e.target.value)}
                                            placeholder="username"
                                            className="relative z-10 flex-1 bg-transparent border-none outline-none text-[22px] font-medium text-white placeholder:text-white placeholder:opacity-100 min-w-0"
                                            style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
                                        />

                                        {/* Inset shadow */}
                                        <div className="absolute inset-0 pointer-events-none rounded-[12px]" style={{ boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)' }} />
                                    </div>
                                </div>

                                {/* UPDATE Button */}
                                <div className="p-[0.75px] rounded-[12px]" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)' }}>
                                    <button
                                        onClick={updatePayPal}
                                        disabled={updating}
                                        className="relative h-[54px] w-full md:w-[120px] rounded-[12px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
                                        style={{ boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)' }}
                                    >
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" />
                                        <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" />
                                        <span className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 590 }}>
                                            {updating ? 'Updating...' : 'UPDATE'}
                                        </span>
                                    </button>
                                </div>
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
