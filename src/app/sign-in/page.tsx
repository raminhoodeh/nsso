'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
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

export default function SignInPage() {
    const router = useRouter()
    const supabase = createClient()
    const { showToast } = useToast()

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleEmailSignIn = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })

        if (error) {
            setError(error.message)
            setLoading(false)
        } else if (data.user) {
            // Check if user record exists, if not create it
            const { data: existingUser } = await supabase
                .from('users')
                .select('id')
                .eq('id', data.user.id)
                .single()

            if (!existingUser) {
                // Create user record
                const username = data.user.id.replace(/-/g, '').slice(0, 10)
                await supabase.from('users').insert({
                    id: data.user.id,
                    email: data.user.email,
                    auth_provider: 'email',
                    username: username,
                })
                await supabase.from('profiles').insert({
                    user_id: data.user.id,
                })
            }

            showToast('Welcome back!', 'success')
            router.push('/dashboard')
        }
    }

    const handleSSOSignIn = async (provider: Provider) => {
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
                            width={100}
                            height={40}
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
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        tone="dark"
                        required
                    />

                    <Input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        tone="dark"
                        required
                    />

                    {error && (
                        <p className="text-rose-950 font-medium text-sm text-center">{error}</p>
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
                        href="/sign-up"
                        className="text-slate-950 font-semibold hover:underline"
                    >
                        Sign Up
                    </Link>
                </div>
            </TahoeBackdropSurface>
        </main>
    )
}
