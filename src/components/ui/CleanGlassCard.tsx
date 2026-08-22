'use client'

import { ReactNode } from 'react'

interface CleanGlassCardProps {
    children: ReactNode
    className?: string
    style?: React.CSSProperties
}

/**
 * CleanGlassCard - Rebuilt for maximum reliability and visual fidelity.
 * Uses the global SVG-based Liquid Glass distortion system.
 */
export default function CleanGlassCard({
    children,
    className = '',
    style: customStyle
}: CleanGlassCardProps) {
    return (
        <div
            className={`
                relative 
                overflow-hidden 
                rounded-[40px] 
                bg-black/20 
                border-x border-b border-white/10 
                shadow-2xl 
                glass-style-card 
                glass-distortion-active 
                group
                ${className}
            `}
            style={{
                isolation: 'isolate',
                ['--glass-buffer' as any]: '-60px',
                ...customStyle
            }}
        >
            {/* 1. Specular highlight (Design System) */}
            <div className="glass-specular opacity-40 group-hover:opacity-60 transition-opacity" aria-hidden="true" />

            {/* 2. Content Container */}
            <div className="relative z-10 h-full w-full">
                {children}
            </div>

        </div>
    )
}
