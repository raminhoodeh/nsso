import { ReactNode } from 'react'

interface GlassCardProps {
    children: ReactNode
    className?: string
    variant?: 'default' | 'strong' | 'subtle' | 'apple'
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
        }
    }

    const mergedStyle = {
        ...variantStyles[variant],
        ...customStyle
    } as React.CSSProperties

    return (
        <div
            className={`glass-style-card ${variant === 'apple' ? 'rounded-[24px] [&::after]:mix-blend-screen shadow-none' : 'rounded-[40px]'} overflow-visible ${className}`}
            style={mergedStyle}
        >
            {/* Inner specular highlight for 3D effect */}
            <div className="glass-specular" aria-hidden="true" />

            {/* Content container */}
            <div className="relative h-full w-full">
                {children}
            </div>
        </div>
    )
}
