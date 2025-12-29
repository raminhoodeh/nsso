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
    const variantStyles = {
        default: 'bg-[rgba(128,128,128,0.25)]',
        strong: 'bg-[rgba(128,128,128,0.4)]',
        subtle: 'bg-[rgba(128,128,128,0.15)]'
    }

    return (
        <div
            className={`
        relative rounded-[24px] overflow-hidden isolate flex flex-col
        ${className}
      `}
        >
            {/* Backdrop blur layer */}
            <div
                className="absolute inset-0 pointer-events-none rounded-[inherit]"
                style={{ backdropFilter: 'blur(40px)' }}
                aria-hidden="true"
            />

            {/* Background layer */}
            <div
                className={`absolute inset-0 pointer-events-none rounded-[inherit] ${variantStyles[variant]}`}
                aria-hidden="true"
            />

            {/* Inner shadow/highlight layer */}
            <div
                className="absolute inset-0 pointer-events-none rounded-[inherit]"
                style={{
                    boxShadow: `
            inset 0px -0.5px 1px 0px rgba(255, 255, 255, 0.3),
            inset 0px -0.5px 1px 0px rgba(255, 255, 255, 0.25),
            inset 1px 1.5px 4px 0px rgba(0, 0, 0, 0.08)
          `
                }}
                aria-hidden="true"
            />

            {/* Content */}
            <div className="relative z-10 h-full w-full">
                {children}
            </div>
        </div>
    )
}
