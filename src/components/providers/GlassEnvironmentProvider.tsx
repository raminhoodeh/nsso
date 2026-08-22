'use client'

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode
} from 'react'

export type GlassQuality = 'refractive' | 'frosted' | 'solid'

interface RegisteredLens {
    element: HTMLElement
    visible: boolean
}

interface GlassEnvironmentValue {
    quality: GlassQuality
    reducedMotion: boolean
    registerLens: (element: HTMLElement) => () => void
    requestMeasure: () => void
}

interface GlassEnvironmentProviderProps {
    children: ReactNode
}

interface NavigatorConnection extends EventTarget {
    saveData?: boolean
}

interface NavigatorWithConnection extends Navigator {
    connection?: NavigatorConnection
}

const GlassEnvironmentContext = createContext<GlassEnvironmentValue | null>(null)

const DEFAULT_LIGHT_X = 0.5
const DEFAULT_LIGHT_Y = 0

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

/**
 * Places the shared scene light relative to one lens. The values are written
 * directly to the element so measuring the scene never causes React renders.
 */
export function setGlassLight(element: HTMLElement, lightX: number, lightY: number) {
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const deltaX = lightX - centerX
    const deltaY = lightY - centerY
    const distance = Math.max(1, Math.hypot(deltaX, deltaY))
    const normalX = deltaX / distance
    const normalY = deltaY / distance
    const angle = Math.atan2(deltaY, deltaX) * (180 / Math.PI) + 90
    const localX = clamp(((lightX - rect.left) / rect.width) * 100, 0, 100)
    const localY = clamp(((lightY - rect.top) / rect.height) * 100, 0, 100)

    element.style.setProperty('--glass-light-angle', `${angle.toFixed(2)}deg`)
    element.style.setProperty('--glass-light-local-x', `${localX.toFixed(2)}%`)
    element.style.setProperty('--glass-light-local-y', `${localY.toFixed(2)}%`)
    element.style.setProperty('--glass-rim-x', `${(normalX * 2.4).toFixed(2)}px`)
    element.style.setProperty('--glass-rim-y', `${(normalY * 3.2).toFixed(2)}px`)
    element.style.setProperty('--glass-shadow-x', `${(-normalX * 8).toFixed(2)}px`)
    element.style.setProperty('--glass-shadow-y', `${(-normalY * 10).toFixed(2)}px`)
}

export function GlassEnvironmentProvider({ children }: GlassEnvironmentProviderProps) {
    const [quality, setQuality] = useState<GlassQuality>('frosted')
    const [reducedMotion, setReducedMotion] = useState(false)
    const lensesRef = useRef(new Map<HTMLElement, RegisteredLens>())
    const observerRef = useRef<IntersectionObserver | null>(null)
    const frameRef = useRef<number | null>(null)

    const measureVisibleLenses = useCallback(() => {
        if (document.hidden) return

        const lightX = window.innerWidth * DEFAULT_LIGHT_X
        const lightY = window.innerHeight * DEFAULT_LIGHT_Y

        lensesRef.current.forEach((lens) => {
            if (lens.visible && lens.element.isConnected) {
                setGlassLight(lens.element, lightX, lightY)
            }
        })
    }, [])

    const requestMeasure = useCallback(() => {
        if (frameRef.current !== null || document.hidden) return

        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null
            measureVisibleLenses()
        })
    }, [measureVisibleLenses])

    const registerLens = useCallback((element: HTMLElement) => {
        const registered: RegisteredLens = { element, visible: true }
        lensesRef.current.set(element, registered)
        observerRef.current?.observe(element)
        requestMeasure()

        return () => {
            observerRef.current?.unobserve(element)
            lensesRef.current.delete(element)
        }
    }, [requestMeasure])

    useEffect(() => {
        const transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)')
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
        const connection = (navigator as NavigatorWithConnection).connection

        const detectQuality = () => {
            const supportsBackdrop =
                CSS.supports('backdrop-filter', 'blur(1px)') ||
                CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
            const supportsSvgDisplacement =
                CSS.supports('filter', 'url("#glass-capability-test")') &&
                Boolean(document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap'))

            setReducedMotion(motionQuery.matches)

            if (transparencyQuery.matches) {
                setQuality('solid')
            } else if (supportsBackdrop && supportsSvgDisplacement && !connection?.saveData) {
                setQuality('refractive')
            } else if (supportsBackdrop) {
                setQuality('frosted')
            } else {
                setQuality('solid')
            }
        }

        detectQuality()
        transparencyQuery.addEventListener('change', detectQuality)
        motionQuery.addEventListener('change', detectQuality)
        connection?.addEventListener('change', detectQuality)

        return () => {
            transparencyQuery.removeEventListener('change', detectQuality)
            motionQuery.removeEventListener('change', detectQuality)
            connection?.removeEventListener('change', detectQuality)
        }
    }, [])

    useEffect(() => {
        document.documentElement.dataset.glassQuality = quality
        document.documentElement.dataset.glassMotion = reducedMotion ? 'reduced' : 'full'
    }, [quality, reducedMotion])

    useEffect(() => {
        if (!('IntersectionObserver' in window)) return

        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                const lens = lensesRef.current.get(entry.target as HTMLElement)
                if (lens) lens.visible = entry.isIntersecting
            })
            requestMeasure()
        }, { rootMargin: '120px' })

        observerRef.current = observer
        lensesRef.current.forEach((lens) => observer.observe(lens.element))

        return () => {
            observer.disconnect()
            observerRef.current = null
        }
    }, [requestMeasure])

    useEffect(() => {
        const handleViewportChange = () => requestMeasure()
        const handleVisibilityChange = () => {
            if (!document.hidden) requestMeasure()
        }

        window.addEventListener('resize', handleViewportChange, { passive: true })
        window.addEventListener('orientationchange', handleViewportChange, { passive: true })
        window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true })
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            window.removeEventListener('resize', handleViewportChange)
            window.removeEventListener('orientationchange', handleViewportChange)
            window.removeEventListener('scroll', handleViewportChange, true)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            if (frameRef.current !== null) {
                window.cancelAnimationFrame(frameRef.current)
                frameRef.current = null
            }
        }
    }, [requestMeasure])

    const value = useMemo<GlassEnvironmentValue>(() => ({
        quality,
        reducedMotion,
        registerLens,
        requestMeasure
    }), [quality, reducedMotion, registerLens, requestMeasure])

    return (
        <GlassEnvironmentContext.Provider value={value}>
            {children}
        </GlassEnvironmentContext.Provider>
    )
}

export function useGlassEnvironment() {
    const context = useContext(GlassEnvironmentContext)
    if (!context) {
        throw new Error('useGlassEnvironment must be used within GlassEnvironmentProvider')
    }
    return context
}
