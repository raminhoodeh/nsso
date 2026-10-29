'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LIGHT_PANEL } from './light-panel'

type AskDeityButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>

/** Quiet assistance affordance: a compact lens inside a full native touch target. */
const AskDeityButton = forwardRef<HTMLButtonElement, AskDeityButtonProps>(function AskDeityButton(
    { className, style, type = 'button', 'aria-label': label = 'Ask Deity', ...props },
    ref,
) {
    return <button
        {...props}
        ref={ref}
        type={type}
        aria-label={label}
        data-ask-deity-control="true"
        className={cn('group inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-slate-950 focus-visible:shadow-[0_0_0_6px_rgba(255,255,255,0.9)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45', className)}
        style={{ ...style, minHeight: 44, minWidth: 44, padding: '0 2px', border: 0, background: 'transparent' }}
    >
        <span
            data-ask-deity-lens="true"
            className={cn(LIGHT_PANEL.control, 'pointer-events-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 font-medium [text-shadow:none] group-focus-visible:outline-solid group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-slate-950 forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]')}
            style={{ height: 28, fontSize: 12, lineHeight: '16px' }}
        >
            <Sparkles size={12} aria-hidden="true" />
            <span>Ask Deity</span>
        </span>
    </button>
})

export default AskDeityButton
