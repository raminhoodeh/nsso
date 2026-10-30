'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { cn } from '@/lib/utils'

/** Tiny contextual help, lifted above clipping and glass stacking contexts. */
export default function SectionHelp({ title, children }: { title: string; children: string }) {
    const [open, setOpen] = useState(false)
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
    const id = useId()
    const root = useRef<HTMLSpanElement>(null)
    const trigger = useRef<HTMLButtonElement>(null)
    const tooltip = useRef<HTMLSpanElement>(null)
    const dismissTimer = useRef<number | null>(null)
    const cancelDismiss = () => {
        if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current)
        dismissTimer.current = null
    }
    const reveal = () => {
        cancelDismiss()
        document.dispatchEvent(new CustomEvent('nsso-section-help-open', { detail: id }))
        setOpen(true)
    }
    const leave = (target: EventTarget | null) => {
        if (target instanceof Node && (root.current?.contains(target) || tooltip.current?.contains(target))) return
        if (root.current?.contains(document.activeElement)) return
        cancelDismiss()
        // Let a pointer cross the small gap into the portalled help text.
        dismissTimer.current = window.setTimeout(() => setOpen(false), 120)
    }

    useLayoutEffect(() => {
        if (!open || !tooltip.current) return
        const popup = tooltip.current
        // Native popovers enter the top layer. The body portal also avoids
        // ancestor clipping in browsers without the Popover API.
        if (typeof popup.showPopover === 'function') popup.showPopover()
        const place = () => {
            if (!trigger.current) return
            const anchor = trigger.current.getBoundingClientRect()
            const bounds = popup.getBoundingClientRect()
            const left = Math.max(16, Math.min(anchor.left, window.innerWidth - bounds.width - 16))
            const below = anchor.bottom + 6
            const top = below + bounds.height <= window.innerHeight - 16
                ? below
                : Math.max(16, anchor.top - bounds.height - 6)
            setPosition({ left, top })
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        return () => {
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
            if (typeof popup.hidePopover === 'function' && popup.isConnected && popup.matches(':popover-open')) popup.hidePopover()
        }
    }, [open])

    useEffect(() => {
        if (!open) return
        const dismiss = (event: PointerEvent) => {
            const target = event.target as Node
            if (!root.current?.contains(target) && !tooltip.current?.contains(target)) setOpen(false)
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
            cancelDismiss()
            document.removeEventListener('pointerdown', dismiss)
            document.removeEventListener('keydown', dismissWithEscape)
            document.removeEventListener('nsso-section-help-open', dismissForOtherHelp)
        }
    }, [open, id])

    return <span ref={root} className="inline-flex shrink-0 align-middle"
        onPointerEnter={event => { if (event.pointerType !== 'touch') reveal() }}
        onPointerLeave={event => leave(event.relatedTarget)}>
        <button ref={trigger} type="button" data-profile-help-trigger="true"
            className={cn('nsso-help-trigger', LIGHT_PANEL.focus)}
            aria-label={`About ${title}`}
            aria-describedby={open ? id : undefined}
            aria-expanded={open}
            aria-controls={id}
            onClick={reveal}
            onFocus={event => { if (event.currentTarget.matches(':focus-visible')) reveal() }}
            onBlur={() => setOpen(false)}>
            <Info size={14} aria-hidden="true" />
        </button>
        {open && createPortal(<span ref={tooltip} id={id} role="tooltip" popover="manual"
            data-profile-help-popup="true"
            onPointerEnter={cancelDismiss}
            onPointerLeave={event => leave(event.relatedTarget)}
            style={{ position: 'fixed', inset: 'auto', margin: 0, left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden', zIndex: 2147483647 }}
            className={cn(LIGHT_PANEL.surface, 'w-[min(248px,calc(100vw_-_32px))] max-h-[calc(100dvh_-_32px)] overflow-y-auto rounded-xl border border-white/80 px-3 py-2 text-xs font-normal leading-relaxed shadow-xl')}>
            {children}
        </span>, document.body)}
    </span>
}
