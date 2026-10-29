'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { lightButtonClass } from './light-button-styles'
import { LiquidGlassMaterial } from './apple-tahoe-liquid-glass-button'
import { useTahoeNativeLens } from './tahoe-glass/useTahoeNativeLens'
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
    const lens = useTahoeNativeLens(ref)
    return <button
        {...props}
        ref={lens.ref}
        type={type}
        data-nsso-control="white"
        data-tahoe-native-lens={lens.enabled ? 'supplied' : undefined}
        data-tahoe-native-solid={lens.solid ? 'true' : undefined}
        className={cn(lightButtonClass, lens.enabled && 'nsso-supplied-glass',
            intent === 'muted' && 'text-slate-900 hover:text-slate-950',
            intent === 'danger' && 'text-rose-950 hover:text-red-950',
            className)}
        style={radius === undefined ? style : { borderRadius: radius, ...style }}
    >
        {lens.enabled && <LiquidGlassMaterial mode={lens.mode} solid={lens.solid} />}
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
