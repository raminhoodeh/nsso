import { ButtonHTMLAttributes, ReactNode } from 'react'
import {
    TahoeGlassButton,
    type TahoeGlassContentTone,
} from '@/components/ui/tahoe-glass'

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode
    variant?: 'primary' | 'secondary' | 'ghost' | 'shiny'
    size?: 'sm' | 'md' | 'lg'
    fullWidth?: boolean
    tone?: TahoeGlassContentTone
}

/** Backwards-compatible button API backed by the shared Tahoe lens. */
export default function GlassButton({
    children,
    variant = 'primary',
    size = 'md',
    fullWidth = false,
    tone = 'light',
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
        primary: 'font-semibold',
        secondary: 'font-semibold',
        ghost: 'font-medium',
        shiny: 'font-bold tracking-wide'
    }

    const toneStyles = {
        inherit: 'text-inherit',
        light: 'text-white',
        dark: 'text-slate-950'
    }

    return (
        <TahoeGlassButton
            className={`
                overflow-hidden text-center transition-all duration-200 ease-out
                disabled:!pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50
                ${sizeStyles[size]}
                ${variantStyles[variant]}
                ${fullWidth ? 'w-full' : ''}
                ${className}
            `}
            contentClassName={`flex items-center justify-center gap-2 text-[inherit] font-[inherit] tracking-[inherit] ${toneStyles[tone]}`}
            tone={tone}
            disabled={disabled}
            {...props}
        >
            {children}
        </TahoeGlassButton>
    )
}
