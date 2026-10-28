'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface GlassSwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'role' | 'aria-checked'> {
    checked: boolean
}

/** A compact visual track inside a full touch target; checked state belongs to the caller. */
export const GlassSwitch = forwardRef<HTMLButtonElement, GlassSwitchProps>(function GlassSwitch(
    { checked, className, type = 'button', ...props }, ref,
) {
    return <button {...props} ref={ref} type={type} role="switch" aria-checked={checked}
        data-nsso-control="switch" className={cn('nsso-glass-switch', className)}>
        <span aria-hidden="true" data-switch-track="true">
            <span data-switch-thumb="true" />
        </span>
    </button>
})
