'use client'

import { Suspense, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { authCallbackUrl, authDestination, authErrorMessage } from '@/lib/auth-journey'
import { createClient } from '@/lib/supabase/client'
import GlassButton from '@/components/ui/GlassButton'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import WalletLogin from '@/components/auth/WalletLogin'
import { TahoeBackdropSurface } from '@/components/ui/tahoe-glass'

const providers = [
    { name: 'google', label: 'Google' },
    { name: 'github', label: 'GitHub' },
] as const

type Provider = typeof providers[number]['name']

function SignInForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const pending = useRef(false)
    const supabase = createClient()
    const { showToast } = useToast()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const nextPath = authDestination(new URLSearchParams(searchParams.toString()), 'https://nsso.me')

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        if (pending.current) return
        pending.current = true
        setLoading(true); setError('')
        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
            if (error) { setError(error.message); return }
            if (!data.user) { setError('Sign-in could not be confirmed. Please try again.'); return }
            const { error: setupError } = await supabase.rpc('ensure_current_account')
            if (setupError) { setError('Your account could not be prepared. Please try signing in again.'); return }
            showToast('Welcome back!', 'success')
            router.replace(nextPath); router.refresh()
        } catch { setError('Sign-in is temporarily unavailable. Your details are kept; please try again.') }
        finally { pending.current = false; setLoading(false) }
    }

    const handleSSOSignIn = async (provider: Provider) => {
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
            <TahoeBackdropSurface
                as="section"
                variant="card"
                radius={40}
                className="w-full max-w-[440px] p-8 lg:p-12 relative z-10"
                contentClassName="h-full w-full"
                tone="dark"
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
                        Welcome back
                    </h1>
                    <p className="text-slate-950/80">
                        Continue your journey of self-discovery.
                    </p>
                </div>

                {/* SSO Buttons */}
                <div className="space-y-3 mb-6">
                    {providers.map((provider) => (
                        <GlassButton
                            key={provider.name}
                            variant="secondary"
                            fullWidth
                            disabled={loading}
                            onClick={() => handleSSOSignIn(provider.name)}
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
                <form onSubmit={handleEmailSignIn} className="space-y-4">
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
                        autoComplete="current-password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        tone="dark"
                        required
                    />

                    {(error || authErrorMessage(searchParams.get('error'))) && (
                        <p role="alert" className="text-rose-950 font-medium text-sm text-center">{error || authErrorMessage(searchParams.get('error'))}</p>
                    )}

                    <GlassButton
                        type="submit"
                        variant="shiny"
                        fullWidth
                        disabled={loading}
                        tone="dark"
                    >
                        {loading ? 'Signing in...' : 'Sign In'}
                    </GlassButton>
                </form>

                {/* Forgot Password */}
                <div className="text-center mt-4">
                    <Link
                        href="/reset-password"
                        className="text-slate-950/80 text-sm hover:text-slate-950 transition-colors"
                    >
                        Forgot password?
                    </Link>
                </div>

                {/* Sign Up Link */}
                <div className="text-center mt-6 pt-6 border-t border-black/10">
                    <span className="text-slate-950/80">Don't have an account? </span>
                    <Link
                        href={`/sign-up?next=${encodeURIComponent(nextPath)}`}
                        className="text-slate-950 font-semibold hover:underline"
                    >
                        Sign Up
                    </Link>
                </div>
            </TahoeBackdropSurface>
        </main>
    )
}

export default function SignInPage() {
    return <Suspense fallback={<main className="min-h-screen flex items-center justify-center"><p>Loading sign-in…</p></main>}><SignInForm /></Suspense>
}
