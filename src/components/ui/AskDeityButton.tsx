'use client'

import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

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
        className={cn('group inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white/80 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-45', className)}
        style={{ ...style, minHeight: 44, minWidth: 44, padding: '0 2px', border: 0, background: 'transparent' }}
    >
        <span
            data-ask-deity-lens="true"
            className="pointer-events-none inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-white/20 bg-black/[0.58] px-2.5 font-medium text-white/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition-[background-color,border-color,color,box-shadow] duration-150 group-hover:border-white/35 group-hover:bg-black/[0.62] group-hover:text-white group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_0_8px_rgba(255,255,255,0.08)] group-focus-visible:border-white/50 group-focus-visible:text-white group-active:bg-black/[0.66] motion-reduce:transition-none forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:text-[CanvasText]"
            style={{ height: 28, fontSize: 12, lineHeight: '16px' }}
        >
            <Sparkles size={12} aria-hidden="true" />
            <span>Ask Deity</span>
        </span>
    </button>
})

export default AskDeityButton
