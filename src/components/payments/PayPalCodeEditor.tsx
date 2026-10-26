'use client'

import { useEffect, useRef, useState } from 'react'
import { parsePayPalInput, type PayPalConfig } from '@/lib/payments/paypal-config'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'

interface Props {
    productId: string
    accountId: string
    initialHtml: string | null
    onSaved: (html: string, config: PayPalConfig | null) => void | Promise<void>
    getRevision: () => number
    refreshRevision: () => Promise<void>
}

/** Invalid drafts remain editable locally; the last valid public button stays unchanged. */
export default function PayPalCodeEditor({ productId, accountId, initialHtml, onSaved, getRevision, refreshRevision }: Props) {
    const [draft, setDraft] = useState(initialHtml || '')
    const [state, setState] = useState<'saved' | 'saving' | 'error' | 'conflict'>('saved')
    const [serverMessage, setServerMessage] = useState('')
    const [savedValue, setSavedValue] = useState(initialHtml || '')
    const savedHtml = useRef(initialHtml || '')
    const pending = useRef(false)
    const saveId = useRef(0)
    const controller = useRef<AbortController | null>(null)
    const currentProduct = useRef(productId)
    const attempt = useRef<{ html: string; operationId: string; expectedRevision: number } | null>(null)
    const parsed = parsePayPalInput(draft)

    useEffect(() => {
        if (productId !== currentProduct.current || (!pending.current && draft === savedHtml.current)) {
            if (productId !== currentProduct.current) {
                controller.current?.abort()
                saveId.current++
                pending.current = false
                attempt.current = null
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
        if (!parsed.ok || draft === savedHtml.current || pending.current || state === 'conflict') return
        const version = ++saveId.current
        const html = draft
        const previous = attempt.current?.html === html ? attempt.current : null
        const operation = previous || { html, operationId: crypto.randomUUID(), expectedRevision: getRevision() }
        attempt.current = operation
        controller.current = new AbortController()
        const signal = controller.current.signal
        pending.current = true
        setState('saving')
        setServerMessage('')
        try {
            const status = async () => {
                const response = await fetch(`/api/profile/operations?operationId=${encodeURIComponent(operation.operationId)}`, { headers:{'X-Nsso-Account':accountId}, signal: AbortSignal.any([signal,AbortSignal.timeout(10000)]), cache: 'no-store' })
                if (!response.ok) throw new Error('The save result is not confirmed. Your draft has been kept.')
                return response.json()
            }
            let result = previous ? await status() : null
            if (!result || result.status === 'not_found') {
                try {
                    const response = await fetch(`/api/products/${encodeURIComponent(productId)}/payment`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json','X-Nsso-Account':accountId }, body: JSON.stringify(operation), signal: AbortSignal.any([signal,AbortSignal.timeout(10000)]),
                    })
                    result = await response.json()
                    if (response.status >= 500) result = await status()
                    else if (!response.ok && result.status !== 'conflict') throw new Error(result.error || 'The payment button was not saved.')
                } catch (error) {
                    if (signal.aborted) throw error
                    result = await status()
                }
            }
            if (signal.aborted || version !== saveId.current) return
            if(result.operationId!==operation.operationId || !Number.isSafeInteger(result.revision))throw new Error('The save result could not be verified. Your draft has been kept.')
            if (result.status === 'conflict') { setState('conflict'); setServerMessage('Newer payment settings were saved elsewhere. Your draft is kept. Refresh and review before saving it.'); return }
            if (result.status !== 'applied') throw new Error('The save result is not confirmed. Check its status before retrying; your draft has been kept.')
            savedHtml.current = html
            setSavedValue(html)
            await onSaved(html, parsed.config)
            attempt.current = null
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
            <button type="button" disabled={!parsed.ok || state === 'saving' || draft === savedValue} onClick={() => { if (state === 'conflict') { void refreshRevision().then(() => { attempt.current = null; setState('saved'); setServerMessage('Latest settings loaded. Review your draft, then press Save payment button to keep it.') }) } else void save() }} className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-4 text-sm text-white disabled:opacity-40">
                {state === 'saving' ? 'Saving...' : state === 'conflict' ? 'Refresh for review' : state === 'error' ? 'Check status and retry' : 'Save payment button'}
            </button>
            {parsed.ok && parsed.config && <PayPalSmartButton config={parsed.config} preview />}
            <p className="text-xs leading-relaxed text-white/60">PayPal controls the recipient, checkout and delivery configured in your PayPal account. This preview does not verify payment or merchant identity.</p>
        </div>
    )
}
