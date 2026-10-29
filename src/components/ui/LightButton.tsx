'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { lightButtonClass } from './light-button-styles'
export { lightButtonClass } from './light-button-styles'

export interface LightButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    contentClassName?: string
    intent?: 'default' | 'muted' | 'danger'
    radius?: number | string
}

export const LightButton = forwardRef<HTMLButtonElement, LightButtonProps>(function LightButton(
    { className, contentClassName, children, type = 'button', intent = 'default', radius, style, ...props },
    ref,
) {
    return <button
        {...props}
        ref={ref}
        type={type}
        data-nsso-control="white"
        className={cn(lightButtonClass,
            intent === 'muted' && 'text-slate-800 hover:text-slate-950',
            intent === 'danger' && 'text-rose-950 hover:text-red-950',
            className)}
        style={radius === undefined ? style : { borderRadius: radius, ...style }}
    >
        <span data-light-button-content="true" className={cn('pointer-events-none inline-flex min-w-0 items-center justify-center gap-2', contentClassName)}>{children}</span>
    </button>
})

export const LightIconButton = forwardRef<HTMLButtonElement, LightButtonProps>(function LightIconButton(
    { className, contentClassName, ...props }, ref,
) {
    return <LightButton {...props} ref={ref} className={cn('h-11 w-11 shrink-0 p-0', className)} contentClassName={cn('h-full w-full', contentClassName)} />
})

export const LightCloseButton = forwardRef<HTMLButtonElement, Omit<LightButtonProps, 'children'>>(function LightCloseButton(
    { 'aria-label': label = 'Close', ...props }, ref,
) {
    return <LightIconButton {...props} ref={ref} aria-label={label}><X size={18} aria-hidden="true" /></LightIconButton>
})
