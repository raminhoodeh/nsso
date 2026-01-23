'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import GlassButton from '@/components/ui/GlassButton'
import { useToast } from '@/components/ui/Toast'
import { useUser } from '@/components/providers/UserProvider'
import { createClient } from '@/lib/supabase/client'

interface OwnerProfileNavProps {
    username: string
}

export default function OwnerProfileNav({ username }: OwnerProfileNavProps) {
    const router = useRouter()
    const { showToast } = useToast()
    const { user } = useUser()
    const isAdmin = user?.user_type === 'admin'
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const supabase = createClient()

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false)
    }, [])

    // Prevent body scroll when menu is open
    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = ''
        }
        return () => {
            document.body.style.overflow = ''
        }
    }, [mobileMenuOpen])

    const copyProfileUrl = () => {
        const url = `${window.location.origin}/${username}`
        navigator.clipboard.writeText(url)
        showToast('Profile URL copied!', 'success')
    }

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        window.location.href = '/'
    }

    return (
        <nav className="fixed top-0 left-0 right-0 z-[5000] bg-black/20 backdrop-blur-md">
            <div className="max-w-[1470px] mx-auto px-6 lg:px-[165px] h-[72px] flex items-center justify-between">
                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center gap-4 w-full justify-between">
                    <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/dashboard')}
                    >
                        ← Back to Dashboard
                    </GlassButton>

                    <div className="flex items-center gap-4">
                        {isAdmin && (
                            <Link href="/admin">
                                <GlassButton variant="ghost" size="sm">
                                    Admin
                                </GlassButton>
                            </Link>
                        )}
                        <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={copyProfileUrl}
                        >
                            Copy page URL
                        </GlassButton>
                        <GlassButton
                            variant="secondary"
                            size="sm"
                            onClick={handleSignOut}
                        >
                            Sign Out
                        </GlassButton>
                    </div>
                </div>

                {/* Mobile Navigation */}
                <div className="flex md:hidden items-center gap-3 w-full justify-between">
                    <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/dashboard')}
                    >
                        ← Dashboard
                    </GlassButton>

                    {/* Hamburger Button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                        aria-label="Toggle menu"
                    >
                        <svg
                            className="w-6 h-6"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            {mobileMenuOpen ? (
                                <path d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path d="M4 6h16M4 12h16M4 18h16" />
                            )}
                        </svg>
                    </button>

                    {/* Mobile Slide-out Menu */}
                    {mobileMenuOpen && (
                        <>
                            {/* Backdrop */}
                            <div
                                className="fixed inset-0 bg-black/50 z-[5001]"
                                onClick={() => setMobileMenuOpen(false)}
                            />

                            {/* Menu Panel */}
                            <div className="fixed top-0 right-0 bottom-0 w-64 bg-[#0a0f1a]/95 backdrop-blur-xl z-[5002] shadow-2xl border-l border-white/10 animate-slide-in-right">
                                <div className="flex flex-col h-full">
                                    {/* Header */}
                                    <div className="flex items-center justify-between p-6 border-b border-white/10">
                                        <span className="text-white font-medium">Menu</span>
                                        <button
                                            onClick={() => setMobileMenuOpen(false)}
                                            className="p-1 text-white/60 hover:text-white transition-colors"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="flex flex-col gap-2 p-4 flex-1">
                                        <button
                                            onClick={() => {
                                                copyProfileUrl()
                                                setMobileMenuOpen(false)
                                            }}
                                            className="w-full text-left px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors"
                                        >
                                            Copy page URL
                                        </button>

                                        {isAdmin && (
                                            <Link
                                                href="/admin"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="w-full text-left px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors block"
                                            >
                                                Admin
                                            </Link>
                                        )}

                                        <div className="border-t border-white/10 my-2" />

                                        <button
                                            onClick={() => {
                                                handleSignOut()
                                                setMobileMenuOpen(false)
                                            }}
                                            className="w-full text-left px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                        >
                                            Sign Out
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Add slide-in animation */}
            <style jsx>{`
                @keyframes slide-in-right {
                    from {
                        transform: translateX(100%);
                    }
                    to {
                        transform: translateX(0);
                    }
                }
                .animate-slide-in-right {
                    animation: slide-in-right 0.3s ease-out;
                }
            `}</style>
        </nav>
    )
}
