import type { RefractionSurfaceFrame } from './refraction-renderer'

export type GlassBackendId = 'app' | 'places-map'
export type GlassMaterialVariant = 'lens' | 'panel' | 'recessed' | 'nav'

export interface GlassSurfaceMaterial {
    backendId: GlassBackendId
    variant: GlassMaterialVariant
    radius: number
    distortion: number
    dispersion: number
    blur: number
}

interface GlassSurfaceRecord {
    element: HTMLElement
    material: GlassSurfaceMaterial
    visible: boolean
    rect: DOMRectReadOnly | null
}

const records = new Map<HTMLElement, GlassSurfaceRecord>()
type GlassSurfaceListener = (backends: ReadonlySet<GlassBackendId>) => void

interface GlassSurfaceSubscription {
    listener: GlassSurfaceListener
    backendId?: GlassBackendId
}

const listeners = new Set<GlassSurfaceSubscription>()
const pendingBackends = new Set<GlassBackendId>()
let intersectionObserver: IntersectionObserver | null = null
let resizeObserver: ResizeObserver | null = null
let notificationFrame: number | null = null
let notificationScheduled = false

function flushNotifications() {
    notificationFrame = null
    notificationScheduled = false
    if (!pendingBackends.size) return

    const changedBackends = new Set(pendingBackends)
    pendingBackends.clear()
    listeners.forEach(({ listener, backendId }) => {
        if (!backendId || changedBackends.has(backendId)) listener(changedBackends)
    })
}

function scheduleNotification(backends: Iterable<GlassBackendId>) {
    for (const backendId of backends) pendingBackends.add(backendId)
    if (notificationScheduled || !pendingBackends.size) return

    notificationScheduled = true
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        notificationFrame = window.requestAnimationFrame(flushNotifications)
        return
    }

    if (typeof queueMicrotask === 'function') queueMicrotask(flushNotifications)
    else Promise.resolve().then(flushNotifications)
}

function scheduleBackendNotification(...backends: GlassBackendId[]) {
    scheduleNotification(backends)
}

function ensureObservers() {
    if (typeof window === 'undefined') return

    if (!intersectionObserver && 'IntersectionObserver' in window) {
        intersectionObserver = new IntersectionObserver((entries) => {
            const changedBackends = new Set<GlassBackendId>()

            for (const entry of entries) {
                const record = records.get(entry.target as HTMLElement)
                if (!record || record.visible === entry.isIntersecting) continue
                record.visible = entry.isIntersecting
                changedBackends.add(record.material.backendId)
            }

            scheduleNotification(changedBackends)
        }, { rootMargin: '160px' })
    }

    if (!resizeObserver && 'ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(() => {
            const { backends } = measureRecords()
            scheduleNotification(backends)
        })
    }
}

function measureRecord(record: GlassSurfaceRecord) {
    if (!record.element.isConnected) return false
    const next = record.element.getBoundingClientRect()
    const previous = record.rect
    record.rect = next

    return !previous ||
        Math.abs(previous.left - next.left) > 0.25 ||
        Math.abs(previous.top - next.top) > 0.25 ||
        Math.abs(previous.width - next.width) > 0.25 ||
        Math.abs(previous.height - next.height) > 0.25
}

function unobserve(element: HTMLElement) {
    intersectionObserver?.unobserve(element)
    resizeObserver?.unobserve(element)
}

function measureRecords() {
    let changed = false
    const backends = new Set<GlassBackendId>()

    records.forEach((record, element) => {
        if (!element.isConnected) {
            unobserve(element)
            records.delete(element)
            changed = true
            backends.add(record.material.backendId)
            return
        }

        if (measureRecord(record)) {
            changed = true
            backends.add(record.material.backendId)
        }
    })

    return { changed, backends }
}

export function registerGlassSurface(element: HTMLElement, material: GlassSurfaceMaterial) {
    ensureObservers()
    const existing = records.get(element)
    const previousBackend = existing?.material.backendId

    if (existing) {
        existing.material = material
        measureRecord(existing)
    } else {
        const record: GlassSurfaceRecord = {
            element,
            material,
            visible: true,
            rect: null
        }
        records.set(element, record)
        measureRecord(record)
        intersectionObserver?.observe(element)
        resizeObserver?.observe(element)
    }

    if (previousBackend && previousBackend !== material.backendId) {
        scheduleBackendNotification(previousBackend, material.backendId)
    } else {
        scheduleBackendNotification(material.backendId)
    }

    return () => {
        const record = records.get(element)
        if (!record) return
        unobserve(element)
        records.delete(element)
        scheduleBackendNotification(record.material.backendId)
    }
}

export function updateGlassSurface(element: HTMLElement, material: GlassSurfaceMaterial) {
    const record = records.get(element)
    if (!record) return

    const previousBackend = record.material.backendId
    record.material = material
    measureRecord(record)
    if (previousBackend !== material.backendId) {
        scheduleBackendNotification(previousBackend, material.backendId)
    } else {
        scheduleBackendNotification(material.backendId)
    }
}

export function measureGlassSurfaces() {
    return measureRecords().changed
}

export function getGlassSurfaceFrames(
    backendId: GlassBackendId,
    viewportOffset = { left: 0, top: 0 },
    viewportSize = {
        width: typeof window === 'undefined' ? 0 : window.innerWidth,
        height: typeof window === 'undefined' ? 0 : window.innerHeight
    }
): RefractionSurfaceFrame[] {
    const frames: RefractionSurfaceFrame[] = []

    records.forEach((record) => {
        if (!record.visible || record.material.backendId !== backendId || !record.rect) return
        const rect = record.rect
        const left = rect.left - viewportOffset.left
        const top = rect.top - viewportOffset.top

        if (
            left + rect.width < -2 ||
            top + rect.height < -2 ||
            left > viewportSize.width + 2 ||
            top > viewportSize.height + 2
        ) return

        frames.push({
            left,
            top,
            width: rect.width,
            height: rect.height,
            radius: record.material.radius,
            distortion: record.material.distortion,
            dispersion: record.material.dispersion,
            blur: record.material.blur
        })
    })

    return frames
}

export function subscribeGlassSurfaces(
    listener: GlassSurfaceListener,
    backendId?: GlassBackendId
) {
    const subscription = { listener, backendId }
    listeners.add(subscription)
    return () => {
        listeners.delete(subscription)
    }
}

export function destroyGlassSurfaceRegistry() {
    intersectionObserver?.disconnect()
    resizeObserver?.disconnect()
    intersectionObserver = null
    resizeObserver = null
    if (notificationFrame !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(notificationFrame)
    }
    notificationFrame = null
    notificationScheduled = false
    pendingBackends.clear()
    records.clear()
    listeners.clear()
}
