'use client'

import { type ButtonHTMLAttributes, type ReactNode } from 'react'
import GlassSurface, { type GlassSurfaceTone, type GlassSurfaceVariant } from '@/components/ui/glass/GlassSurface'
import { cn } from '@/lib/utils'

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode
    variant?: 'primary' | 'secondary' | 'ghost' | 'shiny'
    size?: 'sm' | 'md' | 'lg'
    fullWidth?: boolean
    radius?: string
}

interface ButtonRecipe {
    surface: GlassSurfaceVariant
    tone: GlassSurfaceTone
    distortionScale?: number
}

const BUTTON_RECIPES: Record<NonNullable<GlassButtonProps['variant']>, ButtonRecipe> = {
    primary: { surface: 'lens', tone: 'regular', distortionScale: 13 },
    secondary: { surface: 'panel', tone: 'regular' },
    ghost: { surface: 'recessed', tone: 'subtle' },
    shiny: { surface: 'lens', tone: 'strong', distortionScale: 15 }
}

/**
 * Native button semantics with the shared glass compositor. Only primary and
 * shiny buttons allocate a local displacement map.
 */
export default function GlassButton({
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    radius = '999px',
    className,
    disabled,
    ...props
}: GlassButtonProps) {
    const recipe = BUTTON_RECIPES[variant]
    const sizeStyles = {
        sm: 'px-4 py-2 text-[15px]',
        md: 'px-6 py-3 text-[17px]',
        lg: 'px-8 py-4 text-[19px]'
    }

    return (
        <GlassSurface
            as="button"
            variant={recipe.surface}
            tone={recipe.tone}
            interactive
            distortionScale={recipe.distortionScale}
            radius={radius}
            className={cn(
                'glass-button',
                `glass-button--${variant}`,
                'inline-flex items-center justify-center border-0 font-semibold text-white text-center cursor-pointer',
                sizeStyles[size],
                fullWidth && 'w-full',
                className
            )}
            disabled={disabled}
            {...props}
        >
            {variant === 'shiny' && (
                <span className="absolute inset-0 z-0 overflow-hidden rounded-[inherit] pointer-events-none" aria-hidden="true">
                    <span className="glass-button__shimmer absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/35 to-transparent animate-shimmer" />
                </span>
            )}

            <span className="relative z-10 flex items-center justify-center gap-2">
                {children}
            </span>
        </GlassSurface>
    )
}
