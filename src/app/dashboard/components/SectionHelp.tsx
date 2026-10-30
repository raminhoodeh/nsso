'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { cn } from '@/lib/utils'

/** Tiny contextual help, lifted above clipping and glass stacking contexts. */
export default function SectionHelp({ title, children }: { title: string; children: string }) {
    const [open, setOpen] = useState(false)
    const [position, setPosition] = useState<{ left: number; top: number; above: boolean; bridgeLeft: number; bridgeWidth: number; maxWidth: number; maxHeight: number; scrollable: boolean } | null>(null)
    const id = useId()
    const root = useRef<HTMLSpanElement>(null)
    const trigger = useRef<HTMLButtonElement>(null)
    const tooltip = useRef<HTMLSpanElement>(null)
    const contains = (target: EventTarget | null) => target instanceof Node && (root.current?.contains(target) || tooltip.current?.contains(target))
    const reveal = () => {
        document.dispatchEvent(new CustomEvent('nsso-section-help-open', { detail: id }))
        setOpen(true)
    }
    const leave = (target: EventTarget | null) => {
        if (contains(target) || contains(document.activeElement)) return
        setOpen(false)
    }

    useLayoutEffect(() => {
        if (!open || !tooltip.current) return
        const popup = tooltip.current
        const panel = popup.querySelector<HTMLElement>('[data-profile-help-popup]')
        if (!panel) return
        // Native popovers enter the top layer. The body portal also avoids
        // ancestor clipping in browsers without the Popover API.
        if (typeof popup.showPopover === 'function') popup.showPopover()
        // Reopening starts at the explanation; later placement changes retain
        // the user's reading position inside an already-open scrolling panel.
        panel.scrollTop = 0
        const place = () => {
            if (!trigger.current) return
            const viewport = window.visualViewport
            const visibleLeft = (viewport?.offsetLeft ?? 0) + 16
            const visibleRight = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 16
            let visibleTop = (viewport?.offsetTop ?? 0) + 16
            const visibleBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 16
            // Keep even a clamped top-layer explanation below visible mobile
            // chrome. Static headings and hidden headers do not reserve space.
            for (const header of document.querySelectorAll<HTMLElement>('header,[data-nsso-topbar]')) {
                const bounds = header.getBoundingClientRect()
                const style = getComputedStyle(header)
                if (['fixed', 'sticky'].includes(style.position) && bounds.width > 0 && bounds.height > 0 && bounds.top <= visibleTop && bounds.bottom > visibleTop) {
                    visibleTop = Math.min(visibleBottom, bounds.bottom + 16)
                }
            }
            const anchor = trigger.current.getBoundingClientRect()
            const maxWidth = Math.max(0, visibleRight - visibleLeft)
            // Measure at the real visual-viewport width without resetting an
            // overflowing panel's scrollTop during scrolling/repositioning.
            popup.style.maxWidth = `${maxWidth}px`
            const width = popup.getBoundingClientRect().width
            const panelStyle = getComputedStyle(panel)
            const naturalHeight = panel.scrollHeight > panel.clientHeight
                ? panel.scrollHeight + parseFloat(panelStyle.borderTopWidth) + parseFloat(panelStyle.borderBottomWidth)
                : panel.getBoundingClientRect().height
            const maxHeight = Math.max(0, visibleBottom - visibleTop - 6)
            const height = Math.min(naturalHeight, maxHeight) + 6
            const above = visibleBottom - anchor.bottom < height && anchor.top - visibleTop >= height
            const preferredTop = above ? anchor.top - height : anchor.bottom
            const top = Math.max(visibleTop, Math.min(preferredTop, visibleBottom - height))
            const left = Math.max(visibleLeft, Math.min(anchor.left, visibleRight - width))
            const next = { left, top, above, bridgeLeft: anchor.left - left, bridgeWidth: anchor.width, maxWidth, maxHeight, scrollable: naturalHeight > maxHeight }
            setPosition(current => current && Object.entries(next).every(([key, value]) => current[key as keyof typeof current] === value) ? current : next)
        }
        place()
        window.addEventListener('resize', place)
        window.addEventListener('scroll', place, true)
        window.visualViewport?.addEventListener('resize', place)
        window.visualViewport?.addEventListener('scroll', place)
        return () => {
            window.removeEventListener('resize', place)
            window.removeEventListener('scroll', place, true)
            window.visualViewport?.removeEventListener('resize', place)
            window.visualViewport?.removeEventListener('scroll', place)
            if (typeof popup.hidePopover === 'function' && popup.isConnected && popup.matches(':popover-open')) popup.hidePopover()
        }
    }, [open, children])

    useEffect(() => {
        if (!open) return
        const dismiss = (event: PointerEvent) => {
            if (!contains(event.target)) setOpen(false)
        }
        const dismissWithEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (tooltip.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true })
                setOpen(false)
            }
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
            onBlur={event => { if (!contains(event.relatedTarget)) setOpen(false) }}
            onKeyDown={event => {
                if (event.key === 'Tab' && !event.shiftKey && open && position?.scrollable) {
                    event.preventDefault()
                    tooltip.current?.querySelector<HTMLElement>('[data-profile-help-popup]')?.focus({ preventScroll: true })
                }
            }}>
            <Info size={14} aria-hidden="true" />
        </button>
        {open && createPortal(<span ref={tooltip} popover="manual" data-profile-help-layer="true"
            onPointerEnter={reveal}
            onPointerLeave={event => { if (event.pointerType !== 'touch') leave(event.relatedTarget) }}
            style={{ position: 'fixed', inset: 'auto', margin: 0, left: position?.left ?? 0, top: position?.top ?? 0, maxWidth: position?.maxWidth, visibility: position ? 'visible' : 'hidden', zIndex: 2147483647, paddingTop: position?.above ? 0 : 6, paddingBottom: position?.above ? 6 : 0 }}
            className="block w-[min(248px,calc(100vw_-_32px))] overflow-visible border-0 bg-transparent p-0">
            {/* The transparent bridge joins the symbol to the reading panel,
                including when the panel is clamped near a viewport edge. */}
            <span aria-hidden="true" style={{ position: 'absolute', left: position?.bridgeLeft ?? 0, width: position?.bridgeWidth ?? 32, height: 6, top: position?.above ? undefined : 0, bottom: position?.above ? 0 : undefined }} />
            <span id={id} role="tooltip" data-profile-help-popup="true" tabIndex={position?.scrollable ? 0 : undefined}
                onBlur={event => { if (!contains(event.relatedTarget)) setOpen(false) }}
                onKeyDown={event => {
                    if (event.key === 'Tab') {
                        // The body portal sits after the form in DOM order.
                        // Resume native forward tabbing from its trigger so
                        // readers reach the next field, not the end of page.
                        if (event.shiftKey) event.preventDefault()
                        trigger.current?.focus({ preventScroll: true })
                        if (!event.shiftKey) setOpen(false)
                    }
                }}
                style={{ maxHeight: position?.maxHeight, overscrollBehavior: 'contain' }}
                className={cn(LIGHT_PANEL.surface, 'block w-full max-h-[calc(100dvh_-_44px)] overflow-y-auto rounded-xl border border-white/80 px-3 py-2 text-xs font-normal leading-relaxed shadow-xl')}>
                {children}
            </span>
        </span>, document.body)}
    </span>
}
