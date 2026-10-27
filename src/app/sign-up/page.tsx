'use client'

import { useRef, useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { authCallbackUrl, authDestination } from '@/lib/auth-journey'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import WalletLogin from '@/components/auth/WalletLogin'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { validateProfileUsername } from '@/lib/profile-username'

const providers = [
    { name: 'google', label: 'Google' },
    { name: 'github', label: 'GitHub' },
] as const

type Provider = typeof providers[number]['name']

function SignUpForm() {
    const router = useRouter()
    const pending = useRef(false)
    const searchParams = useSearchParams()
    const requestedName = validateProfileUsername(searchParams.get('name'))
    const reservedName = 'username' in requestedName ? requestedName.username : ''
    const supabase = createClient()
    const { showToast } = useToast()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const nextPath = authDestination(new URLSearchParams(searchParams.toString()), 'https://nsso.me')

    const handleEmailSignUp = async (e: React.FormEvent) => {
        e.preventDefault()
        if (pending.current) return

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters')
            return
        }

        pending.current = true; setLoading(true); setError('')
        try {
            const { data, error } = await supabase.auth.signUp({
                email: email.trim(), password,
                options: { emailRedirectTo: authCallbackUrl(window.location.origin, nextPath), data: { reserved_name: reservedName } },
            })
            if (error) { setError(error.message); return }
            if (data.session) {
                const { error: setupError } = await supabase.rpc('ensure_current_account')
                if (setupError) { setError('Your account was created, but your profile could not be prepared. Please sign in to retry.'); return }
                showToast('Your account is ready.', 'success')
                router.replace(nextPath); router.refresh()
            } else {
                showToast('Check your email to confirm your account!', 'success')
                router.push(`/sign-in?next=${encodeURIComponent(nextPath)}`)
            }
        } catch { setError('Account creation is temporarily unavailable. Your details are kept; please try again.') }
        finally { pending.current = false; setLoading(false) }
    }

    const handleSSOSignUp = async (provider: Provider) => {
        if (pending.current) return
        pending.current = true; setLoading(true); setError('')
        try {
            const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: authCallbackUrl(window.location.origin, nextPath) } })
            if (error) setError(error.message)
        } catch { setError('Sign-in is temporarily unavailable. Please try again.') }
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
                {/* Logo */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block">
                        <Image
                            src="/assets/nsso-logo.png"
                            alt="nsso"
                            width={458}
                            height={224}
                            className="h-10 w-auto mx-auto brightness-0 opacity-80"
                        />
                    </Link>
                </div>

                {/* Title */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-slate-950 mb-2">
                        Create your nsso profile
                    </h1>
                    <p className="text-slate-950/80">
                        Evolve your identity with the world.
                    </p>
                </div>

                {/* Reserved name indicator */}
                {reservedName && (
                    <TahoeGlassSurface
                        variant="recessed"
                        radius={8}
                        tone="dark"
                        className="mb-6 px-4 py-3 text-center"
                    >
                        <p className="text-slate-950/80 text-sm">Requested profile URL:</p>
                        <p className="text-slate-950 font-semibold">nsso.me/{reservedName}</p>
                        <p className="text-sm text-slate-950/70">This name is a draft, not a reservation. Confirm availability and save it in profile setup.</p>
                        <Link href="/#choose-profile-name" className="inline-flex min-h-11 items-center text-sm font-semibold text-slate-950 underline">Choose a different name</Link>
                    </TahoeGlassSurface>
                )}

                {/* SSO Buttons */}
                <div className="space-y-3 mb-6">
                    {providers.map((provider) => (
                        <GlassButton
                            key={provider.name}
                            variant="secondary"
                            fullWidth
                            disabled={loading}
                            onClick={() => handleSSOSignUp(provider.name)}
                            tone="dark"
                            className="justify-center"
                        >
                            Continue with {provider.label}
                        </GlassButton>
                    ))}

                    {/* Wallet Login */}
                    <WalletLogin tone="dark" />
                </div>

                {/* Separator */}
                <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 h-px bg-black/15" />
                    <span className="text-slate-950/80 text-sm">or</span>
                    <div className="flex-1 h-px bg-black/15" />
                </div>

                {/* Email Form */}
                <form onSubmit={handleEmailSignUp} className="space-y-4">
                    <Input
                        type="email"
                        label="Email address"
                        autoComplete="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        tone="dark"
                        required
                    />

                    <Input
                        type="password"
                        label="Password"
                        autoComplete="new-password"
                        minLength={8}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        tone="dark"
                        required
                    />

                    <Input
                        type="password"
                        label="Confirm password"
                        autoComplete="new-password"
                        minLength={8}
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        tone="dark"
                        required
                    />

                    {error && (
                        <p role="alert" className="text-rose-950 font-medium text-sm text-center">{error}</p>
                    )}

                    <GlassButton
                        type="submit"
                        variant="shiny"
                        fullWidth
                        disabled={loading}
                        tone="dark"
                    >
                        {loading ? 'Creating account...' : 'Create Account'}
                    </GlassButton>
                </form>

                {/* Sign In Link */}
                <div className="text-center mt-6 pt-6 border-t border-black/10">
                    <span className="text-slate-950/80">Already have an account? </span>
                    <Link
                        href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
                        className="text-slate-950 font-semibold hover:underline"
                    >
                        Sign In
                    </Link>
                </div>
            </GlassCard>
        </main>
    )
}

export default function SignUpPage() {
    return (
        <Suspense fallback={
            <main className="min-h-screen flex items-center justify-center">
                <div className="text-slate-950">Loading...</div>
            </main>
        }>
            <SignUpForm />
        </Suspense>
    )
}
