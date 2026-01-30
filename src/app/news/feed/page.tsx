'use client'

import { Suspense } from 'react'
import Header from '@/components/layout/Header'
import FeedTab from '@/app/dashboard/components/FeedTab'

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
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>}>
            <NewsFeedContent />
        </Suspense>
    )
}
