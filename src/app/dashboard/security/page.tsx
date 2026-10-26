'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useUser } from '@/components/providers/UserProvider'
import { safeInternalPath } from '@/lib/server/auth-redirect'
import { boundedClientRead } from '@/lib/client-read'

function AccountSecurityForm({ userId, refreshUser }: { userId: string; refreshUser: () => Promise<void> }) {
    const supabase = useMemo(() => createClient(), [])
    const [factors, setFactors] = useState<{ id: string; friendly_name?: string }[]>([])
    const [factorId, setFactorId] = useState('')
    const [qr, setQr] = useState('')
    const [setupKey, setSetupKey] = useState('')
    const [code, setCode] = useState('')
    const [factorsLoading, setFactorsLoading] = useState(true)
    const [factorsReady, setFactorsReady] = useState(false)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [verified, setVerified] = useState(false)
    const [loadAttempt, setLoadAttempt] = useState(0)
    useEffect(() => {
        let active = true
        void boundedClientRead(() => Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()])).then(([factorResult, level]) => {
            if (!active) return
            setFactorsLoading(false)
            if (factorResult.error || level.error) { setMessage('Security settings could not be loaded. Reload to retry.'); return }
            setFactorsReady(true)
            setFactors(factorResult.data.totp)
            setFactorId(factorResult.data.totp[0]?.id ?? '')
            setVerified(level.data.currentLevel === 'aal2' && factorResult.data.totp.length > 0)
        }).catch(() => { if (active) { setFactorsLoading(false); setMessage('Security settings could not be loaded. Reload to retry.') } })
        return () => { active = false }
    }, [userId, supabase, loadAttempt]) // Only reset secrets on identity changes.
    async function enroll() {
        setBusy(true); setMessage('')
        try {
            const result = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `nsso ${new Date().toISOString().slice(0, 16)}` })
            if (result.error) throw result.error
            setFactorId(result.data.id); setQr(result.data.totp.qr_code); setSetupKey(result.data.totp.secret)
        } catch { setMessage('Authenticator setup could not start. Please retry; no existing factor was removed.') }
        finally { setBusy(false) }
    }
    async function verify(event: React.FormEvent) {
        event.preventDefault(); if (!factorId || !/^\d{6}$/.test(code)) return
        setBusy(true); setMessage('')
        try {
            const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
            if (result.error) throw result.error
            setCode(''); setQr(''); setSetupKey(''); setVerified(true); await refreshUser()
            const next = safeInternalPath(new URLSearchParams(window.location.search).get('next'), window.location.origin)
            window.location.assign(next === '/dashboard/security' ? '/dashboard' : next)
        } catch { setCode(''); setMessage('That code could not be verified. Use the current code from your authenticator and try again.') }
        finally { setBusy(false) }
    }
    async function cancelEnrollment() {
        if (!qr || !factorId || busy) return
        setBusy(true); setMessage('')
        try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId })
            if (error) throw error
            setFactorId(''); setQr(''); setSetupKey(''); setCode('')
        } catch { setMessage('Setup could not be canceled. Please retry; your existing authenticators were not changed.') }
        finally { setBusy(false) }
    }
    async function signOutOtherSessions() {
        setBusy(true)
        try {
            const { error } = await supabase.auth.signOut({ scope: 'others' })
            if (error) throw error
            setMessage('Other sessions have been signed out. Existing access tokens can remain valid until their expiry.')
        } catch { setMessage('Other sessions could not be signed out. Please retry.') }
        finally { setBusy(false) }
    }
    return <main className="mx-auto max-w-xl space-y-5 px-5 pb-20 pt-32 text-white">
        <h1 className="text-3xl font-semibold">Account security</h1>
        <p>Administrator access and RazinFlix editing require an authenticator code. Ordinary profile editing stays available after your normal sign-in.</p>
        {verified ? <p role="status">Your current session has passed two-step verification.</p> : <>
            {factorsLoading && <p role="status">Loading your authenticators…</p>}
            {!factorsLoading && !factorsReady && <button type="button" onClick={() => { setFactorsLoading(true); setMessage(''); setLoadAttempt(value => value + 1) }} className="min-h-11 underline">Retry security settings</button>}
            {!factorId && <button disabled={busy || factorsLoading || !factorsReady} onClick={enroll} className="min-h-12 rounded-xl border border-white/30 px-4">Set up authenticator</button>}
            {qr && <div className="space-y-3 rounded-2xl bg-white p-5 text-black"><p>Scan this code privately with your authenticator app. Keep access to your sign-in email and authenticator for recovery.</p>{/* Auth-generated QR is an image, never mounted as HTML. */}
                <img src={qr} alt="Authenticator setup QR code" className="mx-auto h-56 w-56" /><p>On this phone, enter the setup key in your authenticator instead of scanning.</p><label className="block">Authenticator setup key<input readOnly value={setupKey} autoComplete="off" className="mt-2 w-full rounded border border-black/30 p-2 font-mono text-sm" onFocus={event => event.target.select()} /></label><button type="button" disabled={busy} onClick={() => { void cancelEnrollment() }} className="min-h-11 underline">Cancel this setup</button></div>}
            {factorId && <form onSubmit={verify} className="space-y-4">
                {factors.length > 1 && <label className="block">Authenticator<select value={factorId} onChange={event => setFactorId(event.target.value)} className="block w-full rounded-xl bg-slate-900 p-3">{factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`}</option>)}</select></label>}
                <label className="block">Six-digit authenticator code<input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required className="mt-2 block w-full rounded-xl bg-slate-900 p-3 text-base" /></label>
                <button disabled={busy || code.length !== 6} className="min-h-12 rounded-xl border border-white/30 px-4 disabled:opacity-50">{busy ? 'Checking…' : 'Verify and continue'}</button>
            </form>}
        </>}
        <button type="button" disabled={busy} onClick={signOutOtherSessions} className="min-h-12 rounded-xl border border-white/30 px-4">Sign out other sessions</button>
        {message && <p role="status">{message}</p>}
        <p><Link href="/dashboard" className="underline">Back to your profile editor</Link></p>
    </main>
}

export default function AccountSecurityPage() {
    const { user, loading, refreshUser } = useUser()
    if (loading) return <main className="p-8 pt-32 text-white">Loading security settings…</main>
    if (!user) return <main className="p-8 pt-32 text-white"><Link href="/sign-in?next=/dashboard/security">Sign in to manage account security</Link></main>
    return <AccountSecurityForm key={user.id} userId={user.id} refreshUser={refreshUser} />
}
