'use client'

import { useRef, useState } from 'react'
import { TahoeGlassButton, TahoeGlassDialog } from '@/components/ui/tahoe-glass'

interface ConfirmDeleteDialogProps {
    open: boolean
    name: string
    onClose: () => void
    onConfirm: () => boolean | void | Promise<boolean | void>
}

/** Shared confirmation for profile content; only a confirmed save dismisses it. */
export default function ConfirmDeleteDialog({ open, name, onClose, onConfirm }: ConfirmDeleteDialogProps) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const pending = useRef(false)
    const cancelRef = useRef<HTMLButtonElement>(null)

    async function confirm() {
        if (pending.current) return
        pending.current = true
        setBusy(true)
        setError('')
        try {
            if (await onConfirm() === false) setError('Removal could not be confirmed. Check the save status before retrying.')
            else onClose()
        } catch {
            setError('Removal could not be confirmed. Check the save status before retrying.')
        } finally {
            pending.current = false
            setBusy(false)
        }
    }

    return <TahoeGlassDialog
        open={open}
        onOpenChange={value => { if (!value && !pending.current) { setError(''); onClose() } }}
        initialFocusRef={cancelRef}
        tone="light"
        semanticTint="dark"
        semanticTintOpacity={0.38}
        overlayClassName="z-[10000]"
        backdropClassName="bg-black/70"
        title={`Delete ${name}?`}
        description="This removes the item from your profile. This action is permanent."
        titleClassName="text-xl font-bold text-white break-words"
        descriptionClassName="text-white/80 leading-relaxed"
        className="max-w-sm p-6"
    >
        {error && <p role="alert" className="mt-3 text-sm text-rose-200">{error}</p>}
        <div className="mt-5 flex gap-3">
            <TahoeGlassButton tone="light" ref={cancelRef} disabled={busy} onClick={() => { setError(''); onClose() }} className="min-h-11 flex-1 px-3 py-2" contentClassName="text-white">{error ? 'Close' : 'Keep item'}</TahoeGlassButton>
            <TahoeGlassButton tone="light" disabled={busy} onClick={() => { void confirm() }} className="min-h-11 flex-1 px-3 py-2" contentClassName="text-red-200">{busy ? 'Deleting…' : 'Delete'}</TahoeGlassButton>
        </div>
    </TahoeGlassDialog>
}
