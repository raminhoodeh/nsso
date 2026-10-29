'use client'

import * as React from 'react'
import { TahoeGlassEngineContext } from '@/components/providers/TahoeGlassProvider'
import { TahoeGlassDirectBackdropBoundaryContext } from './TahoeGlassBoundaryContext'

/** Assign a native ref and retain React 19 callback-ref cleanup. */
function assignNativeRef<T>(ref: React.Ref<T> | undefined, element: T | null) {
    if (typeof ref === 'function') return ref(element)
    if (ref) ref.current = element
}

/**
 * Register a native element with the original supplied convex-lens engine.
 * Geometry, visibility, map caching and rendering belong to the shared scene.
 */
export function useTahoeNativeLens<T extends HTMLElement>(forwardedRef?: React.Ref<T>) {
    const context = React.useContext(TahoeGlassEngineContext)
    const insideDirectBackdrop = React.useContext(TahoeGlassDirectBackdropBoundaryContext)
    const enabled = context?.materialFamily === 'supplied'
    const registerSurface = context?.registerSurface
    const unregisterSurface = context?.unregisterSurface
    const elementRef = React.useRef<T | null>(null)
    // A polymorphic native root can be replaced without remounting this hook.
    // Track its identity so registration follows the connected DOM element.
    const [element, setElement] = React.useState<T | null>(null)
    const id = React.useId()
    const ref = React.useCallback((element: T | null) => {
        elementRef.current = element
        setElement(element)
        const dispose = assignNativeRef(forwardedRef, element)
        return () => {
            if (typeof dispose === 'function') dispose()
            else assignNativeRef(forwardedRef, null)
            if (elementRef.current === element) {
                elementRef.current = null
                setElement(current => current === element ? null : current)
            }
        }
    }, [forwardedRef])

    React.useLayoutEffect(() => {
        if (!enabled || !element || !registerSurface || !unregisterSurface) return
        registerSurface(id, element, {
            continuous: false,
            refractive: !insideDirectBackdrop,
            displacementProfile: 'convex',
        })
        return () => {
            unregisterSurface(id)
            for (const name of ['state', 'backend', 'source', 'fallback-reason', 'visible', 'measured', 'displacement']) {
                element.removeAttribute(`data-tahoe-glass-${name}`)
            }
            for (const name of ['--cos', '--sin', '--light-angle', '--rim-intensity', '--rim-gradient']) {
                element.style.removeProperty(name)
            }
        }
    }, [element, enabled, id, insideDirectBackdrop, registerSurface, unregisterSurface])

    const diagnostics = context?.diagnostics
    const mode = diagnostics?.status === 'active' && diagnostics.backend === 'webgl'
        ? 'webgl' : diagnostics?.backend === 'svg' ? 'svg' : 'blur'
    const solid = enabled && diagnostics?.backend === 'solid' && diagnostics.status !== 'initializing'
    return { ref, enabled, mode, solid } as const
}
