import { ReactNode } from 'react'
import { TahoeGlassSurface, type TahoeGlassSurfaceVariant } from '@/components/ui/tahoe-glass'

interface GlassCardProps {
    children: ReactNode
    className?: string
    variant?: 'default' | 'strong' | 'subtle' | 'apple' | 'ultimate'
    style?: React.CSSProperties
}

const VARIANT_SURFACE: Record<NonNullable<GlassCardProps['variant']>, TahoeGlassSurfaceVariant> = {
    default: 'card',
    strong: 'panel',
    subtle: 'card',
    apple: 'card',
    ultimate: 'panel'
}

/** Backwards-compatible card API backed by the shared Tahoe refraction engine. */
export default function GlassCard({
    children,
    className = '',
    variant = 'default',
    style
}: GlassCardProps) {
    const radius = variant === 'apple' || variant === 'ultimate' ? 24 : 40

    return (
        <TahoeGlassSurface
            variant={VARIANT_SURFACE[variant]}
            radius={radius}
            className={`overflow-visible ${className}`}
            contentClassName="h-full w-full"
            style={style}
        >
            {children}
        </TahoeGlassSurface>
    )
}
