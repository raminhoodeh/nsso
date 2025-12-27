'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

export default function ResetPasswordPage() {
    const supabase = createClient()
    const { showToast } = useToast()

    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState('')

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        })

        if (error) {
            setError(error.message)
            setLoading(false)
        } else {
            setSent(true)
            showToast('Reset link sent!', 'success')
        }
    }

    if (sent) {
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

                    {/* Success Message */}
                    <div className="text-center">
                        <div className="text-4xl mb-4">✉️</div>
                        <h1 className="text-2xl font-bold text-white mb-2">
                            Check your email
                        </h1>
                        <p className="text-white/70 mb-6">
                            We've sent a password reset link to <strong>{email}</strong>
                        </p>
                        <Link href="/sign-in">
                            <GlassButton variant="secondary" fullWidth>
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
                        Reset your password
                    </h1>
                    <p className="text-white/70">
                        Enter your email and we'll send you a reset link.
                    </p>
                </div>

                {/* Reset Form */}
                <form onSubmit={handleResetPassword} className="space-y-4">
                    <Input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    {error && (
                        <p className="text-red-400 text-sm text-center">{error}</p>
                    )}

                    <GlassButton
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={loading}
                    >
                        {loading ? 'Sending...' : 'Send Reset Link'}
                    </GlassButton>
                </form>

                {/* Back to Sign In */}
                <div className="text-center mt-6 pt-6 border-t border-white/10">
                    <Link
                        href="/sign-in"
                        className="text-white/70 hover:text-white transition-colors"
                    >
                        ← Back to Sign In
                    </Link>
                </div>
            </GlassCard>
        </main>
    )
}
