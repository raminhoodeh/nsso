'use client'

import { usePathname } from 'next/navigation'
import NSSOAgent from '@/components/agent/NSSOAgent'

export default function ConditionalNSSOAgent() {
    const pathname = usePathname()

    // Don't show agent pill on these pages
    const hideOnPaths = ['/sign-in', '/sign-up', '/agent']
    const shouldHide = hideOnPaths.some(path => pathname === path)

    if (shouldHide) return null

    return <NSSOAgent />
}
