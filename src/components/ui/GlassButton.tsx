import { ButtonHTMLAttributes, ReactNode } from 'react'

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode
    variant?: 'primary' | 'secondary' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    fullWidth?: boolean
}

/**
 * Glassmorphic button component
 * Implements NSSO button design from Figma
 */
export default function GlassButton({
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    className = '',
    disabled = false,
    ...props
}: GlassButtonProps) {
    const sizeStyles = {
        sm: 'px-4 py-2 text-[15px]',
        md: 'px-6 py-3 text-[17px]',
        lg: 'px-8 py-4 text-[19px]'
    }

    const variantStyles = {
        primary: `
      bg-[rgba(255,255,255,0.15)]
      hover:bg-[rgba(255,255,255,0.25)]
      active:bg-[rgba(255,255,255,0.1)]
    `,
        secondary: `
      bg-transparent
      border border-[rgba(255,255,255,0.3)]
      hover:border-[rgba(255,255,255,0.5)]
      hover:bg-[rgba(255,255,255,0.1)]
    `,
        ghost: `
      bg-transparent
      hover:bg-[rgba(255,255,255,0.1)]
    `
    }

    return (
        <button
            className={`
        relative rounded-full overflow-hidden isolate
        font-semibold text-white text-center
        transition-all duration-200 ease-out
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeStyles[size]}
        ${variantStyles[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
            style={{ backdropFilter: 'blur(10px)' }}
            disabled={disabled}
            {...props}
        >
            {/* Lighten layer */}
            <div
                className="absolute inset-0 pointer-events-none rounded-[inherit] bg-[rgba(255,255,255,0.06)] mix-blend-lighten"
                aria-hidden="true"
            />

            {/* Color dodge layer */}
            <div
                className="absolute inset-0 pointer-events-none rounded-[inherit] bg-[rgba(94,94,94,0.18)] mix-blend-color-dodge"
                aria-hidden="true"
            />

            {/* Content */}
            <span className="relative z-10 flex items-center justify-center gap-2">
                {children}
            </span>
        </button>
    )
}
