'use client'

import { ReactNode } from 'react'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface CleanGlassCardProps {
    children: ReactNode
    className?: string
    style?: React.CSSProperties
}

/** Backwards-compatible clear card backed by the shared Tahoe refraction engine. */
export default function CleanGlassCard({
    children,
    className = '',
    style
}: CleanGlassCardProps) {
    return (
        <TahoeGlassSurface
            variant="card"
            radius={40}
            className={`group overflow-hidden ${className}`}
            contentClassName="h-full w-full"
            style={{ isolation: 'isolate', ...style }}
        >
            {children}
        </TahoeGlassSurface>
    )
}
