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
    TahoeGlassDialog
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

    // Lock the visual viewport while the mobile sheet is open. iOS ignores an
    // overflow-only lock, which previously let the dashboard move behind the
    // already-translucent menu and made both layers difficult to read.
    useEffect(() => {
        if (!mobileMenuOpen) return

        const body = document.body
        const root = document.documentElement
        const scrollX = window.scrollX
        const scrollY = window.scrollY
        const previousBodyStyles = {
            position: body.style.position,
            top: body.style.top,
            left: body.style.left,
            width: body.style.width,
            overflow: body.style.overflow,
            overscrollBehavior: body.style.overscrollBehavior,
        }
        const previousRootStyles = {
            overflow: root.style.overflow,
            overscrollBehavior: root.style.overscrollBehavior,
        }

        body.style.position = 'fixed'
        body.style.top = `${-scrollY}px`
        body.style.left = `${-scrollX}px`
        body.style.width = '100%'
        body.style.overflow = 'hidden'
        body.style.overscrollBehavior = 'none'
        root.style.overflow = 'hidden'
        root.style.overscrollBehavior = 'none'

        return () => {
            Object.assign(body.style, previousBodyStyles)
            Object.assign(root.style, previousRootStyles)
            window.scrollTo(scrollX, scrollY)
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
            className="min-h-11 px-3 min-[360px]:px-4"
        >
            <span className="min-[360px]:hidden">Copy URL</span>
            <span className="hidden min-[360px]:inline">Copy profile URL</span>
        </GlassButton>
    ) : (
        <TahoeGlassButton
            onClick={() => router.push('/preview')}
            className="min-h-11 px-3 py-2 text-sm font-medium transition-all min-[360px]:px-4 hover:scale-[1.02] active:scale-[0.98]"
            contentClassName="text-white"
            tone="light"
        >
            <span className="min-[360px]:hidden">Preview</span>
            <span className="hidden min-[360px]:inline">Preview Profile</span>
        </TahoeGlassButton>
    )

    return (
        <TahoeBackdropHeader
            radius="0 0 24px 24px"
            className={cn("fixed top-0 left-0 right-0 z-[5000]", user && "md:hidden", className)}
            contentClassName="h-full w-full"
            displacementProfile="edge"
            materialLighting="uniform"
        >
            <nav className="relative z-[60] mx-auto flex h-[calc(88px+env(safe-area-inset-top))] max-w-[1800px] items-center justify-between pb-0 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] sm:pl-[max(24px,env(safe-area-inset-left))] sm:pr-[max(24px,env(safe-area-inset-right))] lg:px-10">

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
                <div className="ml-auto flex items-center gap-2 min-[360px]:gap-3 md:hidden">

                    {/* Default Mode: Contextual Button (Preview/Copy) */}
                    {!isOwnerMode && showAuthButtons && user && primaryMobileButton}

                    {/* Hamburger Menu ONLY for Admin */}
                    {isAdmin && (
                        <TahoeGlassButton
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            radius={8}
                            className="h-11 w-11 p-0 text-white transition-colors"
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
                            className="h-11 w-11 p-0 text-white/80 transition-colors hover:text-white"
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
                        preventBodyScroll={false}
                        overlayClassName="z-[5001] items-stretch justify-end p-0"
                        backdropClassName="bg-black/70"
                        className="h-[100dvh] max-h-[100dvh] w-[min(352px,calc(100vw_-_24px))] max-w-none animate-slide-in-right overflow-hidden p-0"
                        contentClassName="h-full w-full"
                        tracking="continuous"
                    >
                                <div className="flex h-full flex-col overflow-hidden rounded-l-[32px] bg-[#11161d] text-white shadow-[-24px_0_64px_rgba(0,0,0,0.42)]">
                                    {/* Menu Header */}
                                    <div className="flex items-center justify-between border-b border-white/10 pb-4 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))]">
                                        <span className="text-lg font-semibold text-white">Menu</span>
                                        <button
                                            type="button"
                                            onClick={() => setMobileMenuOpen(false)}
                                            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-[#222a35] text-white/80 outline-none transition-colors hover:bg-[#2a3441] hover:text-white focus-visible:ring-2 focus-visible:ring-white/80"
                                            aria-label="Close menu"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Menu Items */}
                                    <div
                                        className="flex flex-1 flex-col gap-2 overflow-y-auto pb-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4"
                                        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
                                    >

                                        {/* Button: Copy Page URL (Both Modes) */}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                copyProfileUrl()
                                                setMobileMenuOpen(false)
                                            }}
                                            className="min-h-12 w-full rounded-xl border border-white/10 bg-[#1a212b] px-4 py-3 text-left font-medium text-white outline-none transition-colors hover:bg-[#222a35] focus-visible:ring-2 focus-visible:ring-white/80"
                                        >
                                            Copy profile URL
                                        </button>

                                        {/* Default Mode: Preview Page Button (if not on preview) */}
                                        {!isOwnerMode && !isPreviewPage && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    router.push('/preview')
                                                    setMobileMenuOpen(false)
                                                }}
                                                className="min-h-12 w-full rounded-xl border border-white/10 bg-[#1a212b] px-4 py-3 text-left font-medium text-white outline-none transition-colors hover:bg-[#222a35] focus-visible:ring-2 focus-visible:ring-white/80"
                                            >
                                                Preview Profile
                                            </button>
                                        )}

                                        {/* Owner Mode: Edit Profile */}
                                        {isOwnerMode && (
                                            <Link
                                                href="/dashboard"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="flex min-h-12 w-full items-center rounded-xl border border-white/10 bg-[#1a212b] px-4 py-3 text-left font-medium text-white outline-none transition-colors hover:bg-[#222a35] focus-visible:ring-2 focus-visible:ring-white/80"
                                            >
                                                Edit Profile
                                            </Link>
                                        )}

                                        {/* Regular Mode: Dashboard (if not on dashboard) */}
                                        {!isOwnerMode && pathname !== '/dashboard' && (
                                            <Link
                                                href="/dashboard"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="flex min-h-12 w-full items-center rounded-xl border border-white/10 bg-[#1a212b] px-4 py-3 text-left font-medium text-white outline-none transition-colors hover:bg-[#222a35] focus-visible:ring-2 focus-visible:ring-white/80"
                                            >
                                                Dashboard
                                            </Link>
                                        )}

                                        {isAdmin && (
                                            <Link
                                                href="/admin"
                                                onClick={() => setMobileMenuOpen(false)}
                                                className="flex min-h-12 w-full items-center rounded-xl border border-white/10 bg-[#1a212b] px-4 py-3 text-left font-medium text-white outline-none transition-colors hover:bg-[#222a35] focus-visible:ring-2 focus-visible:ring-white/80"
                                            >
                                                Admin
                                            </Link>
                                        )}

                                        <div className="border-t border-white/10 my-2" />

                                        <button
                                            type="button"
                                            onClick={() => {
                                                handleSignOut()
                                                setMobileMenuOpen(false)
                                            }}
                                            className="min-h-12 w-full rounded-xl border border-red-300/15 bg-[#21191e] px-4 py-3 text-left font-medium text-red-300 outline-none transition-colors hover:bg-[#2b1e24] focus-visible:ring-2 focus-visible:ring-red-200/80"
                                        >
                                            Sign Out
                                        </button>
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
