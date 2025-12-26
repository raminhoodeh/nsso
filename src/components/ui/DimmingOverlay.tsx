'use client'

import { useUI } from '@/components/providers/UIProvider'

export default function DimmingOverlay() {
    const { isBackgroundDimmed } = useUI()

    return (
        <div
            className={`fixed inset-0 pointer-events-none transition-opacity duration-500 ease-in-out z-0 ${isBackgroundDimmed ? 'opacity-100 bg-black/60' : 'opacity-0'
                }`}
        />
    )
}
