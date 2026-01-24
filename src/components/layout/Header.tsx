'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GlassButton from '@/components/ui/GlassButton'
import { useToast } from '@/components/ui/Toast'
import { useUser } from '@/components/providers/UserProvider'
import { useState, useEffect } from 'react'

interface HeaderProps {
    showAuthButtons?: boolean
    variant?: 'default' | 'owner'
    username?: string
}

export default function Header({ showAuthButtons = true, variant = 'default', username }: HeaderProps) {
    const { user } = useUser()
    const isAdmin = user?.user_type === 'admin'
    const supabase = createClient()
    const pathname = usePathname()
    const router = useRouter()
    const { showToast } = useToast()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false)
    }, [pathname])

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

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        window.location.href = '/'
    }

    const copyProfileUrl = () => {
        const targetUsername = username || user?.username
        if (!targetUsername) return
        const url = `${window.location.origin}/${targetUsername}`
        navigator.clipboard.writeText(url)
        showToast('Profile URL copied to clipboard!', 'success')
    }

    // Determine content based on variant
    const isOwnerMode = variant === 'owner'

    // Determine which primary button to show on mobile (Default Mode)
    const isPreviewPage = pathname === '/preview' || (user?.username && pathname.startsWith(`/${user.username}`))
    const primaryMobileButton = isPreviewPage ? (
        <GlassButton
            variant="ghost"
            size="sm"
            onClick={copyProfileUrl}
        >
            Copy page URL
        </GlassButton>
    ) : (
        <button
            onClick={() => router.push('/preview')}
            className="px-4 py-2 rounded-full text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
                backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(192,192,192,0.4)), url(/siri-gradient.png)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2)'
            }}
        >
            Preview Page
        </button>
    )

    return (
        <header className="fixed top-0 left-0 right-0 z-[5000]">
            {/* Liquid Glass Overlay (System Integrated) */}
            <div
                className="!absolute inset-0 glass-style-navbar"
                aria-hidden="true"
            >
                <div className="glass-specular" aria-hidden="true" />
            </div>

            <nav className="relative z-[60] max-w-[1470px] mx-auto px-6 lg:px-[165px] h-[88px] flex items-center justify-between">

                {/* --- LEFT SIDE (Except for Owner Mobile) --- */}
                {isOwnerMode ? (
                    // OWNER MODE: Back to Dashboard button on Desktop
                    <div className="hidden md:flex">
                        <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push('/dashboard')}
                            onMouseEnter={() => router.prefetch('/dashboard')}
                        >
                            ← Back to Dashboard
                        </GlassButton>
                    </div>
                ) : (
                    // DEFAULT MODE: Logo
                    <Link
                        href={user ? "/?view=home" : "/"}
                        className="flex items-center"
                        onMouseEnter={() => router.prefetch(user ? "/?view=home" : "/")}
                    >
                        <Image
                            src="/assets/nsso-logo.png"
                            alt="nsso"
                            width={80}
                            height={32}
                            className="h-8 w-auto"
                            priority
                        />
                    </Link>
                )}

                {/* --- RIGHT SIDE / DESKTOP NAV --- */}
                <div className="hidden md:flex items-center gap-4">
                    {/* OWNER MODE DESKTOP */}
                    {isOwnerMode ? (
                        <div className="flex items-center gap-4">
                            {isAdmin && (
                                <Link href="/admin" onMouseEnter={() => router.prefetch('/admin')}>
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
                    ) : (
                        // DEFAULT MODE DESKTOP
                        showAuthButtons && (
                            <>
                                {isAdmin && (
                                    <Link href="/admin" onMouseEnter={() => router.prefetch('/admin')}>
                                        <GlassButton variant="ghost" size="sm">
                                            Admin
                                        </GlassButton>
                                    </Link>
                                )}
                                {user ? (
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => router.push('/preview')}
                                            onMouseEnter={() => router.prefetch('/preview')}
                                            className="px-4 py-2 rounded-full text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
                                            style={{
                                                backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(192,192,192,0.4)), url(/siri-gradient.png)`,
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center',
                                                boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2)'
                                            }}
                                        >
                                            Preview Page
                                        </button>

                                        <GlassButton
                                            variant="ghost"
                                            size="sm"
                                            onClick={copyProfileUrl}
                                        >
                                            Copy page URL
                                        </GlassButton>

                                        {pathname !== '/dashboard' && (
                                            <Link href="/dashboard" onMouseEnter={() => router.prefetch('/dashboard')}>
                                                <GlassButton variant="ghost" size="sm">
                                                    Dashboard
                                                </GlassButton>
                                            </Link>
                                        )}

                                        <GlassButton
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleSignOut}
                                        >
                                            Sign Out
                                        </GlassButton>
                                    </div>
                                ) : (
                                    <Link href="/sign-in" onMouseEnter={() => router.prefetch('/sign-in')}>
                                        <GlassButton variant="secondary" size="sm">
                                            SIGN IN / SIGN UP
                                        </GlassButton>
                                    </Link>
                                )}
                            </>
                        )
                    )}
                </div>

                {/* --- MOBILE NAVIGATION (HAMBURGER) --- */}
                <div className="flex md:hidden items-center gap-3 ml-auto">

                    {/* Default Mode: Contextual Button (Preview/Copy) */}
                    {!isOwnerMode && showAuthButtons && user && primaryMobileButton}

                    {/* Common Hamburger Menu for Logged In Users (Both Modes) */}
                    {(isOwnerMode || (showAuthButtons && user)) && (
                        <>
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
                                            {/* Menu Header */}
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

                                                {/* Button: Copy Page URL (Both Modes) */}
                                                <button
                                                    onClick={() => {
                                                        copyProfileUrl()
                                                        setMobileMenuOpen(false)
                                                    }}
                                                    className="w-full text-left px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors"
                                                >
                                                    Copy page URL
                                                </button>

                                                {/* Default Mode: Preview Page Button (if not on preview) */}
                                                {!isOwnerMode && !isPreviewPage && (
                                                    <button
                                                        onClick={() => {
                                                            router.push('/preview')
                                                            setMobileMenuOpen(false)
                                                        }}
                                                        className="w-full text-left px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors"
                                                    >
                                                        Preview Page
                                                    </button>
                                                )}

                                                {/* Owner Mode: Back to Dashboard */}
                                                {isOwnerMode && (
                                                    <Link
                                                        href="/dashboard"
                                                        onClick={() => setMobileMenuOpen(false)}
                                                        className="w-full text-left px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors block"
                                                    >
                                                        Back to Dashboard
                                                    </Link>
                                                )}

                                                {/* Regular Mode: Dashboard (if not on dashboard) */}
                                                {!isOwnerMode && pathname !== '/dashboard' && (
                                                    <Link
                                                        href="/dashboard"
                                                        onClick={() => setMobileMenuOpen(false)}
                                                        className="w-full text-left px-4 py-3 text-white hover:bg-white/10 rounded-lg transition-colors block"
                                                    >
                                                        Dashboard
                                                    </Link>
                                                )}

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
                        </>
                    )}

                    {/* Mobile - Not logged in (Default Mode Only) */}
                    {!isOwnerMode && showAuthButtons && !user && (
                        <Link href="/sign-in">
                            <GlassButton variant="secondary" size="sm">
                                SIGN IN / SIGN UP
                            </GlassButton>
                        </Link>
                    )}
                </div>
            </nav>

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
        </header>
    )
}
