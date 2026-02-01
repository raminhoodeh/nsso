import { ReactNode } from 'react'

interface GlassCardProps {
    children: ReactNode
    className?: string
    variant?: 'default' | 'strong' | 'subtle' | 'apple' | 'ultimate'
    style?: React.CSSProperties
}

/**
 * Glassmorphic card component with blur and overlay effects
 * Implements the NSSO Liquid Glass design system
 */
export default function GlassCard({
    children,
    className = '',
    variant = 'default',
    style: customStyle
}: GlassCardProps) {
    // Map variants to CSS variables for the glass effect system
    // This preserves the darkness hierarchy while using the new liquid glass structure
    const variantStyles = {
        default: {
            '--glass-bg': 'rgba(0, 0, 0, 0.25)',
            '--glass-blur': '40px',
            '--glass-saturate': '100%',
            '--glass-brightness': '1.15'
        },
        strong: {
            '--glass-bg': 'rgba(0, 0, 0, 0.4)',
            '--glass-blur': '50px',
            '--glass-saturate': '105%',
            '--glass-brightness': '1.05'
        },
        subtle: {
            '--glass-bg': 'rgba(0, 0, 0, 0.15)',
            '--glass-blur': '30px',
            '--glass-saturate': '95%',
            '--glass-brightness': '1.2'
        },
        apple: {
            '--glass-bg': 'rgba(255, 255, 255, 0.01)', // Almost zero opacity to avoid grey cast
            '--glass-blur': '40px',
            '--glass-saturate': '200%', // High saturation for "Prism" effect
            '--glass-brightness': '1'
        },
        ultimate: {
            '--glass-bg': 'rgba(255, 255, 255, 0.01)', // Crystal clear base
            '--glass-blur': '40px',
            '--glass-saturate': '220%', // Extreme vibrancy
            '--glass-brightness': '1.1'
        }
    }

    const mergedStyle = {
        ...variantStyles[variant],
        ...customStyle
    } as React.CSSProperties

    const borderRadius = variant === 'apple' || variant === 'ultimate' ? 'rounded-[24px]' : 'rounded-[40px]'
    const blendMode = variant === 'apple' || variant === 'ultimate' ? '[&::after]:mix-blend-screen' : ''
    const shadowStyle = variant === 'apple' || variant === 'ultimate' ? 'shadow-none' : ''
    const cleanGlassClass = (variant === 'apple' || variant === 'ultimate') ? 'glass-clean' : ''

    return (
        <div
            className={`glass-style-card ${cleanGlassClass} ${variant === 'apple' ? 'rounded-[24px] [&::after]:mix-blend-normal shadow-lg' : 'rounded-[40px]'} overflow-visible ${className}`}
            style={{
                ...mergedStyle,
                // Force backdrop-filter directly for true saturation pulling
                // This overrides the globals.css split implementation for high-end variants
                ...((variant === 'apple' || variant === 'ultimate') && {
                    backdropFilter: `blur(${variant === 'apple' ? '40px' : '40px'}) saturate(${variant === 'ultimate' ? '220%' : '200%'})`,
                    WebkitBackdropFilter: `blur(${variant === 'apple' ? '40px' : '40px'}) saturate(${variant === 'ultimate' ? '220%' : '200%'})`
                })
            }}
        >
            {/* Inner specular highlight for default variants */}
            {variant !== 'apple' && variant !== 'ultimate' && <div className="glass-specular" aria-hidden="true" />}

            {/* Apple Variant Crystalline Border */}
            {variant === 'apple' && (
                <div
                    className="absolute inset-0 rounded-[24px] pointer-events-none"
                    style={{
                        padding: '1px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0) 100%)',
                        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        maskComposite: 'exclude',
                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        WebkitMaskComposite: 'xor',
                        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.15)', // Inner crystalline glow
                        zIndex: 50
                    }}
                    aria-hidden="true"
                />
            )}

            {/* Ultimate Glass System - Saturation & Vibrancy Mode */}
            {variant === 'ultimate' && (
                <>
                    {/* Layer 1: Specular highlight gradient (light refraction) */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0) 100%)',
                            mixBlendMode: 'overlay',
                            zIndex: 3
                        }}
                        aria-hidden="true"
                    />

                    {/* Layer 2: Subtle polished noise - reduced opacity for cleaner look */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none opacity-20"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.3'/%3E%3C/svg%3E")`,
                            mixBlendMode: 'overlay',
                            zIndex: 3
                        }}
                        aria-hidden="true"
                    />

                    {/* Layer 3: Enhanced border with multi-directional lighting */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none"
                        style={{
                            border: '1px solid rgba(255, 255, 255, 0.4)', // Higher contrast border
                            boxShadow: `
                                inset 0 0 20px 0 rgba(255,255,255,0.1), /* Inner glow */
                                inset 0 0 0 1px rgba(255,255,255,0.2) /* Sharp inner ring */
                            `,
                            zIndex: 50
                        }}
                        aria-hidden="true"
                    />
                </>
            )}

            {/* Content container - Higher z-index for ultimate variant */}
            <div className="relative h-full w-full" style={{ zIndex: variant === 'ultimate' ? 40 : 4 }}>
                {children}
            </div>
        </div>
    )
}
