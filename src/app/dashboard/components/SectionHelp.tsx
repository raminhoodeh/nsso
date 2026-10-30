'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { cn } from '@/lib/utils'
import { LightIconButton } from '@/components/ui/LightButton'

/** Compact help for section titles, readable without hover on touch screens. */
export default function SectionHelp({ title, children }: { title: string; children: string }) {
    const [open, setOpen] = useState(false)
    const id = useId()
    const root = useRef<HTMLSpanElement>(null)
    const tooltip = useRef<HTMLSpanElement>(null)
    const [placement, setPlacement] = useState({ left: 0, top: 44, maxWidth: 248, maxHeight: 600, above: false, scrollable: false })
    const reveal = () => {
        document.dispatchEvent(new CustomEvent('nsso-section-help-open', { detail: id }))
        setOpen(true)
    }

    useLayoutEffect(() => {
        if (!open) return
        // Reopening starts at the explanation, while later repositioning keeps
        // the user's reading position within an already-open tooltip.
        const panel = tooltip.current?.firstElementChild
        if (panel) panel.scrollTop = 0
        const place = () => {
            if (!root.current || !tooltip.current) return
            const panel = tooltip.current.firstElementChild as HTMLElement | null
            if (!panel) return
            const viewport = window.visualViewport
            const visibleLeft = (viewport?.offsetLeft ?? 0) + 16
            const visibleRight = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? window.innerWidth) - 16
            let visibleTop = (viewport?.offsetTop ?? 0) + 16
            const visibleBottom = (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight) - 16
            // A tooltip clamped into the viewport must not sit behind mobile
            // chrome. Static headings and hidden desktop headers do not count.
            for (const header of document.querySelectorAll<HTMLElement>('header,[data-nsso-topbar]')) {
                const bounds = header.getBoundingClientRect()
                const style = getComputedStyle(header)
                if (['fixed', 'sticky'].includes(style.position) && bounds.width > 0 && bounds.height > 0 && bounds.top <= visibleTop && bounds.bottom > visibleTop) {
                    visibleTop = Math.min(visibleBottom, bounds.bottom + 16)
                }
            }
            const bounds = root.current.getBoundingClientRect()
            const maxWidth = Math.max(0, visibleRight - visibleLeft)
            // Measure wrapped text at the real visual-viewport width. Reading
            // scrollHeight leaves an already-scrollable panel's scroll intact.
            tooltip.current.style.maxWidth = `${maxWidth}px`
            const width = tooltip.current.getBoundingClientRect().width
            const panelStyle = getComputedStyle(panel)
            const naturalHeight = panel.scrollHeight > panel.clientHeight
                ? panel.scrollHeight + parseFloat(panelStyle.borderTopWidth) + parseFloat(panelStyle.borderBottomWidth)
                : panel.getBoundingClientRect().height
            const maxHeight = Math.max(0, visibleBottom - visibleTop - 8)
            const height = Math.min(naturalHeight, maxHeight) + 8
            const below = visibleBottom - bounds.bottom
            const above = bounds.top - visibleTop
            const useAbove = below < height && above >= height
            const preferredTop = useAbove ? bounds.top - height : bounds.bottom
            const top = Math.max(visibleTop, Math.min(preferredTop, visibleBottom - height))
            const next = {
                left: Math.max(visibleLeft, Math.min(bounds.left, visibleRight - width)) - bounds.left,
                top: top - bounds.top, maxWidth, maxHeight, above: useAbove,
                scrollable: naturalHeight > maxHeight,
            }
            setPlacement(current => Object.entries(next).every(([key, value]) => current[key as keyof typeof current] === value) ? current : next)
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
        }
    }, [open, children])

    useEffect(() => {
        if (!open) return
        const dismiss = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        const dismissWithEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (tooltip.current?.contains(document.activeElement)) root.current?.querySelector('button')?.focus({ preventScroll: true })
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

    return (
        <span ref={root} className="relative inline-flex shrink-0" onPointerEnter={event => { if (event.pointerType !== 'touch') reveal() }} onPointerLeave={() => { if (!root.current?.contains(document.activeElement)) setOpen(false) }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
            <LightIconButton
                type="button"
                aria-label={`About ${title}`}
                aria-describedby={open ? id : undefined}
                aria-expanded={open}
                aria-controls={id}
                // Hover/focus may already have opened the tooltip before click.
                // Activation must reveal help, not immediately toggle it closed.
                onClick={reveal}
                onFocus={event => { if (event.currentTarget.matches(':focus-visible')) reveal() }}
                onBlur={event => { if (!root.current?.contains(event.relatedTarget as Node | null)) setOpen(false) }}
            >
                <Info size={18} aria-hidden="true" />
            </LightIconButton>
            <span ref={tooltip} hidden={!open} style={{ left: placement.left, top: placement.above ? 'auto' : placement.top, bottom: placement.above ? '100%' : 'auto', maxWidth: placement.maxWidth, paddingTop: placement.above ? 0 : 8, paddingBottom: placement.above ? 8 : 0 }} className="absolute top-full z-50 w-[min(248px,calc(100vw_-_96px))] pt-2">
                <span id={id} role="tooltip" tabIndex={placement.scrollable ? 0 : undefined} style={{ maxHeight: placement.maxHeight, overflowY: 'auto', overscrollBehavior: 'contain' }} className={cn(LIGHT_PANEL.surface, 'block rounded-2xl border border-white/80 px-4 py-3 text-sm font-normal leading-relaxed shadow-xl')}>
                    {children}
                </span>
            </span>
        </span>
    )
}
