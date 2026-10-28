'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { cn } from '@/lib/utils'

/** Compact help for section titles, readable without hover on touch screens. */
export default function SectionHelp({ title, children }: { title: string; children: string }) {
    const [open, setOpen] = useState(false)
    const id = useId()
    const root = useRef<HTMLSpanElement>(null)
    const tooltip = useRef<HTMLSpanElement>(null)
    const [offset, setOffset] = useState(0)
    const reveal = () => {
        document.dispatchEvent(new CustomEvent('nsso-section-help-open', { detail: id }))
        setOpen(true)
    }

    useLayoutEffect(() => {
        if (!open) return
        const place = () => {
            if (!root.current || !tooltip.current) return
            const start = root.current.getBoundingClientRect().left
            const width = tooltip.current.getBoundingClientRect().width
            const left = Math.max(16, Math.min(start, window.innerWidth - width - 16))
            setOffset(left - start)
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const dismiss = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        const dismissWithEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false)
        }
        const dismissForOtherHelp = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== id) setOpen(false)
        }
        document.addEventListener('pointerdown', dismiss)
        document.addEventListener('keydown', dismissWithEscape)
        document.addEventListener('nsso-section-help-open', dismissForOtherHelp)
        return () => {
            document.removeEventListener('pointerdown', dismiss)
            document.removeEventListener('keydown', dismissWithEscape)
            document.removeEventListener('nsso-section-help-open', dismissForOtherHelp)
        }
    }, [open, id])

    return (
        <span ref={root} className="relative inline-flex shrink-0" onPointerEnter={event => { if (event.pointerType !== 'touch') reveal() }} onPointerLeave={() => { if (!root.current?.contains(document.activeElement)) setOpen(false) }}>
            <button
                type="button"
                aria-label={`About ${title}`}
                aria-describedby={open ? id : undefined}
                aria-expanded={open}
                aria-controls={id}
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/75 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                // Hover/focus may already have opened the tooltip before click.
                // Activation must reveal help, not immediately toggle it closed.
                onClick={reveal}
                onFocus={event => { if (event.currentTarget.matches(':focus-visible')) reveal() }}
                onBlur={() => setOpen(false)}
            >
                <Info size={18} aria-hidden="true" />
            </button>
            <span ref={tooltip} hidden={!open} style={{ left: offset }} className="absolute top-full z-50 w-[min(248px,calc(100vw_-_96px))] pt-2">
                <span id={id} role="tooltip" className={cn(LIGHT_PANEL.surface, 'block rounded-2xl border border-white/80 px-4 py-3 text-sm font-normal leading-relaxed shadow-xl')}>
                    {children}
                </span>
            </span>
        </span>
    )
}
