/**
 * SVG Glass Distortion Filter
 * This component renders the SVG filter used for the Liquid Glass effect
 * Must be included once in the app (typically in layout.tsx)
 */
export default function GlassFilter() {
    return (
        <svg style={{ display: 'none' }} aria-hidden="true">
            <filter id="glass-distortion">
                <feTurbulence
                    type="turbulence"
                    baseFrequency="0.008"
                    numOctaves={2}
                    result="noise"
                />
                <feDisplacementMap
                    in="SourceGraphic"
                    in2="noise"
                    scale={77}
                />
            </filter>
        </svg>
    )
}
