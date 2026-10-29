'use client'

import { useEffect, useRef, useState } from 'react'
import { parsePayPalInput, type PayPalConfig } from '@/lib/payments/paypal-config'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import SectionHelp from '@/app/dashboard/components/SectionHelp'
import { LightButton } from '@/components/ui/LightButton'
import { LIGHT_PANEL } from '@/components/ui/light-panel'

interface Props {
    productId: string
    accountId: string
    initialHtml: string | null
    onSaved: (html: string, config: PayPalConfig | null) => void | boolean | Promise<void | boolean>
    getRevision: () => number
    refreshRevision: () => Promise<void | boolean>
    /** Keep the editor mounted while navigating, but do not render an inactive preview. */
    active?: boolean
    onSavingChange?: (saving: boolean) => void
    onDirtyChange?: (dirty: boolean) => void
}

/** Invalid drafts remain editable locally; the last valid public button stays unchanged. */
export default function PayPalCodeEditor({ productId, accountId, initialHtml, onSaved, getRevision, refreshRevision, active = true, onSavingChange, onDirtyChange }: Props) {
    const [draft, setDraft] = useState(initialHtml || '')
    const [state, setState] = useState<'saved' | 'saving' | 'refreshing' | 'error' | 'conflict'>('saved')
    const [serverMessage, setServerMessage] = useState('')
    const [savedValue, setSavedValue] = useState(initialHtml || '')
    const savedHtml = useRef(initialHtml || '')
    const pending = useRef(false)
    const saveId = useRef(0)
    const controller = useRef<AbortController | null>(null)
    const currentIdentity = useRef(`${accountId}:${productId}`)
    const draftValue = useRef(initialHtml || '')
    const attempt = useRef<{ html: string; operationId: string; expectedRevision: number } | null>(null)
    const savingCallback = useRef(onSavingChange)
    const dirtyCallback = useRef(onDirtyChange)
    const busyReporter = useRef<((saving: boolean) => void) | undefined>(undefined)
    const parsed = parsePayPalInput(draft)

    useEffect(() => { savingCallback.current = onSavingChange }, [onSavingChange])
    useEffect(() => { dirtyCallback.current = onDirtyChange }, [onDirtyChange])
    useEffect(() => { dirtyCallback.current?.(draft !== savedValue) }, [draft, savedValue])
    useEffect(() => () => { dirtyCallback.current?.(false) }, [])
    useEffect(() => {
        if (draft === savedValue && state !== 'saving' && state !== 'refreshing') return
        const keepDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
        window.addEventListener('beforeunload', keepDraft)
        return () => window.removeEventListener('beforeunload', keepDraft)
    }, [draft, savedValue, state])

    const notifyPending = (value: boolean) => {
        pending.current = value
        if (value) {
            busyReporter.current = savingCallback.current
            busyReporter.current?.(true)
        } else {
            busyReporter.current?.(false)
            busyReporter.current = undefined
        }
    }

    useEffect(() => {
        const identity = `${accountId}:${productId}`
        if (identity !== currentIdentity.current || (!pending.current && draftValue.current === savedHtml.current)) {
            if (identity !== currentIdentity.current) {
                controller.current?.abort()
                saveId.current++
                pending.current = false
                busyReporter.current?.(false)
                busyReporter.current = undefined
                attempt.current = null
            }
            currentIdentity.current = identity
            savedHtml.current = initialHtml || ''
            draftValue.current = initialHtml || ''
            setSavedValue(initialHtml || '')
            setDraft(initialHtml || '')
            setState('saved')
            setServerMessage('')
        }
        // Prop refreshes may update a pristine editor, but never replace unsaved input.
        // Draft changes are deliberately not a dependency: a confirmed save must not
        // restore an old initialHtml value while its profile refresh is in flight.
    }, [accountId, productId, initialHtml])

    useEffect(() => () => {
        controller.current?.abort()
        saveId.current++
        busyReporter.current?.(false)
        busyReporter.current = undefined
    }, [])

    const save = async () => {
        if (!parsed.ok || draft === savedHtml.current || pending.current || state === 'conflict') return
        const version = ++saveId.current
        const html = draft
        const previous = attempt.current?.html === html ? attempt.current : null
        const operation = previous || { html, operationId: crypto.randomUUID(), expectedRevision: getRevision() }
        attempt.current = operation
        controller.current = new AbortController()
        const signal = controller.current.signal
        notifyPending(true)
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
            // The verified receipt is authoritative even if refreshing the profile
            // afterwards fails. Never replay an already applied payment operation.
            attempt.current = null
            setServerMessage('Payment button saved. Updating profile...')
            try {
                if (await onSaved(html, parsed.config) === false) throw new Error('Profile refresh was not confirmed.')
                if (!signal.aborted && version === saveId.current) setServerMessage('Payment button saved.')
            } catch {
                if (!signal.aborted && version === saveId.current) {
                    setServerMessage('Payment button saved. The profile could not refresh; reload to see the latest profile.')
                }
            }
            if (!signal.aborted && version === saveId.current) setState('saved')
        } catch (error) {
            if (signal.aborted || version !== saveId.current) return
            setState('error')
            setServerMessage(error instanceof Error ? error.message : 'The payment button was not saved. Please retry.')
        } finally { if (version === saveId.current) notifyPending(false) }
    }

    const refreshForReview = async () => {
        if (pending.current) return
        const version = ++saveId.current
        notifyPending(true)
        setState('refreshing')
        setServerMessage('Loading the latest payment settings...')
        try {
            if (await refreshRevision() === false) throw new Error('Refresh was not confirmed.')
            if (version !== saveId.current) return
            attempt.current = null
            setState('saved')
            setServerMessage('Latest settings loaded. Review your draft, then choose Save payment button to publish it.')
        } catch {
            if (version !== saveId.current) return
            setState('conflict')
            setServerMessage('Could not load the latest settings. Your draft is kept. Try Refresh for review again.')
        } finally {
            if (version === saveId.current) notifyPending(false)
        }
    }

    const unsaved = draft !== savedValue
    const statusMessage = serverMessage || (state === 'saving' ? 'Saving payment button...' : parsed.message)

    return (
        <div className="space-y-3" data-paypal-editor-unsaved={unsaved ? 'true' : 'false'}>
            <textarea
                value={draft}
                onChange={event => { draftValue.current = event.target.value; setDraft(event.target.value); setServerMessage('') }}
                maxLength={32768}
                rows={3}
                aria-label="PayPal button code"
                aria-invalid={!parsed.ok}
                className={`${LIGHT_PANEL.group} ${LIGHT_PANEL.focus} min-h-[112px] resize-none w-full rounded-xl p-3 text-base font-mono text-slate-950 placeholder:text-slate-950 md:min-h-[80px] md:p-2 md:text-xs`}
                placeholder="Paste the payment button code from PayPal"
            />
            <p role="status" className={`text-xs ${parsed.ok ? 'text-slate-950' : 'text-amber-950'}`}>
                {statusMessage}{unsaved && state !== 'saving' && state !== 'refreshing' ? ' Unsaved changes.' : ''}
            </p>
            <div className="flex flex-wrap items-center gap-2">
                <LightButton type="button" disabled={!parsed.ok || state === 'saving' || state === 'refreshing' || !unsaved} onClick={() => { if (state === 'conflict') void refreshForReview(); else void save() }} className="min-h-11 px-4 py-2 disabled:opacity-40" contentClassName="text-sm">
                    {state === 'saving' ? 'Saving...' : state === 'refreshing' ? 'Refreshing...' : state === 'conflict' ? 'Refresh for review' : state === 'error' ? 'Check status and retry' : 'Save payment button'}
                </LightButton>
                <SectionHelp title="PayPal checkout">PayPal sets the price, recipient, checkout and delivery in your PayPal account. Save publishes this button. The preview does not start or verify a payment or merchant identity.</SectionHelp>
            </div>
            {active && parsed.ok && parsed.config && <PayPalSmartButton config={parsed.config} preview />}
        </div>
    )
}
