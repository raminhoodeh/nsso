'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTahoeGlassControls, useTahoeGlassDiagnostics } from '@/components/providers/TahoeGlassProvider'
import { VantaPerformanceManager, BackgroundPhase } from '@/lib/vanta/VantaPerformanceManager'
import { VantaVideoRecorder } from '@/lib/vanta/VantaVideoRecorder'

// Vanta.js type declarations
declare global {
    interface Window {
        VANTA: {
            CLOUDS: (config: VantaConfig) => VantaEffect
        }
        THREE: any
    }

}

interface VantaConfig {
    el: HTMLElement | null
    mouseControls: boolean
    touchControls: boolean
    gyroControls: boolean
    minHeight: number
    minWidth: number
    backgroundColor: number
    skyColor: number
    cloudColor: number
    cloudShadowColor: number
    sunColor: number
    sunGlareColor: number
    sunlightColor: number
    speed: number
    scale: number
    scaleMobile: number
    // Performance optimizations (approach #1)
    points?: number
    spacing?: number
    maxDistance?: number
}

interface VantaShaderMaterial {
    fragmentShader?: string
    needsUpdate?: boolean
}

interface VantaSceneNode {
    material?: VantaShaderMaterial | VantaShaderMaterial[]
}

interface VantaEffect {
    destroy: () => void
    resize?: () => void
    afterRender?: () => void
    getCanvasElement?: () => HTMLCanvasElement | undefined
    options?: any
    setOptions?: (options: Partial<VantaConfig>) => void
    animationLoop?: () => number
    prevNow?: number
    req?: number
    renderer?: any
    scene?: {
        children?: VantaSceneNode[]
    }
}

const VANTA_HORIZON_OFFSET = 1.25
const VANTA_HORIZON_PATCH = `p.y += ${VANTA_HORIZON_OFFSET.toFixed(2)};`
const VANTA_SCREEN_COORDINATE_PATTERN =
    /vec2\s+p\s*=\s*\(-iResolution\.xy\s*\+\s*2\.0\s*\*\s*gl_FragCoord\.xy\)\s*\/\s*iResolution\.y\s*;/

/**
 * Vanta CLOUDS 0.5.24 has no public horizon control. Patch its pinned shader
 * coordinate once so the cloud bank stays low in the viewport without being
 * pinned to the bottom edge or washing out profile text.
 * The canvas remains the single source for both SVG and WebGL refraction.
 */
function lowerVantaCloudHorizon(effect: VantaEffect): boolean {
    for (const child of effect.scene?.children ?? []) {
        const materials = Array.isArray(child.material)
            ? child.material
            : child.material
                ? [child.material]
                : []

        for (const material of materials) {
            const shader = material.fragmentShader
            if (!shader) continue
            if (shader.includes(VANTA_HORIZON_PATCH)) return true
            if (!VANTA_SCREEN_COORDINATE_PATTERN.test(shader)) continue

            material.fragmentShader = shader.replace(
                VANTA_SCREEN_COORDINATE_PATTERN,
                (coordinateDeclaration) =>
                    `${coordinateDeclaration}\n    ${VANTA_HORIZON_PATCH}`,
            )
            material.needsUpdate = true
            return true
        }
    }

    return false
}

interface VantaBackgroundProps {
    onCanvasChange?: (canvas: HTMLCanvasElement | null) => void
}

export default function VantaBackground({ onCanvasChange }: VantaBackgroundProps) {
    const pathname = usePathname()
    const { backend, status, reducedMotion } = useTahoeGlassDiagnostics()
    const {
        consumeSceneFrameRequest,
        renderNow,
        retryBackend,
        subscribeSceneFrameRequests,
    } = useTahoeGlassControls()

    const vantaRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const vantaEffect = useRef<VantaEffect | null>(null)
    const performanceManager = useRef<VantaPerformanceManager | null>(null)
    const videoRecorder = useRef<VantaVideoRecorder | null>(null)
    const backendRef = useRef(backend)
    const statusRef = useRef(status)
    const reducedMotionRef = useRef(reducedMotion)
    const consumeSceneFrameRequestRef = useRef(consumeSceneFrameRequest)
    const renderNowRef = useRef(renderNow)
    const retryBackendRef = useRef(retryBackend)
    const onCanvasChangeRef = useRef(onCanvasChange)
    const pausedForReducedMotionRef = useRef(false)

    useEffect(() => {
        backendRef.current = backend
        statusRef.current = status
        reducedMotionRef.current = reducedMotion
        consumeSceneFrameRequestRef.current = consumeSceneFrameRequest
        renderNowRef.current = renderNow
        retryBackendRef.current = retryBackend
        onCanvasChangeRef.current = onCanvasChange
    }, [backend, consumeSceneFrameRequest, onCanvasChange, reducedMotion, renderNow, retryBackend, status])

    const resumeVanta = useCallback(() => {
        const effect = vantaEffect.current
        if (!effect?.animationLoop || !pausedForReducedMotionRef.current) return
        pausedForReducedMotionRef.current = false
        // Clearing prevNow makes Vanta's next loop render the existing scene
        // without advancing either of its animation clocks.
        effect.prevNow = undefined
        effect.animationLoop()
    }, [])

    useEffect(() => subscribeSceneFrameRequests(() => {
        if (reducedMotionRef.current && backendRef.current === 'webgl') {
            resumeVanta()
        }
    }), [resumeVanta, subscribeSceneFrameRequests])

    const [, setCurrentPhase] = useState<BackgroundPhase>('webgl')
    const [isRollback, setIsRollback] = useState(false)

    // Check rollback mode on mount
    useEffect(() => {
        if (typeof window === 'undefined') return

        const urlParams = new URLSearchParams(window.location.search)
        const rollbackFromUrl = urlParams.get('vanta_rollback') === 'true'
        const rollbackFromStorage = localStorage.getItem('nsso_vanta_rollback') === 'true'

        if (rollbackFromUrl || rollbackFromStorage) {
            setIsRollback(true)
            console.warn('⚠️ Vanta optimization disabled (rollback mode)')
        }
    }, [])

    // Initialize Vanta
    useEffect(() => {
        // Skip if elements not ready
        if (!vantaRef.current) return
        let initTimer: number | null = null
        const loadListeners: Array<{
            script: HTMLScriptElement
            listener: () => void
        }> = []

        const listenForScript = (script: HTMLScriptElement, listener: () => void) => {
            script.addEventListener('load', listener, { once: true })
            loadListeners.push({ script, listener })
        }

        const initVanta = () => {
            if (initTimer !== null) return
            // Add a small delay to ensure DOM is ready and dimensions are calculated
            initTimer = window.setTimeout(() => {
                initTimer = null
                if (!vantaRef.current) return

                // If effect is already active, don't re-init
                if (vantaEffect.current) return

                console.log('[Vanta] Initializing...', {
                    hasVanta: !!window.VANTA,
                    hasThree: !!window.THREE,
                    ref: vantaRef.current
                })

                if (window.VANTA && window.THREE) {
                    try {
                        const effect = window.VANTA.CLOUDS({
                            el: vantaRef.current,
                            // Preserve pointer parallax unless the visitor has
                            // requested reduced motion. The shader horizon patch
                            // below remains independent from Vanta's input camera.
                            mouseControls: !reducedMotionRef.current,
                            touchControls: !reducedMotionRef.current,
                            gyroControls: false,
                            minHeight: window.innerHeight * 0.75,
                            minWidth: window.innerWidth * 0.75,
                            backgroundColor: 0x586E91,
                            skyColor: 0x586E91,
                            cloudColor: 0xadcdde,
                            cloudShadowColor: 0x183550,
                            sunColor: 0xff9919,
                            sunGlareColor: 0xff6633,
                            sunlightColor: 0xff9933,
                            speed: 0.5,
                            // The host already renders at 75% and scales to the
                            // viewport. Matching shader scale to the forced 1x
                            // drawing buffer keeps gl_FragCoord/iResolution exact.
                            scale: 1,
                            scaleMobile: 1,
                            points: 3,
                            spacing: 20,
                            maxDistance: 15
                        })

                        if (!lowerVantaCloudHorizon(effect)) {
                            console.warn(
                                '[Vanta] The pinned CLOUDS shader horizon patch did not match',
                            )
                        }
                        vantaEffect.current = effect

                        effect.afterRender = () => {
                            if (backendRef.current === 'webgl') {
                                const frameRequested = consumeSceneFrameRequestRef.current()
                                if (
                                    !reducedMotionRef.current ||
                                    frameRequested ||
                                    statusRef.current !== 'active'
                                ) {
                                    renderNowRef.current()
                                }
                            }
                            if (reducedMotionRef.current) {
                                queueMicrotask(() => {
                                    if (
                                        reducedMotionRef.current &&
                                        vantaEffect.current === effect &&
                                        typeof effect.req === 'number'
                                    ) {
                                        window.cancelAnimationFrame(effect.req)
                                        pausedForReducedMotionRef.current = true
                                    }
                                })
                            }
                        }

                        // Keep a 1:1 drawing buffer on every Vanta resize. Vanta's
                        // stock resize path otherwise restores devicePixelRatio,
                        // which would desynchronize gl_FragCoord from iResolution
                        // and move the art-directed horizon on Retina displays.
                        if (
                            effect.renderer &&
                            typeof effect.renderer.setPixelRatio === 'function'
                        ) {
                            const setPixelRatio =
                                effect.renderer.setPixelRatio.bind(effect.renderer)
                            effect.renderer.setPixelRatio = () => setPixelRatio(1)
                            effect.renderer.setPixelRatio(1)
                        }

                        const canvas = effect.getCanvasElement?.() ??
                            effect.renderer?.domElement ??
                            vantaRef.current.querySelector('canvas')
                        if (canvas instanceof HTMLCanvasElement) {
                            canvasRef.current = canvas
                            onCanvasChangeRef.current?.(canvas)
                            // The Tahoe renderer already polls for this canvas
                            // while it initializes. Restart only after a real
                            // fallback so iOS does not discard and recreate an
                            // in-flight WebGL context as Vanta becomes ready.
                            if (
                                statusRef.current === 'fallback' ||
                                statusRef.current === 'failed'
                            ) {
                                retryBackendRef.current()
                            }
                        }

                        console.log('[Vanta] Initialization success')
                    } catch (error) {
                        console.error('[Vanta] Initialization failed:', error)
                    }

                    // Optimization remains disabled until video recording is validated.
                } else {
                    console.warn('[Vanta] Scripts missing during init', { VANTA: !!window.VANTA, THREE: !!window.THREE })
                }
            }, 50)
        }

        const loadVantaScript = () => {
            if (window.VANTA) {
                initVanta()
                return
            }

            // Check if script is already loading
            const existingScript = document.querySelector('script[src*="vanta.clouds.min.js"]')
            if (existingScript instanceof HTMLScriptElement) {
                // If script exists but VANTA is missing, it might be loading or failed.
                // We'll attach a listener just in case it's still loading.
                listenForScript(existingScript, initVanta)
                return
            }

            const vantaScript = document.createElement('script')
            vantaScript.src = 'https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.clouds.min.js'
            vantaScript.async = true
            listenForScript(vantaScript, initVanta)
            document.body.appendChild(vantaScript)
        }

        const loadThreeScript = () => {
            if (window.THREE) {
                loadVantaScript()
                return
            }

            // Check if script is already loading
            const existingScript = document.querySelector('script[src*="three.min.js"]')
            if (existingScript instanceof HTMLScriptElement) {
                listenForScript(existingScript, loadVantaScript)
                return
            }

            const threeScript = document.createElement('script')
            threeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js'
            threeScript.async = true
            listenForScript(threeScript, loadVantaScript)
            document.body.appendChild(threeScript)
        }

        loadThreeScript()


        return () => {
            if (initTimer !== null) window.clearTimeout(initTimer)
            for (const { script, listener } of loadListeners) {
                script.removeEventListener('load', listener)
            }
            onCanvasChangeRef.current?.(null)
            pausedForReducedMotionRef.current = false
            canvasRef.current = null
            if (vantaEffect.current) {
                vantaEffect.current.afterRender = undefined
                vantaEffect.current.destroy()
                vantaEffect.current = null
            }
            if (performanceManager.current) {
                performanceManager.current.destroy()
            }
            if (videoRecorder.current) {
                videoRecorder.current.destroy()
            }
            // Cleanup scripts? Usually not necessary or safe as other components might need them, 
            // but in a SPA we usually leave them. Vanta destroy handles the canvas.
        }
    // Recreate when reduced-motion changes so its RAF lifecycle is restarted
    // from a clean, deterministic frame.
    }, [isRollback, reducedMotion])

    // Initialize optimization system
    function initializeOptimization() {
        if (!vantaEffect.current) return

        // Find canvas element created by Vanta
        const canvas = vantaRef.current?.querySelector('canvas')
        if (!canvas) {
            console.warn('[Vanta] Canvas not found, skipping optimization')
            return
        }
        canvasRef.current = canvas as HTMLCanvasElement

        // Create video element
        const video = document.createElement('video')
        video.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            object-fit: cover;
            z-index: -1;
            display: none;
        `
        video.muted = true
        video.playsInline = true
        video.loop = true
        document.body.appendChild(video)
        videoRef.current = video

        // Initialize performance manager
        performanceManager.current = new VantaPerformanceManager(
            vantaEffect.current,
            handlePhaseChange
        )

        // Initialize video recorder
        videoRecorder.current = new VantaVideoRecorder(
            canvasRef.current,
            video
        )

        // Start recording after 2s (give Vanta time to initialize)
        setTimeout(() => {
            if (videoRecorder.current) {
                videoRecorder.current.record({
                    duration: 10000, // 10 second loop
                    fps: 30
                })
            }
        }, 2000)

        console.log('[Vanta] Optimization initialized')
    }

    // Handle phase changes
    const handlePhaseChange = (phase: BackgroundPhase) => {
        setCurrentPhase(phase)

        switch (phase) {
            case 'video':
                // Hide WebGL canvas, show video
                if (canvasRef.current) {
                    canvasRef.current.style.display = 'none'
                }
                if (videoRef.current) {
                    videoRef.current.style.display = 'block'
                    videoRecorder.current?.play()
                }
                break

            case 'webgl':
                // Show WebGL canvas, hide video
                if (canvasRef.current) {
                    canvasRef.current.style.display = 'block'
                }
                if (videoRef.current) {
                    videoRef.current.style.display = 'none'
                    videoRecorder.current?.pause()
                }
                break

            case 'static':
                // Hide everything, show gradient fallback
                if (canvasRef.current) {
                    canvasRef.current.style.display = 'none'
                }
                if (videoRef.current) {
                    videoRef.current.style.display = 'none'
                }
                // Static gradient will show through (defined below)
                break
        }
    }

    // Handle visibility changes and resize when pathname changes
    useEffect(() => {
        if (vantaEffect.current) {
            // Force resize when becoming visible
            setTimeout(() => {
                if (vantaEffect.current?.resize) {
                    vantaEffect.current.resize()
                }
                // Trigger window resize event as fallback
                window.dispatchEvent(new Event('resize'))
            }, 100)
        }
    }, [pathname])


    // Always render static gradient as fallback (sits beneath everything)
    return (
        <>
            {/* Static gradient fallback (always present, lowest z-index) */}
            <div
                className="fixed inset-0 bg-gradient-to-br from-[#586E91] via-[#adcdde] to-[#183550]"
                style={{
                    display: 'block',
                    zIndex: -2
                }}
            />

            {/* Vanta WebGL container (managed by Vanta and performance manager) */}
            <div
                ref={vantaRef}
                id="vanta-bg"
                style={{
                    display: 'block',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    // Approach #4: Render at 75%, scale to 100%
                    width: '75vw',
                    height: '75vh',
                    transform: 'scale(1.3333333333)',
                    transformOrigin: 'top left',
                    // Approach #5: GPU acceleration hints
                    willChange: 'transform',
                    backfaceVisibility: 'hidden' as const,
                    zIndex: -1
                }}
            />


        </>
    )
}
