'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { useUser } from '@/components/providers/UserProvider'
import { clearDeletedAccountSession } from '@/lib/supabase/deleted-account-session'
import { deleteOwnProfile, getProfileDeleteIntent, ProfileDeleteError } from '@/lib/delete-profile-client'
import { LightButton } from '@/components/ui/LightButton';

export const DELETE_PROFILE_CONFIRMATION = 'Are you sure? All your profile data will be deleted from our database and will be lost forever'

/** A browser-native modal, not a transparent glass overlay. */
export default function DeleteProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { user } = useUser()
    const accountId = user?.id ?? null
    const account = useRef(accountId)
    const dialog = useRef<HTMLDialogElement>(null)
    const cancel = useRef<HTMLButtonElement>(null)
    const request = useRef<AbortController | null>(null)
    const pending = useRef(false)
    const confirmed = useRef(false)
    const generation = useRef(0)
    const [deleting, setDeleting] = useState(false)
    const [error, setError] = useState('')
    const [verificationRequired, setVerificationRequired] = useState(false)
    const [localSessionIssue, setLocalSessionIssue] = useState(false)
    const titleId = useId()
    const descriptionId = useId()
    const loginDescriptionId = useId()
    const cancelRequest = useCallback(() => {
        // Once Auth deletion is confirmed, an expected SIGNED_OUT unmount must
        // not cancel the final hard navigation away from private content.
        if (!confirmed.current) ++generation.current
        request.current?.abort()
        pending.current = false
    }, [])

    useEffect(() => {
        account.current = accountId
    }, [accountId])

    useEffect(() => {
        if (!open || !dialog.current) return
        const element = dialog.current
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
        element.showModal()
        cancel.current?.focus()
        return () => {
            cancelRequest()
            element.close()
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
        }
        // The caller mounts the dialog for one account. A replacement identity
        // must dismiss it rather than retargeting an already confirmed action.
    }, [open, cancelRequest])

    useEffect(() => {
        if (open && !pending.current) {
            confirmed.current = false
            setDeleting(false)
            setError('')
            setVerificationRequired(false)
            setLocalSessionIssue(false)
        }
    }, [open])

    const openedFor = useRef<string | null>(null)
    useEffect(() => {
        if (!open) { openedFor.current = null; return }
        if (!openedFor.current) openedFor.current = accountId
        if (accountId !== openedFor.current && (accountId !== null || !pending.current)) {
            ++generation.current
            request.current?.abort()
            onOpenChange(false)
        }
    }, [accountId, open, onOpenChange])

    const remove = async () => {
        const target = openedFor.current
        if (pending.current || !target || account.current !== target) return
        const operationId = getProfileDeleteIntent(target)
        pending.current = true
        setDeleting(true)
        setError('')
        setVerificationRequired(false)
        const version = ++generation.current
        const controller = new AbortController()
        request.current = controller
        try {
            await deleteOwnProfile(target, operationId, controller.signal)
            if (generation.current !== version || (account.current !== target && account.current !== null)) return
            confirmed.current = true
            const cleanup = clearDeletedAccountSession(target)
            if (cleanup === 'account-changed') { onOpenChange(false); return }
            if (cleanup === 'unavailable') {
                pending.current = false
                setDeleting(false)
                setLocalSessionIssue(true)
                setError('Your profile and login account were deleted. Your browser session could not be safely cleared. Return to the homepage to continue.')
                return
            }
            // Auth deletion already invalidates this identity's server sessions.
            // The synchronous actor-checked cleanup cannot erase a newer login.
            if (generation.current === version && (account.current === target || account.current === null)) window.location.replace('/')
        } catch (failure) {
            if (generation.current === version && !controller.signal.aborted) {
                setError(failure instanceof Error ? failure.message : 'Deletion could not be confirmed. Please try again.')
                setVerificationRequired(failure instanceof ProfileDeleteError && failure.verifyIdentity)
                setDeleting(false)
                pending.current = false
            }
        }
    }

    if (!open || typeof document === 'undefined') return null
    return createPortal(<dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${loginDescriptionId}`}
        data-delete-profile-dialog="true"
        className={`${LIGHT_PANEL.surface} m-auto max-h-[calc(100dvh_-_32px)] w-[min(440px,calc(100vw_-_32px))] max-w-none overflow-y-auto rounded-[28px] border border-white/80 p-6 shadow-2xl backdrop:bg-black/70`}
        onCancel={event => { event.preventDefault(); if (!pending.current && !localSessionIssue) onOpenChange(false) }}
        onClose={() => { if (!pending.current) onOpenChange(false) }}
    >
        <h2 id={titleId} className="text-xl font-semibold">Delete my profile?</h2>
        <p id={descriptionId} className="mt-4 text-base leading-relaxed">{DELETE_PROFILE_CONFIRMATION}</p>
        <p id={loginDescriptionId} className="mt-3 text-sm leading-relaxed">Your sign-in account will also be permanently removed.</p>
        {error && <p role="alert" className="mt-4 text-sm font-medium text-red-800">{error}</p>}
        {verificationRequired && <Link href="/dashboard/security?next=/dashboard" onClick={() => onOpenChange(false)} className="mt-3 inline-flex min-h-11 items-center font-semibold text-slate-950 underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-slate-950">Verify my account</Link>}
        <p role="status" aria-live="polite" className="sr-only">{deleting ? 'Deleting your profile and signing you out…' : ''}</p>
        <div className="mt-6 flex justify-end gap-3">
            {!localSessionIssue && <LightButton ref={cancel} type="button" disabled={deleting} onClick={() => onOpenChange(false)} className="min-h-11 px-5 py-2 font-medium focus-visible:ring-2 focus-visible:ring-slate-950 disabled:opacity-60" contentClassName="text-sm text-slate-950">{error ? 'Close' : 'Cancel'}</LightButton>}
            {localSessionIssue ? <LightButton type="button" onClick={() => window.location.replace('/')} className="min-h-11 px-5 py-2" contentClassName="text-sm text-slate-950">Return to homepage</LightButton> : <LightButton intent="danger" type="button" disabled={deleting} onClick={() => { void remove() }} className="min-h-11 rounded-full px-5 py-2 font-semibold outline-none focus-visible:ring-2 focus-visible:ring-red-900 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">{deleting ? 'Deleting…' : 'Yes'}</LightButton>}
        </div>
    </dialog>, document.body)
}
