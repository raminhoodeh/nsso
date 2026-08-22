'use client'

import { type CSSProperties, type ReactNode } from 'react'
import GlassSurface from '@/components/ui/glass/GlassSurface'
import { cn } from '@/lib/utils'

interface CleanGlassCardProps {
    children: ReactNode
    className?: string
    style?: CSSProperties
    surface?: 'panel' | 'lens'
}

/**
 * Homepage-compatible adapter. Panel is the quiet default; lens is reserved
 * for the single high-salience hero surface.
 */
export default function CleanGlassCard({
    children,
    className,
    style,
    surface = 'panel'
}: CleanGlassCardProps) {
    return (
        <GlassSurface
            variant={surface}
            tone="regular"
            radius="40px"
            distortionScale={22}
            className={cn('overflow-hidden border-x border-b border-white/10 group', className)}
            style={style}
        >
            {children}
        </GlassSurface>
    )
}
