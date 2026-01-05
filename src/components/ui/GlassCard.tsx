import { ReactNode } from 'react'

interface GlassCardProps {
    children: ReactNode
    className?: string
    variant?: 'default' | 'strong' | 'subtle'
}

/**
 * Glassmorphic card component with blur and overlay effects
 * Implements the NSSO Liquid Glass design system
 */
export default function GlassCard({
    children,
    className = '',
    variant = 'default'
}: GlassCardProps) {
    // Map variants to CSS variables for the glass effect system
    // This preserves the darkness hierarchy while using the new liquid glass structure
    const variantStyles = {
        default: {
            '--glass-bg': 'rgba(128, 128, 128, 0.25)',
            '--glass-blur': '40px',
            '--glass-saturate': '100%',
            '--glass-brightness': '1.05'
        },
        strong: {
            '--glass-bg': 'rgba(128, 128, 128, 0.4)',
            '--glass-blur': '50px',
            '--glass-saturate': '105%',
            '--glass-brightness': '1'
        },
        subtle: {
            '--glass-bg': 'rgba(128, 128, 128, 0.15)',
            '--glass-blur': '30px',
            '--glass-saturate': '95%',
            '--glass-brightness': '1.1'
        }
    }

    const style = variantStyles[variant] as React.CSSProperties

    return (
        <div
            className={`glass-style-card overflow-visible ${className}`}
            style={style}
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
