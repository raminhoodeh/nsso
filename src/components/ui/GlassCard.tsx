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
            '--glass-bg': 'rgba(255, 255, 255, 0.07)',
            '--glass-blur': '30px',
            '--glass-saturate': '180%',
            '--glass-brightness': '1'
        },
        ultimate: {
            '--glass-bg': 'rgba(255, 255, 255, 0.07)',
            '--glass-blur': '40px',
            '--glass-saturate': '180%',
            '--glass-brightness': '1.05'
        }
    }

    const mergedStyle = {
        ...variantStyles[variant],
        ...customStyle
    } as React.CSSProperties

    const borderRadius = variant === 'apple' || variant === 'ultimate' ? 'rounded-[24px]' : 'rounded-[40px]'
    const blendMode = variant === 'apple' || variant === 'ultimate' ? '[&::after]:mix-blend-screen' : ''
    const shadowStyle = variant === 'apple' || variant === 'ultimate' ? 'shadow-none' : ''

    return (
        <div
            className={`glass-style-card ${variant === 'apple' ? 'rounded-[24px] [&::after]:mix-blend-normal shadow-lg' : 'rounded-[40px]'} overflow-visible ${className}`}
            style={mergedStyle}
        >
            {/* Inner specular highlight for default variants */}
            {variant !== 'apple' && variant !== 'ultimate' && <div className="glass-specular" aria-hidden="true" />}

            {/* Apple Variant Gradient Border - Enhanced for Visibility */}
            {variant === 'apple' && (
                <div
                    className="absolute inset-0 rounded-[24px] pointer-events-none"
                    style={{
                        padding: '1px',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 100%)',
                        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        maskComposite: 'exclude',
                        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                        WebkitMaskComposite: 'xor',
                        zIndex: 50
                    }}
                    aria-hidden="true"
                />
            )}

            {/* Ultimate Glass System - All Advanced Techniques */}
            {variant === 'ultimate' && (
                <>
                    {/* Layer 1: Specular highlight gradient (light refraction) - Above base glass */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none"
                        style={{
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.05) 40%, rgba(255,255,255,0) 100%)',
                            mixBlendMode: 'overlay',
                            zIndex: 3
                        }}
                        aria-hidden="true"
                    />

                    {/* Layer 2: Frosted noise texture - Boosted visibility */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none opacity-50"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.3'/%3E%3C/svg%3E")`,
                            mixBlendMode: 'overlay',
                            zIndex: 3
                        }}
                        aria-hidden="true"
                    />

                    {/* Layer 3: Enhanced border with multi-directional lighting - Above content for crisp edges */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none"
                        style={{
                            border: '1px solid rgba(255, 255, 255, 0.3)',
                            boxShadow: `
                                inset 0 1px 2px 0 rgba(255, 255, 255, 0.6),
                                inset 0 0.5px 0 0 rgba(255, 255, 255, 0.8),
                                inset 0 -1px 2px 0 rgba(0, 0, 0, 0.25),
                                0 2px 4px 0 rgba(0, 0, 0, 0.15),
                                0 8px 20px -4px rgba(0, 0, 0, 0.2)
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
