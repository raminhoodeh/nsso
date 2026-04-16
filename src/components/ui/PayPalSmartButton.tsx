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

function parsePrice(priceStr: string) {
    if (!priceStr) return { currency: 'GBP', value: '0.00' }
    let currency = 'GBP'
    if (priceStr.includes('$')) currency = 'USD'
    if (priceStr.includes('€')) currency = 'EUR'
    
    // Extract numerical value
    const numericStr = priceStr.replace(/[^0-9.]/g, '')
    const value = parseFloat(numericStr)
    
    return { 
        currency, 
        value: isNaN(value) ? '0.00' : value.toFixed(2) 
    }
}

export default function PayPalSmartButton({ 
    html, 
    isPlatformOwner = false,
    price,
    productName,
    successUrl
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

    // 2. Load SDK Effect
    useEffect(() => {
        // If we don't have enough info to render anything (no hosted button AND no platform owner price), abort
        if (!hostedButtonId && !(isPlatformOwner && price)) return

        // If SDK is already loaded and available
        if (typeof window !== 'undefined' && window.paypal?.Buttons) {
            setIsSdkReady(true)
            return
        }

        // Singleton loader pattern to prevent multiple script injections (Race Condition Fix)
        if (!window.__paypal_script_promise__) {
            window.__paypal_script_promise__ = new Promise((resolve, reject) => {
                // If script tag already exists (from another component or previous session), wait for it
                if (document.querySelector('script[src*="paypal.com/sdk/js"]')) {
                    const interval = setInterval(() => {
                        if (window.paypal?.Buttons) {
                            clearInterval(interval)
                            resolve(true)
                        }
                    }, 200)
                    // Timeout after 10 seconds to avoid infinite polling
                    setTimeout(() => {
                        clearInterval(interval)
                    }, 10000)
                    return
                }

                const script = document.createElement('script')
                // Using 'ba' as client-id as found in original code, but 'sb' (sandbox) is safer default if 'ba' is invalid.
                // Conditionally load SDK based on ownership to avoid cross-merchant errors
                const clientId = isPlatformOwner 
                    ? (process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'ba') 
                    : 'ba'
                
                const fundingString = isPlatformOwner ? '&enable-funding=applepay' : ''
                
                script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&components=hosted-buttons,applepay,googlepay,buttons${fundingString}`
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

    }, [hostedButtonId, isPlatformOwner, price])

    // 3. Render Button Effect
    useEffect(() => {
        if (!isSdkReady || !window.paypal || !containerRef.current) return
        
        // Ensure we have something to render
        if (!hostedButtonId && !(isPlatformOwner && price)) return

        // Clear container first
        containerRef.current.innerHTML = ''

        try {
            if (isPlatformOwner && price && window.paypal.Buttons) {
                // MODERN ADVANCED CHECKOUT (Apple Pay Supported)
                const { value, currency } = parsePrice(price)
                
                const renderPromise = window.paypal.Buttons({
                    createOrder: (data: any, actions: any) => {
                        return actions.order.create({
                            purchase_units: [{
                                description: productName || 'Digital Product',
                                amount: {
                                    currency_code: currency,
                                    value: value
                                }
                            }]
                        });
                    },
                    onApprove: (data: any, actions: any) => {
                        return actions.order.capture().then(function(details: any) {
                            if (successUrl) {
                                window.location.href = successUrl;
                            } else {
                                alert("Transaction completed successfully!");
                            }
                        });
                    },
                    onError: (err: any) => {
                        console.error("PayPal Advanced Checkout Error:", err);
                        setError("Payment process encountered an error.");
                    }
                }).render(containerRef.current)

                if (renderPromise && renderPromise.catch) {
                    renderPromise.catch((err: any) => {
                        console.error("PayPal Advanced Checkout render failed:", err)
                        if (containerRef.current) {
                            containerRef.current.innerHTML = '<div class="text-red-500 text-xs">Button Error</div>'
                        }
                    })
                }

            } else if (hostedButtonId && window.paypal.HostedButtons) {
                // LEGACY HOSTED BUTTON FALLBACK
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
            }
        } catch (err) {
            console.error("PayPal Smart Render Error (sync):", err)
            if (containerRef.current) {
                containerRef.current.innerHTML = '<div class="text-red-500 text-xs">Button Error</div>'
            }
        }

    }, [hostedButtonId, isSdkReady, isPlatformOwner, price, productName, successUrl])

    if (error) {
        return <div className="text-red-400 text-xs text-center py-2">{error}</div>
    }

    // SCENARIO A: Found a Hosted Button ID OR Rendering Advanced Checkout (The "Smart" Path)
    if (hostedButtonId || (isPlatformOwner && price)) {
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
