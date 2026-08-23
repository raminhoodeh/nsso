import GlassCard, { type GlassCardProps } from '@/components/ui/GlassCard'

export default function ProfileGlassCard({
    semanticTint = 'dark',
    semanticTintOpacity = 0.38,
    tone = 'light',
    ...props
}: GlassCardProps) {
    return (
        <GlassCard
            {...props}
            tone={tone}
            semanticTint={semanticTint}
            semanticTintOpacity={semanticTintOpacity}
        />
    )
}
