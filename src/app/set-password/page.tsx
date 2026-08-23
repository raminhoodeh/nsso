'use client'

import { useEffect, useMemo, useState } from 'react'
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

    useEffect(() => {
        const checkSession = async () => {
            const { data } = await supabase.auth.getUser()

            if (!data.user) {
                router.replace('/sign-in?error=password-link')
                return
            }

            setCheckingSession(false)
        }

        void checkSession()
    }, [router, supabase.auth])

    const handleSetPassword = async (event: React.FormEvent) => {
        event.preventDefault()
        setError('')

        if (password.length < 8) {
            setError('Password must be at least 8 characters.')
            return
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.')
            return
        }

        setLoading(true)
        const { error: updateError } = await supabase.auth.updateUser({ password })

        if (updateError) {
            setError(updateError.message)
            setLoading(false)
            return
        }

        showToast('Password saved.', 'success')
        router.replace('/dashboard')
        router.refresh()
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
                            width={100}
                            height={40}
                            className="h-10 w-auto mx-auto brightness-0 opacity-80"
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
                ) : (
                    <form onSubmit={handleSetPassword} className="space-y-4">
                        <Input
                            type="password"
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
                            placeholder="Confirm new password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            tone="dark"
                            required
                        />

                        {error && (
                            <p className="text-rose-950 font-medium text-sm text-center">{error}</p>
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
