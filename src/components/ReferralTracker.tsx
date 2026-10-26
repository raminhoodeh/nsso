'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ReferralTrackerContent() {
    const searchParams = useSearchParams()

    useEffect(() => {
        const refCode = searchParams.get('ref')

        if (refCode && /^[A-Za-z0-9_-]{1,64}$/.test(refCode)) {
            // Store in cookie for 30 days
            const d = new Date()
            d.setTime(d.getTime() + (30 * 24 * 60 * 60 * 1000))
            const expires = "expires=" + d.toUTCString()

            document.cookie = `referral_code=${encodeURIComponent(refCode)}; ${expires}; path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`

        }
    }, [searchParams])

    return null
}

export default function ReferralTracker() {
    return (
        <Suspense fallback={null}>
            <ReferralTrackerContent />
        </Suspense>
    )
}
