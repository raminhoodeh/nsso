/**
 * SVG Glass Distortion Filter
 * This component renders the SVG filter used for the Liquid Glass effect
 * Must be included once in the app (typically in layout.tsx)
 */
export default function GlassFilter() {
    return (
        <svg
            style={{
                position: 'absolute',
                width: 0,
                height: 0,
                overflow: 'hidden',
                pointerEvents: 'none'
            }}
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
        >
            <filter id="glass-distortion" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
                <feTurbulence
                    type="turbulence"
                    baseFrequency="0.008"
                    numOctaves={1}
                    result="noise"
                />
                <feDisplacementMap
                    in="SourceGraphic"
                    in2="noise"
                    scale={77}
                    xChannelSelector="R"
                    yChannelSelector="G"
                />
            </filter>
        </svg>
    )
}
