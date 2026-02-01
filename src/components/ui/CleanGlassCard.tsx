import { ReactNode } from 'react'

interface CleanGlassCardProps {
    children: ReactNode
    className?: string
    style?: React.CSSProperties
}

/**
 * CleanGlassCard - A "Clean Slate" implementation of the Ultimate Glass aesthetic.
 * 
 * Bypasses all legacy global CSS and SVG filters to ensure zero rendering artifacts.
 * Uses pure CSS for a high-performance, Apple-like glass effect.
 */
export default function CleanGlassCard({
    children,
    className = '',
    style: customStyle
}: CleanGlassCardProps) {
    return (
        <div
            className={`relative overflow-hidden ${className}`}
            style={{
                borderRadius: '40px', // Matches 'ultimate' variant
                backgroundColor: 'rgba(255, 255, 255, 0.01)', // Crystal clear base
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', // Deep shadow for depth
                border: '1px solid rgba(255, 255, 255, 0.15)', // Subtle crisp border
                ...customStyle
            }}
        >
            {/* 
              Layer 1: The Glass Physics 
              Applied directly to a dedicated background layer to avoid content clipping issues
            */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    borderRadius: 'inherit',
                    backdropFilter: 'blur(40px) saturate(220%)', // The "Prism" effect
                    WebkitBackdropFilter: 'blur(40px) saturate(220%)',
                    zIndex: 0
                }}
            />

            {/* 
              Layer 2: Gradient Sheen (Specular Highlight)
              Adds the premium "polished glass" look
            */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    borderRadius: 'inherit',
                    background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0) 40%, rgba(255, 255, 255, 0) 100%)',
                    mixBlendMode: 'overlay',
                    opacity: 0.8,
                    zIndex: 1
                }}
            />

            {/* 
              Layer 3: Inner Glow (Volume)
              Gives the card thickness and dimension
            */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    borderRadius: 'inherit',
                    boxShadow: 'inset 0 0 20px 0 rgba(255, 255, 255, 0.05), inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
                    zIndex: 1
                }}
            />

            {/* Content Container */}
            <div className="relative z-10 h-full w-full">
                {children}
            </div>
        </div>
    )
}
