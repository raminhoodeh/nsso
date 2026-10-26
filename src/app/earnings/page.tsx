'use client'

import Link from 'next/link'
import Header from '@/components/layout/Header'
import GlassCard from '@/components/ui/GlassCard'
import { useUser } from '@/components/providers/UserProvider'

export default function EarningsPage() {
    const { user } = useUser()

    return (
        <main className="min-h-screen px-6 pb-20 pt-32">
            <Header />
            <div className="mx-auto max-w-3xl space-y-6">
                <GlassCard className="p-8 lg:p-12">
                    <h1 className="mb-4 text-3xl font-bold text-white lg:text-4xl">Referral earnings are paused</h1>
                    <p className="mb-4 text-lg leading-relaxed text-white/80">
                        Premium profile access is currently free. Paid subscriptions and new subscription-based referral commissions are paused.
                    </p>
                    <p className="mb-8 leading-relaxed text-white/70">
                        Your existing referral records and PayPal payout details remain available in your dashboard.
                    </p>
                    <Link
                        href={user ? '/dashboard?view=earnings' : '/sign-in'}
                        className="inline-flex min-h-11 items-center rounded-xl border border-white/20 bg-white/10 px-5 py-3 font-medium text-white transition-colors hover:bg-white/20"
                    >
                        {user ? 'View referral records and payout details' : 'Sign in to view your records'}
                    </Link>
                </GlassCard>
                <GlassCard className="p-8">
                    <h2 className="mb-3 text-xl font-bold text-white">Sell your products and services</h2>
                    <p className="mb-4 leading-relaxed text-white/70">
                        Add products, services, purchase links and PayPal buttons to your nsso profile. Creator payments remain available.
                    </p>
                    <Link href={user ? '/dashboard' : '/sign-up'} className="font-medium text-white underline hover:no-underline">
                        {user ? 'Edit your profile' : 'Create your free profile'}
                    </Link>
                </GlassCard>
            </div>
        </main>
    )
}
