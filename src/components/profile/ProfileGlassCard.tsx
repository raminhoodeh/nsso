import GlassCard, { type GlassCardProps } from '@/components/ui/GlassCard'

export default function ProfileGlassCard({
    semanticTint = 'light',
    semanticTintOpacity = 0.18,
    tone = 'dark',
    chromiumAppearance = 'light',
    materialFinish = 'satin',
    className = '',
    ...props
}: GlassCardProps) {
    return (
        <GlassCard
            {...props}
            className={`nsso-crystal-panel ${className}`}
            tone={tone}
            chromiumAppearance={chromiumAppearance}
            materialFinish={materialFinish}
            semanticTint={semanticTint}
            semanticTintOpacity={semanticTintOpacity}
        />
    )
}
