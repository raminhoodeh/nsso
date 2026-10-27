'use client'

import { isTransientAuthError } from '@/lib/auth-errors'
import { boundedClientRead } from '@/lib/client-read'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { LockKeyhole } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

export default function SetPasswordPage() {
    const router = useRouter()
    const supabase = useMemo(() => createClient(), [])
    const { showToast } = useToast()

    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [checkingSession, setCheckingSession] = useState(true)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [sessionError, setSessionError] = useState('')
    const [sessionAttempt, setSessionAttempt] = useState(0)
    const [sessionRetryable, setSessionRetryable] = useState(false)
    const pending = useRef(false)

    useEffect(() => {
        let active = true
        setCheckingSession(true); setSessionError(''); setSessionRetryable(false)
        const checkSession = async () => {
            try {
                const hashParams = new URLSearchParams(window.location.hash.slice(1))
                if (hashParams.has('error') || new URLSearchParams(window.location.search).has('error')) {
                    window.history.replaceState(null, '', window.location.pathname)
                    if (active) setSessionError('This password link has expired or could not be verified. Request a new link below.')
                    return
                }
                const accessToken = hashParams.get('access_token'), refreshToken = hashParams.get('refresh_token')
                if (accessToken && refreshToken) {
                    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
                    window.history.replaceState(null, '', window.location.pathname)
                    if (error) { if (active) setSessionError('This password link has expired or could not be verified. Request a new link below.'); return }
                }
                const { data, error } = await boundedClientRead(() => supabase.auth.getUser())
                if (!active) return
                if (isTransientAuthError(error)) {
                    setSessionRetryable(true); setSessionError('Your secure link could not be checked. Please retry when your connection is available.')
                } else if (error || !data.user) {
                    setSessionError('This password link has expired or could not be verified. Request a new link below.')
                }
            } catch { if (active) { setSessionRetryable(true); setSessionError('Your secure link could not be checked. Please retry when your connection is available.') } }
            finally { if (active) setCheckingSession(false) }
        }
        void checkSession()
        return () => { active = false }
    }, [supabase, sessionAttempt])

    const handleSetPassword = async (event: React.FormEvent) => {
        event.preventDefault()
        if (pending.current) return
        setError('')

        if (password.length < 8) {
            setError('Password must be at least 8 characters.')
            return
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.')
            return
        }

        pending.current = true; setLoading(true)
        try {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) { setError(error.message); return }
            showToast('Password saved.', 'success')
            router.replace('/dashboard'); router.refresh()
        } catch { setError('Your password could not be saved. Please try again; your entries are kept.') }
        finally { pending.current = false; setLoading(false) }
    }

    return (
        <main className="min-h-screen flex items-center justify-center px-6 py-12 relative overflow-hidden">
            <GlassCard
                className="w-full max-w-[440px] p-8 lg:p-12 relative z-10"
                tone="dark"
                semanticTint="light"
                semanticTintOpacity={0.07}
            >
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block">
                        <Image
                            src="/assets/nsso-logo.png"
                            alt="nsso"
                            width={458}
                            height={224}
                            className="h-10 w-auto mx-auto"
                        />
                    </Link>
                </div>

                <div className="text-center mb-8">
                    <LockKeyhole className="w-8 h-8 mx-auto mb-4 text-slate-950/80" aria-hidden="true" />
                    <h1 className="text-2xl font-bold text-slate-950 mb-2">
                        Choose your password
                    </h1>
                    <p className="text-slate-950/80">
                        Set the password you will use to sign in to nsso.
                    </p>
                </div>

                {checkingSession ? (
                    <p className="text-slate-950/80 text-center">Checking your secure link...</p>
                ) : sessionError ? (
                    <div className="space-y-4 text-center"><p role="alert">{sessionError}</p>{sessionRetryable && <button type="button" className="underline min-h-11" onClick={() => setSessionAttempt(value => value + 1)}>Retry secure link</button>}<p><Link href="/reset-password" className="underline">Request a new password reset link</Link></p></div>
                ) : (
                    <form onSubmit={handleSetPassword} className="space-y-4">
                        <Input
                            type="password"
                            label="New password"
                            placeholder="New password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            tone="dark"
                            required
                        />
                        <Input
                            type="password"
                            label="Confirm new password"
                            placeholder="Confirm new password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            tone="dark"
                            required
                        />

                        {error && (
                            <p role="alert" className="text-rose-950 font-medium text-sm text-center">{error}</p>
                        )}

                        <GlassButton
                            type="submit"
                            variant="primary"
                            fullWidth
                            disabled={loading}
                            tone="dark"
                        >
                            {loading ? 'Saving...' : 'Save password'}
                        </GlassButton>
                    </form>
                )}
            </GlassCard>
        </main>
    )
}
