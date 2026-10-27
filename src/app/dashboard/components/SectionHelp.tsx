'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'

/** Compact help for section titles, readable without hover on touch screens. */
export default function SectionHelp({ title, children }: { title: string; children: string }) {
    const [open, setOpen] = useState(false)
    const id = useId()
    const root = useRef<HTMLSpanElement>(null)

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
        document.addEventListener('pointerdown', dismiss)
        document.addEventListener('keydown', dismissWithEscape)
        return () => {
            document.removeEventListener('pointerdown', dismiss)
            document.removeEventListener('keydown', dismissWithEscape)
        }
    }, [open])

    return (
        <span ref={root} className="relative inline-flex shrink-0" onPointerEnter={event => { if (event.pointerType !== 'touch') setOpen(true) }} onPointerLeave={() => { if (!root.current?.contains(document.activeElement)) setOpen(false) }}>
            <button
                type="button"
                aria-label={`About ${title}`}
                aria-describedby={open ? id : undefined}
                aria-expanded={open}
                aria-controls={id}
                className="flex h-11 w-11 items-center justify-center rounded-full text-white/75 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white"
                onClick={() => setOpen(value => !value)}
                onFocus={event => { if (event.currentTarget.matches(':focus-visible')) setOpen(true) }}
                onBlur={() => setOpen(false)}
            >
                <Info size={18} aria-hidden="true" />
            </button>
            <span hidden={!open} className="absolute left-0 top-full z-50 w-[min(248px,calc(100vw_-_96px))] pt-2">
                <span id={id} role="tooltip" className="block rounded-2xl border border-white/20 bg-[#202126] px-4 py-3 text-sm font-normal leading-relaxed text-white shadow-xl">
                    {children}
                </span>
            </span>
        </span>
    )
}
