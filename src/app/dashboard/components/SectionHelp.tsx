'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { cn } from '@/lib/utils'

/** Tiny contextual help, lifted above clipping and glass stacking contexts. */
export default function SectionHelp({ title, children }: { title: string; children: string }) {
    const [open, setOpen] = useState(false)
    const [position, setPosition] = useState<{ left: number; top: number; above: boolean; bridgeLeft: number; bridgeWidth: number } | null>(null)
    const id = useId()
    const root = useRef<HTMLSpanElement>(null)
    const trigger = useRef<HTMLButtonElement>(null)
    const tooltip = useRef<HTMLSpanElement>(null)
    const reveal = () => {
        document.dispatchEvent(new CustomEvent('nsso-section-help-open', { detail: id }))
        setOpen(true)
    }
    const leave = (target: EventTarget | null) => {
        if (target instanceof Node && (root.current?.contains(target) || tooltip.current?.contains(target))) return
        if (root.current?.contains(document.activeElement)) return
        setOpen(false)
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
            const above = anchor.bottom + bounds.height > window.innerHeight - 16
            const top = above ? Math.max(16, anchor.top - bounds.height) : anchor.bottom
            setPosition({ left, top, above, bridgeLeft: anchor.left - left, bridgeWidth: anchor.width })
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
            document.removeEventListener('pointerdown', dismiss)
            document.removeEventListener('keydown', dismissWithEscape)
            document.removeEventListener('nsso-section-help-open', dismissForOtherHelp)
        }
    }, [open, id])

    return <span ref={root} className="inline-flex shrink-0 align-middle"
        onPointerEnter={event => { if (event.pointerType !== 'touch') reveal() }}
        onPointerLeave={event => { if (event.pointerType !== 'touch') leave(event.relatedTarget) }}>
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
        {open && createPortal(<span ref={tooltip} popover="manual" data-profile-help-layer="true"
            onPointerEnter={reveal}
            onPointerLeave={event => { if (event.pointerType !== 'touch') leave(event.relatedTarget) }}
            style={{ position: 'fixed', inset: 'auto', margin: 0, left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden', zIndex: 2147483647, paddingTop: position?.above ? 0 : 6, paddingBottom: position?.above ? 6 : 0 }}
            className="block w-[min(248px,calc(100vw_-_32px))] overflow-visible border-0 bg-transparent p-0">
            {/* The transparent bridge joins the symbol to the reading panel,
                including when the panel is clamped near a viewport edge. */}
            <span aria-hidden="true" style={{ position: 'absolute', left: position?.bridgeLeft ?? 0, width: position?.bridgeWidth ?? 32, height: 6, top: position?.above ? undefined : 0, bottom: position?.above ? 0 : undefined }} />
            <span id={id} role="tooltip" data-profile-help-popup="true"
                className={cn(LIGHT_PANEL.surface, 'block w-full max-h-[calc(100dvh_-_44px)] overflow-y-auto rounded-xl border border-white/80 px-3 py-2 text-xs font-normal leading-relaxed shadow-xl')}>
                {children}
            </span>
        </span>, document.body)}
    </span>
}
