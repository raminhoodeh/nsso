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
import { GlassRefractionRenderer } from '@/lib/glass/refraction-renderer'
import {
    getGlassSurfaceFrames,
    measureGlassSurfaces,
    registerGlassSurface,
    subscribeGlassSurfaces,
    type GlassBackendId,
    type GlassMaterialVariant,
    type GlassSurfaceMaterial
} from '@/lib/glass/surface-registry'

export type GlassQuality = 'refractive' | 'frosted' | 'solid'
export type GlassRendererStatus = 'initializing' | 'shared-webgl' | 'native-fallback' | 'solid'

interface GlassEnvironmentValue {
    quality: GlassQuality
    rendererStatus: GlassRendererStatus
    reducedMotion: boolean
    registerLight: (element: HTMLElement) => () => void
    requestMeasure: () => void
    setSceneCanvas: (canvas: HTMLCanvasElement | null) => () => void
    renderSceneFrame: () => void
    setSceneImage: (url: string | null) => () => void
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

type ImageSource = HTMLImageElement | HTMLCanvasElement

const GlassEnvironmentContext = createContext<GlassEnvironmentValue | null>(null)
const DEFAULT_LIGHT_X = 0.5
const DEFAULT_LIGHT_Y = 0
const LEGACY_GLASS_SELECTOR = [
    '[class*="glass-style-"]',
    '.glass-panel',
    '[data-glass-auto="true"]'
].join(',')

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function materialForVariant(
    variant: GlassMaterialVariant,
    backendId: GlassBackendId,
    radius: number
): GlassSurfaceMaterial {
    const recipe = {
        lens: { distortion: 22, dispersion: 0.075, blur: 3.5 },
        panel: { distortion: 10, dispersion: 0.035, blur: 11 },
        nav: { distortion: 7, dispersion: 0.025, blur: 8 },
        recessed: { distortion: 4, dispersion: 0.018, blur: 5 }
    }[variant]

    return { backendId, variant, radius, ...recipe }
}

function legacyMaterial(element: HTMLElement): GlassSurfaceMaterial {
    const computed = window.getComputedStyle(element)
    const dataVariant = element.dataset.glassVariant as GlassMaterialVariant | undefined
    const variant: GlassMaterialVariant = dataVariant || (
        element.classList.contains('glass-style-navbar') ? 'nav' :
            element.dataset.glassAutoVariant === 'recessed' ? 'recessed' : 'panel'
    )
    const backendId: GlassBackendId = element.dataset.glassBackend === 'places-map'
        ? 'places-map'
        : 'app'
    const radius = Number.parseFloat(element.dataset.glassRadius || computed.borderTopLeftRadius) || (
        variant === 'nav' ? 0 : variant === 'recessed' ? 20 : 40
    )
    const base = materialForVariant(variant, backendId, radius)

    return {
        ...base,
        distortion: Number.parseFloat(element.dataset.glassDistortion || '') || base.distortion,
        blur: Number.parseFloat(element.dataset.glassBlur || '') || base.blur
    }
}

/** Places the shared scene light relative to one glass surface. */
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
    const [rendererStatus, setRendererStatus] = useState<GlassRendererStatus>('initializing')
    const [reducedMotion, setReducedMotion] = useState(false)
    const compositorCanvasRef = useRef<HTMLCanvasElement>(null)
    const staticRendererRef = useRef<GlassRefractionRenderer | null>(null)
    const sceneCanvasRef = useRef<HTMLCanvasElement | null>(null)
    const sceneRendererRef = useRef<GlassRefractionRenderer | null>(null)
    const sceneImageRef = useRef<HTMLImageElement | null>(null)
    const imageRequestRef = useRef(0)
    const allowRefractionRef = useRef(true)
    const lightElementsRef = useRef(new Set<HTMLElement>())
    const frameRef = useRef<number | null>(null)
    const legacyRegistrationsRef = useRef(new Map<HTMLElement, () => void>())

    const markRefractive = useCallback(() => {
        if (
            document.documentElement.dataset.glassRenderer === 'shared-webgl' &&
            document.documentElement.dataset.glassQuality === 'refractive'
        ) return
        document.documentElement.dataset.glassRenderer = 'shared-webgl'
        setRendererStatus('shared-webgl')
        setQuality('refractive')
    }, [])

    const markSceneDormant = useCallback(() => {
        const hasActiveSource = Boolean(
            sceneImageRef.current ||
            (sceneCanvasRef.current && sceneRendererRef.current)
        )
        if (hasActiveSource || !allowRefractionRef.current) return

        const supportsBackdrop =
            CSS.supports('backdrop-filter', 'blur(1px)') ||
            CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
        const fallbackStatus: GlassRendererStatus = supportsBackdrop ? 'native-fallback' : 'solid'
        const fallbackQuality: GlassQuality = supportsBackdrop ? 'frosted' : 'solid'

        document.documentElement.dataset.glassRenderer = fallbackStatus
        delete document.documentElement.dataset.glassScene
        setRendererStatus(fallbackStatus)
        setQuality(fallbackQuality)
    }, [])

    const renderSource = useCallback((source?: ImageSource | null) => {
        const canvas = compositorCanvasRef.current
        const renderer = staticRendererRef.current
        const activeSource = source || sceneImageRef.current
        if (!canvas || !renderer || !activeSource || !allowRefractionRef.current || document.hidden) return false

        const cssWidth = Math.max(1, window.innerWidth)
        const cssHeight = Math.max(1, window.innerHeight)
        const renderScale = Math.min(1.15, window.devicePixelRatio || 1) * 0.82
        const outputWidth = Math.max(1, Math.round(cssWidth * renderScale))
        const outputHeight = Math.max(1, Math.round(cssHeight * renderScale))

        if (canvas.width !== outputWidth || canvas.height !== outputHeight) {
            canvas.width = outputWidth
            canvas.height = outputHeight
        }

        try {
            if (!renderer.uploadSource(activeSource)) return false
            const sourceSize = renderer.getSourceSize()
            renderer.render(
                getGlassSurfaceFrames('app'),
                { width: cssWidth, height: cssHeight },
                { width: outputWidth, height: outputHeight },
                {
                    drawBase: true,
                    sourceWidth: sourceSize.width,
                    sourceHeight: sourceSize.height
                }
            )
            canvas.dataset.ready = 'true'
            document.documentElement.dataset.glassScene = 'image'
            markRefractive()
            return true
        } catch {
            canvas.dataset.ready = 'false'
            document.documentElement.dataset.glassRenderer = 'native-fallback'
            setRendererStatus('native-fallback')
            setQuality('frosted')
            return false
        }
    }, [markRefractive])

    const renderSceneFrame = useCallback(() => {
        if (sceneImageRef.current) return
        const canvas = sceneCanvasRef.current
        const renderer = sceneRendererRef.current
        if (!canvas || !renderer || !allowRefractionRef.current || document.hidden) return

        try {
            if (!renderer.captureFramebuffer(canvas.width, canvas.height)) return
            renderer.render(
                getGlassSurfaceFrames('app'),
                { width: Math.max(1, window.innerWidth), height: Math.max(1, window.innerHeight) },
                { width: Math.max(1, canvas.width), height: Math.max(1, canvas.height) },
                {
                    drawBase: false,
                    sourceWidth: Math.max(1, canvas.width),
                    sourceHeight: Math.max(1, canvas.height)
                }
            )
            const compositor = compositorCanvasRef.current
            if (compositor) compositor.dataset.ready = 'false'
            document.documentElement.dataset.glassScene = 'vanta'
            markRefractive()
        } catch {
            document.documentElement.dataset.glassRenderer = 'native-fallback'
            setRendererStatus('native-fallback')
            setQuality('frosted')
        }
    }, [markRefractive])

    const measureAndRender = useCallback(() => {
        if (document.hidden) return
        measureGlassSurfaces()
        const lightX = window.innerWidth * DEFAULT_LIGHT_X
        const lightY = window.innerHeight * DEFAULT_LIGHT_Y

        lightElementsRef.current.forEach((element) => {
            if (element.isConnected) setGlassLight(element, lightX, lightY)
        })

        if (sceneImageRef.current) renderSource(sceneImageRef.current)
    }, [renderSource])

    const requestMeasure = useCallback(() => {
        if (frameRef.current !== null || document.hidden) return
        frameRef.current = window.requestAnimationFrame(() => {
            frameRef.current = null
            measureAndRender()
        })
    }, [measureAndRender])

    const registerLight = useCallback((element: HTMLElement) => {
        lightElementsRef.current.add(element)
        requestMeasure()
        return () => lightElementsRef.current.delete(element)
    }, [requestMeasure])

    const setSceneCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
        sceneRendererRef.current?.destroy()
        sceneRendererRef.current = null
        sceneCanvasRef.current = canvas
        let disposed = false

        if (!canvas) markSceneDormant()

        const installRenderer = () => {
            if (!canvas || disposed) return
            const gl = (
                canvas.getContext('webgl2') ||
                canvas.getContext('webgl') ||
                canvas.getContext('experimental-webgl')
            ) as WebGLRenderingContext | null

            if (!gl) return
            try {
                sceneRendererRef.current?.destroy()
                sceneRendererRef.current = new GlassRefractionRenderer(gl)
                document.documentElement.dataset.glassScene = 'vanta'
                requestMeasure()
            } catch {
                sceneRendererRef.current = null
                document.documentElement.dataset.glassRenderer = 'native-fallback'
                setRendererStatus('native-fallback')
                setQuality('frosted')
            }
        }

        const handleContextLost = (event: Event) => {
            event.preventDefault()
            sceneRendererRef.current = null
            document.documentElement.dataset.glassRenderer = 'native-fallback'
            setRendererStatus('native-fallback')
            setQuality('frosted')
        }
        const handleContextRestored = () => installRenderer()

        if (canvas) {
            canvas.addEventListener('webglcontextlost', handleContextLost)
            canvas.addEventListener('webglcontextrestored', handleContextRestored)
            installRenderer()
        }

        return () => {
            disposed = true
            canvas?.removeEventListener('webglcontextlost', handleContextLost)
            canvas?.removeEventListener('webglcontextrestored', handleContextRestored)
            if (sceneCanvasRef.current !== canvas) return
            sceneRendererRef.current?.destroy()
            sceneRendererRef.current = null
            sceneCanvasRef.current = null
            const compositor = compositorCanvasRef.current
            if (compositor) compositor.dataset.ready = 'false'
            markSceneDormant()
        }
    }, [markSceneDormant, requestMeasure])

    const setSceneImage = useCallback((url: string | null) => {
        const requestId = ++imageRequestRef.current
        if (!url) {
            sceneImageRef.current = null
            const compositor = compositorCanvasRef.current
            if (compositor) compositor.dataset.ready = 'false'
            delete document.documentElement.dataset.glassScene
            markSceneDormant()
            requestMeasure()
            return () => undefined
        }

        const compositor = compositorCanvasRef.current
        if (compositor) compositor.dataset.ready = 'false'
        const image = new Image()
        image.decoding = 'async'
        image.onload = () => {
            if (imageRequestRef.current !== requestId) return
            sceneImageRef.current = image
            renderSource(image)
        }
        image.onerror = () => {
            if (imageRequestRef.current !== requestId) return
            sceneImageRef.current = null
            markSceneDormant()
            requestMeasure()
        }
        image.src = url

        return () => {
            if (imageRequestRef.current !== requestId) return
            imageRequestRef.current += 1
            sceneImageRef.current = null
            const activeCompositor = compositorCanvasRef.current
            if (activeCompositor) activeCompositor.dataset.ready = 'false'
            delete document.documentElement.dataset.glassScene
            markSceneDormant()
            requestMeasure()
        }
    }, [markSceneDormant, renderSource, requestMeasure])

    useEffect(() => {
        const canvas = compositorCanvasRef.current
        if (!canvas) return

        const gl = canvas.getContext('webgl', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: 'high-performance'
        })

        if (!gl) {
            setRendererStatus('native-fallback')
            setQuality('frosted')
            document.documentElement.dataset.glassRenderer = 'native-fallback'
            return
        }

        try {
            staticRendererRef.current = new GlassRefractionRenderer(gl)
            requestMeasure()
        } catch {
            staticRendererRef.current = null
            setRendererStatus('native-fallback')
            setQuality('frosted')
            document.documentElement.dataset.glassRenderer = 'native-fallback'
        }

        const handleContextLost = (event: Event) => {
            event.preventDefault()
            staticRendererRef.current?.destroy()
            staticRendererRef.current = null
            setRendererStatus('native-fallback')
            setQuality('frosted')
            document.documentElement.dataset.glassRenderer = 'native-fallback'
        }

        const handleContextRestored = () => {
            try {
                staticRendererRef.current?.destroy()
                staticRendererRef.current = new GlassRefractionRenderer(gl)
                if (sceneImageRef.current) renderSource(sceneImageRef.current)
            } catch {
                staticRendererRef.current = null
            }
        }

        canvas.addEventListener('webglcontextlost', handleContextLost)
        canvas.addEventListener('webglcontextrestored', handleContextRestored)
        return () => {
            canvas.removeEventListener('webglcontextlost', handleContextLost)
            canvas.removeEventListener('webglcontextrestored', handleContextRestored)
            staticRendererRef.current?.destroy()
            staticRendererRef.current = null
        }
    }, [renderSource, requestMeasure])

    useEffect(() => {
        const transparencyQuery = window.matchMedia('(prefers-reduced-transparency: reduce)')
        const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
        const connection = (navigator as NavigatorWithConnection).connection

        const detectPreferences = () => {
            const supportsBackdrop =
                CSS.supports('backdrop-filter', 'blur(1px)') ||
                CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
            const hasActiveSource = Boolean(
                sceneImageRef.current ||
                (sceneCanvasRef.current && sceneRendererRef.current)
            )
            setReducedMotion(motionQuery.matches)
            allowRefractionRef.current = !transparencyQuery.matches && !connection?.saveData

            if (transparencyQuery.matches) {
                setQuality('solid')
                setRendererStatus('solid')
                document.documentElement.dataset.glassRenderer = 'solid'
            } else if (!allowRefractionRef.current || !hasActiveSource) {
                setQuality(supportsBackdrop ? 'frosted' : 'solid')
                setRendererStatus(supportsBackdrop ? 'native-fallback' : 'solid')
                document.documentElement.dataset.glassRenderer = supportsBackdrop ? 'native-fallback' : 'solid'
            } else {
                // A successful scene pass owns the shared-webgl transition.
                requestMeasure()
            }
        }

        detectPreferences()
        transparencyQuery.addEventListener('change', detectPreferences)
        motionQuery.addEventListener('change', detectPreferences)
        connection?.addEventListener('change', detectPreferences)

        return () => {
            transparencyQuery.removeEventListener('change', detectPreferences)
            motionQuery.removeEventListener('change', detectPreferences)
            connection?.removeEventListener('change', detectPreferences)
        }
    }, [requestMeasure])

    useEffect(() => {
        document.documentElement.dataset.glassQuality = quality
        document.documentElement.dataset.glassMotion = reducedMotion ? 'reduced' : 'full'
    }, [quality, reducedMotion])

    useEffect(() => {
        const unregisterSubscription = subscribeGlassSurfaces(requestMeasure, 'app')
        const handleViewportChange = () => requestMeasure()
        const handleVisibilityChange = () => {
            if (!document.hidden) requestMeasure()
        }

        window.addEventListener('resize', handleViewportChange, { passive: true })
        window.addEventListener('orientationchange', handleViewportChange, { passive: true })
        window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true })
        document.addEventListener('visibilitychange', handleVisibilityChange)

        return () => {
            unregisterSubscription()
            window.removeEventListener('resize', handleViewportChange)
            window.removeEventListener('orientationchange', handleViewportChange)
            window.removeEventListener('scroll', handleViewportChange, true)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
        }
    }, [requestMeasure])

    useEffect(() => {
        let scanFrame: number | null = null
        const registrations = legacyRegistrationsRef.current

        const scanLegacySurfaces = () => {
            scanFrame = null
            const found = new Set<HTMLElement>()
            document.querySelectorAll<HTMLElement>(LEGACY_GLASS_SELECTOR).forEach((element) => {
                if (element.dataset.glassSurface === 'tahoe-v3') return
                found.add(element)
                if (registrations.has(element)) return
                const unregister = registerGlassSurface(element, legacyMaterial(element))
                registrations.set(element, unregister)
            })

            registrations.forEach((unregister, element) => {
                if (found.has(element) && element.isConnected) return
                unregister()
                registrations.delete(element)
            })
            requestMeasure()
        }

        const scheduleScan = () => {
            if (scanFrame !== null) return
            scanFrame = window.requestAnimationFrame(scanLegacySurfaces)
        }

        scheduleScan()
        const observer = new MutationObserver(scheduleScan)
        observer.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'data-glass-auto', 'data-glass-backend', 'data-glass-variant']
        })

        return () => {
            observer.disconnect()
            if (scanFrame !== null) window.cancelAnimationFrame(scanFrame)
            registrations.forEach((unregister) => unregister())
            registrations.clear()
        }
    }, [requestMeasure])

    const value = useMemo<GlassEnvironmentValue>(() => ({
        quality,
        rendererStatus,
        reducedMotion,
        registerLight,
        requestMeasure,
        setSceneCanvas,
        renderSceneFrame,
        setSceneImage
    }), [
        quality,
        rendererStatus,
        reducedMotion,
        registerLight,
        requestMeasure,
        setSceneCanvas,
        renderSceneFrame,
        setSceneImage
    ])

    return (
        <GlassEnvironmentContext.Provider value={value}>
            <canvas
                ref={compositorCanvasRef}
                className="glass-scene-compositor"
                data-ready="false"
                aria-hidden="true"
            />
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
