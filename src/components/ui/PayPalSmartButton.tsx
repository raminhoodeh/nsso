'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { resolvePayPalConfig } from '@/lib/payments/paypal-config'
import { loadPayPalHostedSdk } from '@/lib/payments/paypal-sdk'
import PreviewCheckoutButton from '@/components/ui/PreviewCheckoutButton'
import { TahoeGlassButton } from '@/components/ui/tahoe-glass'

interface PayPalSmartButtonProps {
    html?: string | null
    config?: unknown
    preview?: boolean
    // Retained for caller compatibility. These never override PayPal's order or delivery.
    isPlatformOwner?: boolean
    price?: string
    productName?: string
    successUrl?: string
}

export default function PayPalSmartButton({ html, config, preview = false }: PayPalSmartButtonProps) {
    const payment = useMemo(() => resolvePayPalConfig(config, html || ''), [config, html])
    const containerRef = useRef<HTMLDivElement>(null)
    const [failedAttempt, setFailedAttempt] = useState<string | null>(null)
    const [retry, setRetry] = useState(0)
    const hostedId = payment?.kind === 'hosted-button' ? payment.hostedButtonId : null
    const currency = payment?.kind === 'hosted-button' ? payment.currency : 'GBP'
    const attempt = `${hostedId}|${currency}|${retry}`
    const failed = failedAttempt === attempt

    useEffect(() => {
        if (!hostedId || preview) return
        let cancelled = false
        let close: (() => void) | undefined
        const container = containerRef.current
        loadPayPalHostedSdk(currency).then(async sdk => {
            if (cancelled || !container) return
            container.replaceChildren()
            const button = sdk.HostedButtons({ hostedButtonId: hostedId })
            close = button.close?.bind(button)
            await button.render(container)
        }).catch(() => {
            if (!cancelled) setFailedAttempt(attempt)
        })
        return () => {
            cancelled = true
            close?.()
            container?.replaceChildren()
        }
    }, [hostedId, currency, preview, retry, attempt])

    if (!payment) return html || config ? <p className="py-2 text-center text-xs text-white/70">Payment button unavailable. Please contact the seller.</p> : null
    const buttonClass = 'min-h-11 w-full rounded-md border border-amber-400/50 bg-[#ffc439] px-5 py-3 text-center font-semibold text-black disabled:cursor-default disabled:opacity-75'
    if (preview) return <PreviewCheckoutButton className="w-full max-w-[320px]" buttonClassName={buttonClass}>{payment.kind === 'payment-form' ? payment.label : 'Pay with PayPal'}</PreviewCheckoutButton>
    if (payment.kind === 'payment-form') {
        return (
            <form action={payment.action} method="post" target="_top" className="w-full max-w-[320px]" data-paypal-kind="payment-form">
                {payment.fields.map(field => <input key={field.name} type="hidden" name={field.name} value={field.value} />)}
                <button type="submit" className={buttonClass}>{payment.label}</button>
            </form>
        )
    }
    if (failed) return <div role="status" className="py-2 text-center text-xs text-white/70"><p>PayPal could not load.</p><TahoeGlassButton type="button" tone="light" className="mt-2 min-h-11 px-3 py-2" contentClassName="text-sm text-white" onClick={() => setRetry(value => value + 1)}>Retry PayPal</TahoeGlassButton></div>
    return <div ref={containerRef} className="relative z-10 w-full max-w-[320px]" data-paypal-kind="hosted-button" />
}
