'use client'

import { useEffect, useRef, useState } from 'react'
import { parsePayPalInput, type PayPalConfig } from '@/lib/payments/paypal-config'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'

interface Props {
    productId: string
    initialHtml: string | null
    onSaved: (html: string, config: PayPalConfig | null) => void
}

/** Invalid drafts remain editable locally; the last valid public button stays unchanged. */
export default function PayPalCodeEditor({ productId, initialHtml, onSaved }: Props) {
    const [draft, setDraft] = useState(initialHtml || '')
    const [state, setState] = useState<'saved' | 'saving' | 'error'>('saved')
    const [serverMessage, setServerMessage] = useState('')
    const [savedValue, setSavedValue] = useState(initialHtml || '')
    const savedHtml = useRef(initialHtml || '')
    const pending = useRef(false)
    const saveId = useRef(0)
    const controller = useRef<AbortController | null>(null)
    const currentProduct = useRef(productId)
    const parsed = parsePayPalInput(draft)

    useEffect(() => {
        if (productId !== currentProduct.current || (!pending.current && draft === savedHtml.current)) {
            if (productId !== currentProduct.current) {
                controller.current?.abort()
                saveId.current++
                pending.current = false
            }
            currentProduct.current = productId
            savedHtml.current = initialHtml || ''
            setSavedValue(initialHtml || '')
            setDraft(initialHtml || '')
            setState('saved')
            setServerMessage('')
        }
    }, [productId, initialHtml, draft])

    useEffect(() => () => { controller.current?.abort(); saveId.current++ }, [])

    const save = async () => {
        if (!parsed.ok || draft === savedHtml.current || pending.current) return
        const version = ++saveId.current
        const html = draft
        controller.current = new AbortController()
        const signal = controller.current.signal
        pending.current = true
        setState('saving')
        setServerMessage('')
        try {
            const response = await fetch(`/api/products/${encodeURIComponent(productId)}/payment`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }), signal,
            })
            const result = await response.json()
            if (!response.ok || !result.success) throw new Error(result.error || 'The payment button was not saved.')
            if (signal.aborted || version !== saveId.current) return
            savedHtml.current = html
            setSavedValue(html)
            onSaved(html, result.config)
            setState('saved')
        } catch (error) {
            if (signal.aborted || version !== saveId.current) return
            setState('error')
            setServerMessage(error instanceof Error ? error.message : 'The payment button was not saved. Please retry.')
        } finally { if (version === saveId.current) pending.current = false }
    }

    return (
        <div className="space-y-3">
            <textarea
                value={draft}
                onChange={event => { setDraft(event.target.value); setServerMessage('') }}
                onBlur={() => { void save() }}
                maxLength={32768}
                rows={3}
                aria-label="PayPal button code"
                aria-invalid={!parsed.ok}
                className="min-h-[112px] resize-none w-full rounded-xl border border-white/20 bg-black/10 p-3 text-base font-mono text-white/90 outline-none focus:border-white/60 md:min-h-[80px] md:p-2 md:text-xs"
                placeholder="Paste the payment button code from PayPal"
            />
            <p role="status" className={`text-xs ${parsed.ok ? 'text-white/70' : 'text-amber-200'}`}>
                {serverMessage || (state === 'saving' ? 'Saving payment button...' : draft !== savedValue && parsed.ok ? `${parsed.message} Unsaved changes.` : parsed.message)}
            </p>
            <button type="button" disabled={!parsed.ok || state === 'saving' || draft === savedValue} onClick={() => { void save() }} className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white disabled:opacity-40">
                {state === 'saving' ? 'Saving...' : state === 'error' ? 'Retry save' : 'Save payment button'}
            </button>
            {parsed.ok && parsed.config && <PayPalSmartButton config={parsed.config} preview />}
            <p className="text-xs leading-relaxed text-white/60">PayPal controls the recipient, checkout and delivery configured in your PayPal account. This preview does not verify payment or merchant identity.</p>
        </div>
    )
}
