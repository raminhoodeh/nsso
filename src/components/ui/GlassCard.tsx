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
            className={`glass-style-card ${borderRadius} ${blendMode} ${shadowStyle} overflow-visible ${className}`}
            style={mergedStyle}
        >
            {/* Inner specular highlight for default variants */}
            {variant !== 'apple' && variant !== 'ultimate' && <div className="glass-specular" aria-hidden="true" />}

            {/* Apple Variant Depth Effect */}
            {variant === 'apple' && (
                <div
                    className="absolute inset-0 rounded-[inherit] pointer-events-none z-[5]"
                    style={{
                        border: '1px solid rgba(255, 255, 255, 0.18)',
                        boxShadow: `
                            inset 0 1px 1px 0 rgba(255, 255, 255, 0.25),
                            inset 0 -1px 1px 0 rgba(0, 0, 0, 0.1)
                        `,
                    }}
                    aria-hidden="true"
                />
            )}

            {/* Ultimate Glass System - All Advanced Techniques */}
            {variant === 'ultimate' && (
                <>
                    {/* Layer 1: Specular highlight gradient (light refraction) - Between ::after and .glass-specular */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none"
                        style={{
                            background: 'linear-gradient(165deg, rgba(255,255,255,0.35) 0%, transparent 40%, rgba(0,0,0,0.05) 100%)',
                            mixBlendMode: 'overlay',
                            zIndex: 2.1
                        }}
                        aria-hidden="true"
                    />

                    {/* Layer 2: Frosted noise texture */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none opacity-20"
                        style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E")`,
                            mixBlendMode: 'overlay',
                            zIndex: 2.2
                        }}
                        aria-hidden="true"
                    />

                    {/* Layer 3: Enhanced border with multi-directional lighting - Above content for crisp edges */}
                    <div
                        className="absolute inset-0 rounded-[inherit] pointer-events-none"
                        style={{
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            boxShadow: `
                                inset 0 1px 2px 0 rgba(255, 255, 255, 0.5),
                                inset 0 0.5px 0 0 rgba(255, 255, 255, 0.7),
                                inset 0 -1px 2px 0 rgba(0, 0, 0, 0.2),
                                0 2px 4px 0 rgba(0, 0, 0, 0.12),
                                0 8px 20px -4px rgba(0, 0, 0, 0.15)
                            `,
                            zIndex: 10
                        }}
                        aria-hidden="true"
                    />
                </>
            )}

            {/* Content container */}
            <div className="relative h-full w-full">
                {children}
            </div>
        </div>
    )
}
