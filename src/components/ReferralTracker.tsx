'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function ReferralTrackerContent() {
    const searchParams = useSearchParams()

    useEffect(() => {
        const refCode = searchParams.get('ref')

        if (refCode) {
            // Store in cookie for 30 days
            const d = new Date()
            d.setTime(d.getTime() + (30 * 24 * 60 * 60 * 1000))
            const expires = "expires=" + d.toUTCString()

            document.cookie = `referral_code=${refCode}; ${expires}; path=/`

            // Console log for dev visibility
            console.log(`[ReferralTracker] Captured referral code: ${refCode}`)
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
