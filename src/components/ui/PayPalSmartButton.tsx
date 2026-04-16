'use client'

import { useEffect, useRef, useState } from 'react'

interface PayPalSmartButtonProps {
    html: string
    isPlatformOwner?: boolean
    price?: string
    productName?: string
    successUrl?: string
}

declare global {
    interface Window {
        paypal: any;
        __paypal_script_promise__?: Promise<unknown>;
    }
}

export default function PayPalSmartButton({ 
    html, 
    isPlatformOwner = false,
}: PayPalSmartButtonProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [isSdkReady, setIsSdkReady] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Ensure html is a string to prevent crashes if data is malformed
    const safeHtml = typeof html === 'string' ? html : ''

    // 1. Smart Extraction: Look for Hosted Button ID
    // Matches: hostedButtonId: "XYZ" or 'XYZ'
    const idMatch = safeHtml.match(/hostedButtonId:\s*["']([A-Z0-9]+)["']/)
    const hostedButtonId = idMatch ? idMatch[1] : null

    // 2. Load SDK Effect (only needed for hosted buttons)
    useEffect(() => {
        if (!hostedButtonId) return

        // If SDK is already loaded and available
        if (typeof window !== 'undefined' && window.paypal?.HostedButtons) {
            setIsSdkReady(true)
            return
        }

        // Singleton loader pattern to prevent multiple script injections (Race Condition Fix)
        if (!window.__paypal_script_promise__) {
            window.__paypal_script_promise__ = new Promise((resolve, reject) => {
                // If script tag already exists (from another component or previous session), wait for it
                if (document.querySelector('script[src*="paypal.com/sdk/js"]')) {
                    const interval = setInterval(() => {
                        if (window.paypal?.HostedButtons) {
                            clearInterval(interval)
                            resolve(true)
                        }
                    }, 200)
                    setTimeout(() => {
                        clearInterval(interval)
                    }, 10000)
                    return
                }

                const script = document.createElement('script')
                const clientId = isPlatformOwner 
                    ? (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'ba') 
                    : 'ba'
                
                script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&components=hosted-buttons&currency=GBP&enable-funding=applepay`
                script.async = true
                script.onload = () => resolve(true)
                script.onerror = (err) => {
                    console.error("PayPal SDK Loading Error:", err)
                    reject(err)
                }
                document.body.appendChild(script)
            })
        }

        window.__paypal_script_promise__
            .then(() => setIsSdkReady(true))
            .catch(err => {
                console.error("PayPal SDK failed to load globally:", err)
                setError("Payment system unavailable")
            })

    }, [hostedButtonId, isPlatformOwner])

    // 3. Render Hosted Button Effect
    useEffect(() => {
        if (!hostedButtonId || !isSdkReady || !window.paypal?.HostedButtons || !containerRef.current) return

        // Clear container first
        containerRef.current.innerHTML = ''

        try {
            const renderPromise = window.paypal.HostedButtons({
                hostedButtonId: hostedButtonId,
            }).render(containerRef.current)

            if (renderPromise && renderPromise.catch) {
                renderPromise.catch((err: any) => {
                    console.error("PayPal button render failed (async):", err)
                    if (containerRef.current) {
                        containerRef.current.innerHTML = '<div class="text-red-500 text-xs">Button Error</div>'
                    }
                })
            }
        } catch (err) {
            console.error("PayPal Smart Render Error (sync):", err)
            if (containerRef.current) {
                containerRef.current.innerHTML = '<div class="text-red-500 text-xs">Button Error</div>'
            }
        }

    }, [hostedButtonId, isSdkReady])

    if (error) {
        return <div className="text-red-400 text-xs text-center py-2">{error}</div>
    }

    // SCENARIO A: Found a Hosted Button ID (The "Smart" Path)
    if (hostedButtonId) {
        return (
            <div
                ref={containerRef}
                className="w-full flex justify-center items-center z-10 relative min-h-[50px]"
            />
        )
    }

    // SCENARIO B: Form-based PayPal button (e.g. NCP payment forms)
    if (safeHtml.includes('<form')) {
        return (
            <div
                className="w-full flex justify-center"
                dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
        )
    }

    // SCENARIO C: Junk text -> Render Nothing
    return null
}
