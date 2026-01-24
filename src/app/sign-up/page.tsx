'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import WalletLogin from '@/components/auth/WalletLogin'

const providers = [
    { name: 'google', label: 'Google' },
    { name: 'github', label: 'GitHub' },
] as const

type Provider = typeof providers[number]['name']

function SignUpForm() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const reservedName = searchParams.get('name') || ''
    const supabase = createClient()
    const { showToast } = useToast()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleEmailSignUp = async (e: React.FormEvent) => {
        e.preventDefault()

        if (password !== confirmPassword) {
            setError('Passwords do not match')
            return
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters')
            return
        }

        setLoading(true)
        setError('')

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${window.location.origin}/auth/callback`,
                data: {
                    reserved_name: reservedName,
                },
            },
        })

        if (error) {
            setError(error.message)
            setLoading(false)
        } else {
            showToast('Check your email to confirm your account!', 'success')
            router.push('/sign-in')
        }
    }

    const handleSSOSignUp = async (provider: Provider) => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        })

        if (error) {
            setError(error.message)
        }
    }

    return (
        <main className="min-h-screen flex items-center justify-center px-6 py-12 relative overflow-hidden">
            <GlassCard className="w-full max-w-[440px] p-8 lg:p-12 relative z-10">
                {/* Logo */}
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block">
                        <Image
                            src="/assets/nsso-logo.png"
                            alt="nsso"
                            width={100}
                            height={40}
                            className="h-10 w-auto mx-auto"
                        />
                    </Link>
                </div>

                {/* Title */}
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-white mb-2">
                        Create your nsso profile
                    </h1>
                    <p className="text-white/70">
                        Evolve your identity with the world.
                    </p>
                </div>

                {/* Reserved name indicator */}
                {reservedName && (
                    <div className="bg-white/10 rounded-lg px-4 py-3 mb-6 text-center">
                        <p className="text-white/70 text-sm">Reserving:</p>
                        <p className="text-white font-semibold">nsso.me/{reservedName}</p>
                    </div>
                )}

                {/* SSO Buttons */}
                <div className="space-y-3 mb-6">
                    {providers.map((provider) => (
                        <GlassButton
                            key={provider.name}
                            variant="secondary"
                            fullWidth
                            onClick={() => handleSSOSignUp(provider.name)}
                            className="justify-center"
                        >
                            Continue with {provider.label}
                        </GlassButton>
                    ))}

                    {/* Wallet Login */}
                    <WalletLogin />
                </div>

                {/* Separator */}
                <div className="flex items-center gap-4 my-6">
                    <div className="flex-1 h-px bg-white/20" />
                    <span className="text-white/50 text-sm">or</span>
                    <div className="flex-1 h-px bg-white/20" />
                </div>

                {/* Email Form */}
                <form onSubmit={handleEmailSignUp} className="space-y-4">
                    <Input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    <Input
                        type="password"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />

                    {error && (
                        <p className="text-red-400 text-sm text-center">{error}</p>
                    )}

                    <GlassButton
                        type="submit"
                        variant="shiny"
                        fullWidth
                        disabled={loading}
                    >
                        {loading ? 'Creating account...' : 'Create Account'}
                    </GlassButton>
                </form>

                {/* Sign In Link */}
                <div className="text-center mt-6 pt-6 border-t border-white/10">
                    <span className="text-white/70">Already have an account? </span>
                    <Link
                        href="/sign-in"
                        className="text-white font-semibold hover:underline"
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
                <div className="text-white">Loading...</div>
            </main>
        }>
            <SignUpForm />
        </Suspense>
    )
}
