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

    // Determine Mode
    const useAdvancedCheckout = isPlatformOwner && Boolean(successUrl) && Boolean(price)

    // 2. Load SDK Effect
    useEffect(() => {
        // Only load SDK if we have a hosted button OR are using advanced checkout
        if (!hostedButtonId && !useAdvancedCheckout) return

        // If SDK is already loaded and available
        if (typeof window !== 'undefined') {
            if (useAdvancedCheckout && window.paypal?.Buttons) {
                setIsSdkReady(true)
                return
            } else if (!useAdvancedCheckout && window.paypal?.HostedButtons) {
                setIsSdkReady(true)
                return
            }
        }

        // Singleton loader pattern to prevent multiple script injections (Race Condition Fix)
        if (!window.__paypal_script_promise__) {
            window.__paypal_script_promise__ = new Promise((resolve, reject) => {
                // If script tag already exists (from another component or previous session), wait for it
                if (document.querySelector('script[src*="paypal.com/sdk/js"]')) {
                    const interval = setInterval(() => {
                        if (useAdvancedCheckout && window.paypal?.Buttons) {
                            clearInterval(interval)
                            resolve(true)
                        } else if (!useAdvancedCheckout && window.paypal?.HostedButtons) {
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
                
                // If Advanced Checkout, load buttons. Otherwise load hosted-buttons.
                const components = useAdvancedCheckout ? 'buttons' : 'hosted-buttons'
                script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&components=${components}&currency=GBP&enable-funding=applepay`
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

    }, [hostedButtonId, isPlatformOwner, useAdvancedCheckout])

    // 3. Render Instance Effect
    useEffect(() => {
        if (!isSdkReady || !window.paypal || !containerRef.current) return
        if (!hostedButtonId && !useAdvancedCheckout) return

        // Clear container first
        containerRef.current.innerHTML = ''

        try {
            if (useAdvancedCheckout && window.paypal.Buttons) {
                // MODERN ADVANCED CHECKOUT (Apple Pay Supported via DB Redirect)
                const { value, currency } = parsePrice(price || '0')
                
                const renderPromise = window.paypal.Buttons({
                    style: {
                        layout: 'vertical',
                        color: 'gold',
                        shape: 'rect',
                        label: 'pay',
                        height: 55,
                        tagline: false
                    },
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
                            }
                        });
                    },
                    onError: (err: any) => {
                        console.error("PayPal Advanced Checkout Error:", err);
                        // Let users retry natively
                    }
                }).render(containerRef.current)

                if (renderPromise && renderPromise.catch) {
                    renderPromise.catch((err: any) => {
                        console.error("PayPal Advanced Checkout render failed:", err)
                        if (containerRef.current) {
                            containerRef.current.innerHTML = '<div class="text-red-500 text-xs text-center py-4">Wait, check PayPal</div>'
                        }
                    })
                }

            } else if (hostedButtonId && window.paypal.HostedButtons) {
                // LEGACY HOSTED BUTTON
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

    }, [hostedButtonId, isSdkReady, useAdvancedCheckout, price, productName, successUrl])

    if (error) {
        return <div className="text-red-400 text-xs text-center py-2">{error}</div>
    }

    // SCENARIO A: Found a Hosted Button ID OR Advanced Checkout Enabled (Smart Engine)
    if (hostedButtonId || useAdvancedCheckout) {
        return (
            <div className="w-full flex justify-center">
                <div
                    ref={containerRef}
                    className="w-full max-w-[320px] z-10 relative transition-opacity duration-500"
                />
            </div>
        )
    }

    // SCENARIO B: Form-based PayPal button (e.g. Platform Owner fallback when NO successUrl is passed)
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
