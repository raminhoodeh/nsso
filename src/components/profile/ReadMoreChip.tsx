'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { NativeGlassLens } from '@/components/ui/tahoe-glass/NativeGlassLens'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { cn } from '@/lib/utils'

type ReadMoreChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>

/** The Premium chip's material, with a full touch target around its compact lens. */
const ReadMoreChip = forwardRef<HTMLButtonElement, ReadMoreChipProps>(function ReadMoreChip(
    { children, className, style, ...props }, ref,
) {
    return <button
        {...props}
        ref={ref}
        type="button"
        data-profile-read-more="true"
        className={cn('group inline-flex cursor-pointer items-center justify-center rounded-full align-middle outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-950 focus-visible:shadow-[0_0_0_6px_rgba(255,255,255,0.9)] disabled:pointer-events-none disabled:opacity-45', className)}
        style={{ ...style, minHeight: 44, minWidth: 44, padding: '0 2px', border: 0, background: 'transparent' }}
    >
        <NativeGlassLens
            as="span"
            data-profile-read-more-lens="true"
            className={cn(LIGHT_PANEL.control, 'pointer-events-none inline-flex items-center justify-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium text-slate-900 [text-shadow:none] group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-slate-950')}
        >
            {children}
        </NativeGlassLens>
    </button>
})

export default ReadMoreChip
