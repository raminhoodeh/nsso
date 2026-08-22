'use client'

import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import FeedTab from '@/app/dashboard/components/FeedTab'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

export const dynamic = 'force-dynamic'

function NewsFeedContent() {
    return (
        <main className="min-h-screen pb-12">
            <Header />
            <div className="pt-[120px] px-6 lg:px-[165px] max-w-[1470px] mx-auto space-y-6">
                <FeedTab />
            </div>
        </main>
    )
}

export default function NewsFeedPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><TahoeGlassSurface variant="pill" tone="light" className="px-6 py-3" contentClassName="text-xl">Loading...</TahoeGlassSurface></div>}>
            <NewsFeedContent />
        </Suspense>
    )
}
