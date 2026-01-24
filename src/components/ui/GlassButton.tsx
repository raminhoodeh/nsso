import { ButtonHTMLAttributes, ReactNode } from 'react'

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode
    variant?: 'primary' | 'secondary' | 'ghost' | 'shiny'
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
      bg-[rgba(128,128,128,0.3)]
      border-[1.4px] border-[rgba(255,255,255,0.4)]
      hover:border-[rgba(255,255,255,0.6)]
      hover:bg-[rgba(128,128,128,0.4)]
      mix-blend-luminosity
      backdrop-blur-md
    `,
        ghost: `
      bg-transparent
      hover:bg-[rgba(255,255,255,0.1)]
    `,
        shiny: `
      bg-[rgba(255,255,255,0.2)]
      border border-white/50
      shadow-[0_0_15px_rgba(255,255,255,0.3)]
      hover:bg-[rgba(255,255,255,0.3)]
      hover:shadow-[0_0_20px_rgba(255,255,255,0.5)]
      active:scale-[0.98]
      backdrop-blur-md
      text-white
      font-bold
      tracking-wide
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
            style={{}}
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

            {/* Shimmer Effect for Shiny Variant */}
            {variant === 'shiny' && (
                <div className="absolute inset-0 z-0 overflow-hidden rounded-[inherit] pointer-events-none">
                    <div className="absolute top-0 left-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
                </div>
            )}

            {/* Content */}
            <span className="relative z-10 flex items-center justify-center gap-2">
                {children}
            </span>
        </button>
    )
}
