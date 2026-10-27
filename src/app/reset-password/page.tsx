'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

export default function ResetPasswordPage() {
    const supabase = createClient()
    const pending = useRef(false)
    const { showToast } = useToast()

    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState('')

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (pending.current) return
        pending.current = true; setLoading(true); setError('')
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/set-password` })
            if (error) { setError(error.message); return }
            setSent(true); showToast('Check your email for a reset link.', 'success')
        } catch { setError('The reset email could not be requested. Your email is kept; please try again.') }
        finally { pending.current = false; setLoading(false) }
    }

    if (sent) {
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

                    {/* Success Message */}
                    <div className="text-center">
                        <div className="text-4xl mb-4">✉️</div>
                        <h1 className="text-2xl font-bold text-slate-950 mb-2">
                            Check your email
                        </h1>
                        <p className="text-slate-950/80 mb-6">
                            If an account exists for <strong>{email.trim()}</strong>, a password reset link is on its way.
                        </p>
                        <Link href="/sign-in">
                            <GlassButton variant="secondary" fullWidth tone="dark">
                                Back to Sign In
                            </GlassButton>
                        </Link>
                    </div>
                </GlassCard>
            </main>
        )
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
                        Reset your password
                    </h1>
                    <p className="text-slate-950/80">
                        Enter your email and we'll send you a reset link.
                    </p>
                </div>

                {/* Reset Form */}
                <form onSubmit={handleResetPassword} className="space-y-4">
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
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </GlassButton>
                </form>

                {/* Back to Sign In */}
                <div className="text-center mt-6 pt-6 border-t border-black/10">
                    <Link
                        href="/sign-in"
                        className="text-slate-950/80 hover:text-slate-950 transition-colors"
                    >
                        ← Back to Sign In
                    </Link>
                </div>
            </GlassCard>
        </main>
    )
}
