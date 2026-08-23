'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import GlassButton from '@/components/ui/GlassButton'
import { useToast } from '@/components/ui/Toast'
import { useUser } from '@/components/providers/UserProvider'
import { useState, useEffect, useCallback } from 'react'
import { LogOut } from 'lucide-react'
import {
    TahoeBackdropHeader,
    TahoeGlassButton,
    TahoeGlassDialog,
    TahoeGlassSurface
} from '@/components/ui/tahoe-glass'

interface HeaderProps {
    showAuthButtons?: boolean
    variant?: 'default' | 'owner'
    username?: string
    className?: string
}

export default function Header({ showAuthButtons = true, variant = 'default', username, className }: HeaderProps) {
    const { user } = useUser()
    const isAdmin = user?.user_type === 'admin'
    const supabase = createClient()
    const pathname = usePathname()
    const router = useRouter()
    const { showToast } = useToast()
    const [mobileMenuState, setMobileMenuState] = useState({ open: false, pathname })
    const mobileMenuOpen = mobileMenuState.open && mobileMenuState.pathname === pathname
    const setMobileMenuOpen = useCallback((open: boolean) => {
        setMobileMenuState({ open, pathname })
    }, [pathname])

    // ... (rest)

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
    const isPreviewPage = pathname === '/preview' || (user?.username && pathname?.startsWith(`/${user.username}`))
    const primaryMobileButton = isPreviewPage ? (
        <GlassButton
            variant="ghost"
            size="sm"
            onClick={copyProfileUrl}
        >
            Copy profile URL
        </GlassButton>
    ) : (
        <TahoeGlassButton
            onClick={() => router.push('/preview')}
            className="px-4 py-2 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            contentClassName="text-white"
            tone="light"
        >
            Preview Profile
        </TahoeGlassButton>
    )

    return (
        <TahoeBackdropHeader
            radius="0 0 24px 24px"
            className={cn("fixed top-0 left-0 right-0 z-[5000]", user && "md:hidden", className)}
            contentClassName="h-full w-full"
        >
            <nav className="relative z-[60] max-w-[1800px] mx-auto px-6 lg:px-10 h-[88px] flex items-center justify-between">

                {/* --- LEFT SIDE (Except for Owner Mobile) --- */}
                {isOwnerMode ? (
                    // OWNER MODE: Edit Profile button REMOVED as per Phase 7 requirements
                    // Also hidden on desktop if user is logged in (handled by parent logic or CSS)
                    /* --- DESKTOP HIDING LOGIC --- */
                    /* We want to hide the ENTIRE nav content on desktop if user is logged in,
                       BUT we might still want the Logo to be visible?
                       User said: "there is no more need for a nav bar on desktop once the user has logged in."
                       So we should invalid render or return null for desktop if user is logged in?
                       Actually, let's wrap the desktop specific parts.
                     */
                    <div className="hidden md:flex">
                        {/* Space reserved if needed later */}
                    </div>
                ) : (
                    // DEFAULT MODE: Logo
                    // Show logo ONLY if NOT logged in OR on Mobile
                    // If logged in on desktop -> Sidebar has logo.
                    (!user || true) && ( // logic check: we sidebar has logo.
                        <Link
                            href={user ? "/?view=home" : "/"}
                            className={user ? "flex md:hidden items-center" : "flex items-center"}
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
                    )
                )}

                {/* --- RIGHT SIDE / DESKTOP NAV --- */}
                {/* COMPLETELY HIDDEN ON DESKTOP IF LOGGED IN */}
                <div className="hidden md:flex items-center gap-4">
                    {!user && (
                        <Link href="/sign-in" onMouseEnter={() => router.prefetch('/sign-in')}>
                            <GlassButton variant="secondary" size="sm">
                                SIGN IN / SIGN UP
                            </GlassButton>
                        </Link>
                    )}
                </div>

                {/* --- MOBILE NAVIGATION (HAMBURGER) --- */}
                <div className="flex md:hidden items-center gap-3 ml-auto">

                    {/* Default Mode: Contextual Button (Preview/Copy) */}
                    {!isOwnerMode && showAuthButtons && user && primaryMobileButton}

                    {/* Hamburger Menu ONLY for Admin */}
                    {isAdmin && (
                        <TahoeGlassButton
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            radius={8}
                            className="p-2 text-white transition-colors"
                            contentClassName="text-white"
                            tone="light"
                            aria-label="Toggle menu"
                            aria-expanded={mobileMenuOpen}
                            aria-controls="mobile-admin-menu"
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
                        </TahoeGlassButton>
                    )}

                    {/* Non-Admin Mobile: Sign Out Icon */}
                    {user && !isAdmin && (
                        <TahoeGlassButton
                            onClick={handleSignOut}
                            radius={8}
                            className="p-2 text-white/80 transition-colors hover:text-white"
                            contentClassName="text-inherit"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.08}
                            aria-label="Sign Out"
                        >
                            <LogOut size={20} />
                        </TahoeGlassButton>
                    )}

                    {/* Mobile Slide-out Menu */}
                    <TahoeGlassDialog
                        id="mobile-admin-menu"
                        open={mobileMenuOpen}
                        onOpenChange={setMobileMenuOpen}
                        radius="32px 0 0 32px"
                        tone="light"
                        aria-label="Menu"
                        overlayClassName="z-[5001] items-stretch justify-end p-0"
                        backdropClassName="bg-black/50"
                        className="h-[100dvh] max-h-[100dvh] w-64 max-w-64 animate-slide-in-right rounded-none p-0"
                        contentClassName="h-full w-full"
                        tracking="continuous"
                    >
                                <div className="flex flex-col h-full">
                                    {/* Menu Header */}
                                    <div className="flex items-center justify-between p-6 border-b border-white/10">
                                        <span className="text-white font-medium">Menu</span>
                                        <TahoeGlassButton
                                            onClick={() => setMobileMenuOpen(false)}
                                            radius={8}
                                            className="p-1 text-white/60 transition-colors hover:text-white"
                                            contentClassName="text-inherit"
                                            tone="light"
                                            aria-label="Close menu"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </TahoeGlassButton>
                                    </div>

                                    {/* Menu Items */}
                                    <div className="flex flex-col gap-2 p-4 flex-1">

                                        {/* Button: Copy Page URL (Both Modes) */}
                                        <TahoeGlassButton
                                            onClick={() => {
                                                copyProfileUrl()
                                                setMobileMenuOpen(false)
                                            }}
                                            radius={8}
                                            className="w-full px-4 py-3 text-left text-white transition-colors"
                                            contentClassName="w-full justify-start text-inherit"
                                            tone="light"
                                        >
                                            Copy profile URL
                                        </TahoeGlassButton>

                                        {/* Default Mode: Preview Page Button (if not on preview) */}
                                        {!isOwnerMode && !isPreviewPage && (
                                            <TahoeGlassButton
                                                onClick={() => {
                                                    router.push('/preview')
                                                    setMobileMenuOpen(false)
                                                }}
                                                radius={8}
                                                className="w-full px-4 py-3 text-left text-white transition-colors"
                                                contentClassName="w-full justify-start text-inherit"
                                                tone="light"
                                            >
                                                Preview Profile
                                            </TahoeGlassButton>
                                        )}

                                        {/* Owner Mode: Edit Profile */}
                                        {isOwnerMode && (
                                            <TahoeGlassSurface
                                                as="a"
                                                variant="button"
                                                radius={8}
                                                href="/dashboard"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="block w-full px-4 py-3 text-left text-white transition-colors"
                                                contentClassName="w-full text-left"
                                                tone="light"
                                            >
                                                Edit Profile
                                            </TahoeGlassSurface>
                                        )}

                                        {/* Regular Mode: Dashboard (if not on dashboard) */}
                                        {!isOwnerMode && pathname !== '/dashboard' && (
                                            <TahoeGlassSurface
                                                as="a"
                                                variant="button"
                                                radius={8}
                                                href="/dashboard"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="block w-full px-4 py-3 text-left text-white transition-colors"
                                                contentClassName="w-full text-left"
                                                tone="light"
                                            >
                                                Dashboard
                                            </TahoeGlassSurface>
                                        )}

                                        {isAdmin && (
                                            <TahoeGlassSurface
                                                as="a"
                                                variant="button"
                                                radius={8}
                                                href="/admin"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="block w-full px-4 py-3 text-left text-white transition-colors"
                                                contentClassName="w-full text-left"
                                                tone="light"
                                            >
                                                Admin
                                            </TahoeGlassSurface>
                                        )}

                                        <div className="border-t border-white/10 my-2" />

                                        <TahoeGlassButton
                                            onClick={() => {
                                                handleSignOut()
                                                setMobileMenuOpen(false)
                                            }}
                                            radius={8}
                                            className="w-full px-4 py-3 text-left text-red-400 transition-colors"
                                            contentClassName="w-full justify-start text-inherit"
                                            tone="light"
                                            semanticTint="dark"
                                            semanticTintOpacity={0.1}
                                        >
                                            Sign Out
                                        </TahoeGlassButton>
                                    </div>
                                </div>
                    </TahoeGlassDialog>


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
        </TahoeBackdropHeader>
    )
}
