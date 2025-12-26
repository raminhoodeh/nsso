'use client'

import { useEffect, useRef, useState } from 'react'

interface PayPalSmartButtonProps {
    html: string
}

declare global {
    interface Window {
        paypal: any;
    }
}

export default function PayPalSmartButton({ html }: PayPalSmartButtonProps) {
    const containerRef = useRef<HTMLDivElement>(null)
    const [isSdkLoaded, setIsSdkLoaded] = useState(false)

    // 1. Smart Extraction: Look for Hosted Button ID
    // Matches: hostedButtonId: "XYZ" or 'XYZ'
    const idMatch = html.match(/hostedButtonId:\s*["']([A-Z0-9]+)["']/)
    const hostedButtonId = idMatch ? idMatch[1] : null

    // 2. Load SDK Effect
    useEffect(() => {
        if (!hostedButtonId) return

        // Check if already loaded
        if (window.paypal && window.paypal.HostedButtons) {
            setIsSdkLoaded(true)
            return
        }

        // Check if script tag exists but maybe loading
        if (document.querySelector('script[src*="paypal.com/sdk/js"]')) {
            // Poll for availability or wait for existing onload (simplified: just poll/wait)
            const interval = setInterval(() => {
                if (window.paypal && window.paypal.HostedButtons) {
                    setIsSdkLoaded(true)
                    clearInterval(interval)
                }
            }, 100)
            return () => clearInterval(interval)
        }

        // Inject Script
        const script = document.createElement('script')
        script.src = "https://www.paypal.com/sdk/js?client-id=ba&components=hosted-buttons"
        script.async = true
        script.onload = () => setIsSdkLoaded(true)
        document.body.appendChild(script)

        return () => {
            // Clean up? Usually better to leave it.
        }
    }, [hostedButtonId])

    // 3. Render Button Effect
    useEffect(() => {
        if (!hostedButtonId || !isSdkLoaded || !window.paypal || !containerRef.current) return

        // Clear container first
        containerRef.current.innerHTML = ''

        try {
            window.paypal.HostedButtons({
                hostedButtonId: hostedButtonId,
            }).render(containerRef.current)
        } catch (err) {
            console.error("PayPal Smart Render Error:", err)
        }

    }, [hostedButtonId, isSdkLoaded])

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
    // We only render if we strictly see a <form> tag to avoid "1 2 3" junk text
    if (html.includes('<form')) {
        return (
            <div
                className="w-full flex justify-center"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        )
    }

    // SCENARIO C: Junk text or unknown format -> Render Nothing (Fixes the "12" bug)
    return null
}
