'use client'

import { type CSSProperties, type ReactNode } from 'react'
import GlassSurface, { type GlassSurfaceTone, type GlassSurfaceVariant } from '@/components/ui/glass/GlassSurface'
import { cn } from '@/lib/utils'

interface GlassCardProps {
    children: ReactNode
    className?: string
    variant?: 'default' | 'strong' | 'subtle' | 'apple' | 'ultimate'
    style?: CSSProperties
    radius?: string
}

interface CardRecipe {
    surface: GlassSurfaceVariant
    tone: GlassSurfaceTone
    radius: string
    distortionScale?: number
}

const CARD_RECIPES: Record<NonNullable<GlassCardProps['variant']>, CardRecipe> = {
    default: { surface: 'panel', tone: 'regular', radius: '40px' },
    strong: { surface: 'panel', tone: 'strong', radius: '40px' },
    subtle: { surface: 'panel', tone: 'subtle', radius: '40px' },
    apple: { surface: 'lens', tone: 'regular', radius: '24px', distortionScale: 18 },
    ultimate: { surface: 'lens', tone: 'strong', radius: '40px', distortionScale: 22 }
}

/**
 * Backwards-compatible card adapter for the Tahoe V3 material system.
 * Every recipe uses the shared material; Apple and Ultimate use the stronger lens profile.
 */
export default function GlassCard({
    children,
    className,
    variant = 'default',
    style,
    radius
}: GlassCardProps) {
    const recipe = CARD_RECIPES[variant]

    return (
        <GlassSurface
            variant={recipe.surface}
            tone={recipe.tone}
            radius={radius ?? recipe.radius}
            distortionScale={recipe.distortionScale}
            className={cn('overflow-visible', className)}
            style={style}
        >
            {children}
        </GlassSurface>
    )
}
