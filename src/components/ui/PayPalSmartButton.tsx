'use client'

import { useEffect, useRef, useState } from 'react'

interface PayPalSmartButtonProps {
    html: string
}

declare global {
    interface Window {
        paypal: any;
        __paypal_script_promise__?: Promise<unknown>;
    }
}

export default function PayPalSmartButton({ html }: PayPalSmartButtonProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [isSdkReady, setIsSdkReady] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Ensure html is a string to prevent crashes if data is malformed
    const safeHtml = typeof html === 'string' ? html : ''

    // 1. Smart Extraction: Look for Hosted Button ID
    // Matches: hostedButtonId: "XYZ" or 'XYZ'
    const idMatch = safeHtml.match(/hostedButtonId:\s*["']([A-Z0-9]+)["']/)
    const hostedButtonId = idMatch ? idMatch[1] : null

    // 2. Load SDK Effect
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
                    // Timeout after 10 seconds to avoid infinite polling
                    setTimeout(() => {
                        clearInterval(interval)
                        // Don't reject, just let it fail silently or try to continue
                        // resolve(false) 
                    }, 10000)
                    return
                }

                const script = document.createElement('script')
                // Using 'ba' as client-id as found in original code, but 'sb' (sandbox) is safer default if 'ba' is invalid.
                // Keeping 'ba' effectively but adding error handling.
                script.src = "https://www.paypal.com/sdk/js?client-id=ba&components=hosted-buttons"
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

    }, [hostedButtonId])

    // 3. Render Button Effect
    useEffect(() => {
        if (!hostedButtonId || !isSdkReady || !window.paypal?.HostedButtons || !containerRef.current) return

        // Clear container first
        containerRef.current.innerHTML = ''

        try {
            const renderPromise = window.paypal.HostedButtons({
                hostedButtonId: hostedButtonId,
            }).render(containerRef.current)

            // .render() returns a Promise, we should catch its rejections too
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

    // SCENARIO B: No ID found, maybe it's a legacy <form> button?
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
