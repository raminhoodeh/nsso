import { TahoeBackdropSurface, type TahoeBackdropSurfaceProps } from '@/components/ui/tahoe-glass'

type LightGlassPanelProps = Omit<TahoeBackdropSurfaceProps,
    'variant' | 'radius' | 'tone' | 'semanticTint' | 'semanticTintOpacity' | 'displacementProfile' | 'materialLighting'>

/** Sign-in's light material and dark content are the account-entry visual contract. */
export default function LightGlassPanel({ children, ...props }: LightGlassPanelProps) {
    return (
        <TahoeBackdropSurface
            {...props}
            variant="card"
            radius={40}
            tone="dark"
            displacementProfile="prism-top"
            materialLighting="uniform"
            data-light-glass-panel="true"
        >
            {children}
        </TahoeBackdropSurface>
    )
}
