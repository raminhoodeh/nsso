'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
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
    // Performance optimizations (approach #1)
    points?: number
    spacing?: number
    maxDistance?: number
}

interface VantaEffect {
    destroy: () => void
    resize?: () => void
    options?: any
    setOptions?: (options: Partial<VantaConfig>) => void
}

export default function VantaBackground() {
    const pathname = usePathname()

    // Hide background on specific pages
    // Hide background on specific pages
    // Hide background on specific pages
    const hiddenPaths = ['/earnings']

    // Also hiding on dashboard product creator pages specifically
    const shouldHide = hiddenPaths.some(path => pathname?.startsWith(path)) ||
        (pathname?.startsWith('/dashboard/products/') && pathname?.endsWith('/creator'))

    const vantaRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const videoRef = useRef<HTMLVideoElement | null>(null)
    const vantaEffect = useRef<VantaEffect | null>(null)
    const performanceManager = useRef<VantaPerformanceManager | null>(null)
    const videoRecorder = useRef<VantaVideoRecorder | null>(null)

    const [currentPhase, setCurrentPhase] = useState<BackgroundPhase>('webgl')
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
        // If we should hide the background, do not initialize (cleanup will handle destroy if needed)
        if (shouldHide) return

        // Skip if elements not ready
        if (!vantaRef.current) return

        const initVanta = () => {
            // Double check if we should hide (in case it changed while loading)
            if (shouldHide) return

            // Add a small delay to ensure DOM is ready and dimensions are calculated
            setTimeout(() => {
                if (!vantaRef.current || shouldHide) return

                // If effect is already active, don't re-init
                if (vantaEffect.current) return

                console.log('[Vanta] Initializing...', {
                    hasVanta: !!window.VANTA,
                    hasThree: !!window.THREE,
                    ref: vantaRef.current
                })

                if (window.VANTA && window.THREE) {
                    try {
                        vantaEffect.current = window.VANTA.CLOUDS({
                            el: vantaRef.current,
                            mouseControls: true,
                            touchControls: true,
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
                            points: 5,
                            spacing: 18,
                            maxDistance: 15
                        })

                        // PERF: Force 1:1 pixel ratio on High-DPI (Retina) screens.
                        // This reduces GPU load by 4x on MacBooks without visible quality loss for this specific effect.
                        if (vantaEffect.current.renderer) {
                            vantaEffect.current.renderer.setPixelRatio(1.0)
                        }

                        console.log('[Vanta] Initialization success')
                    } catch (error) {
                        console.error('[Vanta] Initialization failed:', error)
                    }

                    // Initialize optimization ONLY if not in rollback mode
                    // TEMPORARILY DISABLED: Video recording needs more testing
                    if (false && !isRollback && vantaEffect.current) {
                        initializeOptimization()
                    }
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
            if (existingScript) {
                // If script exists but VANTA is missing, it might be loading or failed.
                // We'll attach a listener just in case it's still loading.
                existingScript.addEventListener('load', initVanta)
                return
            }

            const vantaScript = document.createElement('script')
            vantaScript.src = 'https://cdn.jsdelivr.net/npm/vanta/dist/vanta.clouds.min.js'
            vantaScript.async = true
            vantaScript.onload = initVanta
            document.body.appendChild(vantaScript)
        }

        const loadThreeScript = () => {
            if (window.THREE) {
                loadVantaScript()
                return
            }

            // Check if script is already loading
            const existingScript = document.querySelector('script[src*="three.min.js"]')
            if (existingScript) {
                existingScript.addEventListener('load', loadVantaScript)
                return
            }

            const threeScript = document.createElement('script')
            threeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js'
            threeScript.async = true
            threeScript.onload = loadVantaScript
            document.body.appendChild(threeScript)
        }

        loadThreeScript()


        return () => {
            if (vantaEffect.current) {
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
    }, [isRollback, shouldHide])

    // Initialize optimization system
    const initializeOptimization = () => {
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
        // If hidden, we don't care about resize as component effect is destroyed
        if (shouldHide) return

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
    }, [pathname, shouldHide])


    // Always render static gradient as fallback (sits beneath everything)
    return (
        <>
            {/* Static gradient fallback (always present, lowest z-index) */}
            <div
                className="fixed inset-0 bg-gradient-to-br from-[#586E91] via-[#adcdde] to-[#183550]"
                style={{
                    display: shouldHide ? 'none' : 'block',
                    zIndex: -2
                }}
            />

            {/* Vanta WebGL container (managed by Vanta and performance manager) */}
            <div
                ref={vantaRef}
                id="vanta-bg"
                style={{
                    display: shouldHide ? 'none' : 'block',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    // Approach #4: Render at 75%, scale to 100%
                    width: '75vw',
                    height: '75vh',
                    transform: 'scale(1.33)',
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
