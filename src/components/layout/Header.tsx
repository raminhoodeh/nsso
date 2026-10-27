'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import GlassButton from '@/components/ui/GlassButton'
import { useToast } from '@/components/ui/Toast'
import { useUser } from '@/components/providers/UserProvider'
import { boundedClientRead } from '@/lib/client-read'
import { routeUsesMobileProfileMenu } from '@/lib/tahoe-glass/route-boundaries'
import { useState, useEffect, useCallback, Suspense, type ReactNode } from 'react'
import { ChevronRight, Eye, LayoutDashboard, Link as LinkIcon, LogOut, Newspaper, ShieldCheck, Sparkles, UserRound, UsersRound, X } from 'lucide-react'
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

const MENU_ROW_CLASS = 'group flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-950 outline-none transition-colors hover:bg-white/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950/70'

function MenuRowContent({ icon, children, trailing }: { icon: ReactNode; children: ReactNode; trailing?: ReactNode }) {
    return <>
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/70 bg-white/45 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">{icon}</span>
        <span className="min-w-0 flex-1">{children}</span>
        {trailing || <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-600" />}
    </>
}

function MobileMenuNavigation({ pathname, isAdmin, signingOut, close, copyProfileUrl, handleSignOut, runAfterClose }: {
    pathname: string
    isAdmin: boolean
    signingOut: boolean
    close: () => void
    copyProfileUrl: () => Promise<void>
    handleSignOut: () => Promise<void>
    runAfterClose: (action: 'deity' | 'news') => void
}) {
    const searchParams = useSearchParams()
    const currentView = searchParams.get('view') || 'profile'
    const dashboardHref = (view: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('view', view)
        return `/dashboard?${params.toString()}`
    }
    const isDashboardHome = pathname === '/dashboard' || pathname === '/dashboard/'
    const iconClass = 'h-[19px] w-[19px]'
    const groupClass = 'rounded-[24px] border border-white/70 bg-white/25 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_5px_18px_rgba(30,41,59,0.05)]'

    return <nav aria-label="Account and profile" className="space-y-6">
        <section data-mobile-menu-group="profile" aria-labelledby="mobile-menu-profile-heading">
            <h3 id="mobile-menu-profile-heading" className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Your nsso</h3>
            <div className={groupClass}>
                <Link href={dashboardHref('profile')} onClick={close} className={cn(MENU_ROW_CLASS, isDashboardHome && currentView === 'profile' && 'bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]')} aria-current={isDashboardHome && currentView === 'profile' ? 'page' : undefined}>
                    <MenuRowContent icon={<UserRound className={iconClass} />}>Edit Profile</MenuRowContent>
                </Link>
                <Link href={dashboardHref('my-nsso')} onClick={close} className={cn(MENU_ROW_CLASS, isDashboardHome && currentView === 'my-nsso' && 'bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]')} aria-current={isDashboardHome && currentView === 'my-nsso' ? 'page' : undefined}>
                    <MenuRowContent icon={<UsersRound className={iconClass} />}>My nsso</MenuRowContent>
                </Link>
                <button type="button" onClick={() => runAfterClose('deity')} className={MENU_ROW_CLASS}>
                    <MenuRowContent icon={<Sparkles className={iconClass} />}>Deity</MenuRowContent>
                </button>
                <button type="button" onClick={() => runAfterClose('news')} className={MENU_ROW_CLASS}>
                    <MenuRowContent icon={<Newspaper className={iconClass} />} trailing={<span className="shrink-0 rounded-full border border-slate-500/20 bg-white/55 px-2 py-1 text-[10px] font-semibold text-slate-700">Coming soon</span>}>News Feed</MenuRowContent>
                </button>
            </div>
        </section>
        <section data-mobile-menu-group="sharing" aria-labelledby="mobile-menu-sharing-heading">
            <h3 id="mobile-menu-sharing-heading" className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Preview &amp; share</h3>
            <div className={groupClass}>
                <Link href="/preview" onClick={close} className={MENU_ROW_CLASS} aria-current={pathname === '/preview' ? 'page' : undefined}>
                    <MenuRowContent icon={<Eye className={iconClass} />}>Preview Profile</MenuRowContent>
                </Link>
                <button type="button" onClick={() => { void copyProfileUrl(); close() }} className={MENU_ROW_CLASS}>
                    <MenuRowContent icon={<LinkIcon className={iconClass} />}>Copy profile URL</MenuRowContent>
                </button>
            </div>
        </section>
        <section data-mobile-menu-group="account" aria-labelledby="mobile-menu-account-heading">
            <h3 id="mobile-menu-account-heading" className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Account</h3>
            <div className={groupClass}>
                <Link href="/dashboard/security" onClick={close} className={MENU_ROW_CLASS} aria-current={pathname === '/dashboard/security' ? 'page' : undefined}>
                    <MenuRowContent icon={<ShieldCheck className={iconClass} />}>Account security</MenuRowContent>
                </Link>
                {isAdmin && <Link href="/admin" onClick={close} className={MENU_ROW_CLASS} aria-current={pathname === '/admin' ? 'page' : undefined}>
                    <MenuRowContent icon={<LayoutDashboard className={iconClass} />}>Admin</MenuRowContent>
                </Link>}
            </div>
        </section>
        <button type="button" onClick={() => { void handleSignOut() }} disabled={signingOut} className={cn(MENU_ROW_CLASS, 'border border-rose-900/10 bg-white/35 text-rose-900 hover:bg-white/65 disabled:cursor-wait disabled:opacity-60')}>
            <MenuRowContent icon={<LogOut className={iconClass} />} trailing={<span aria-hidden="true" />}>{signingOut ? 'Signing out…' : 'Sign Out'}</MenuRowContent>
        </button>
    </nav>
}

export default function Header({ showAuthButtons = true, variant = 'default', username, className }: HeaderProps) {
    const { user } = useUser()
    const isAdmin = user?.user_type === 'admin'
    const supabase = createClient()
    const pathname = usePathname()
    const usesProfileEditorMenu = routeUsesMobileProfileMenu(pathname)
    const lightHome = pathname === '/'
    const router = useRouter()
    const { showToast } = useToast()
    const [signingOut, setSigningOut] = useState(false)
    const [pendingMenuAction, setPendingMenuAction] = useState<{ action: 'deity' | 'news'; pathname: string } | null>(null)
    const [mobileMenuState, setMobileMenuState] = useState({ open: false, pathname })
    const mobileMenuOpen = Boolean(user) && mobileMenuState.open && mobileMenuState.pathname === pathname
    const setMobileMenuOpen = useCallback((open: boolean) => {
        if (open) setPendingMenuAction(null)
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

    // Let the drawer release its focus trap, inert background and iOS body lock
    // before another modal (Deity) opens or a toast is announced.
    useEffect(() => {
        if (mobileMenuOpen || !pendingMenuAction) return
        const frame = window.requestAnimationFrame(() => {
            setPendingMenuAction(null)
            if (!user || pendingMenuAction.pathname !== pathname) return
            if (pendingMenuAction.action === 'deity') {
                window.dispatchEvent(new CustomEvent('open-deity-chat'))
            } else {
                showToast('News Feed coming soon', 'info')
            }
        })
        return () => window.cancelAnimationFrame(frame)
    }, [mobileMenuOpen, pendingMenuAction, pathname, showToast, user])

    const runAfterMenuClose = (action: 'deity' | 'news') => {
        setPendingMenuAction({ action, pathname })
        setMobileMenuOpen(false)
    }

    const handleSignOut = async () => {
        if (signingOut) return
        setSigningOut(true)
        try {
            // A deadline does not replay or claim rollback of the SDK request.
            const { error } = await boundedClientRead(() => supabase.auth.signOut())
            if (error) throw error
            window.location.href = '/'
        } catch {
            showToast('Sign-out could not be confirmed. Please try again.', 'error')
            setSigningOut(false)
        }
    }

    const copyProfileUrl = async () => {
        const targetUsername = username || user?.username
        if (!targetUsername) {
            showToast('Choose a profile name before sharing your URL.', 'info')
            return
        }
        const url = `${window.location.origin}/${targetUsername}`
        try {
            await navigator.clipboard.writeText(url)
            showToast('Profile URL copied to clipboard!', 'success')
        } catch {
            showToast('Could not copy the profile URL. Please try again.', 'error')
        }
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
            className={cn("fixed top-0 left-0 right-0 z-[5000]", user && (usesProfileEditorMenu ? "lg:hidden" : "md:hidden"), className)}
            contentClassName="h-full w-full"
            displacementProfile="prism-top"
            materialLighting="uniform"
            tone={lightHome ? 'dark' : 'inherit'}
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
                            className={cn("flex items-center", user && (usesProfileEditorMenu ? "lg:hidden" : "md:hidden"))}
                            onMouseEnter={() => router.prefetch(user ? "/?view=home" : "/")}
                        >
                            <Image
                                src="/assets/nsso-logo.png"
                                alt="nsso"
                                width={458}
                                height={224}
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
                        <TahoeGlassSurface as="a" variant="button" href="/sign-in" onMouseEnter={() => router.prefetch('/sign-in')}
                            tone={lightHome ? 'dark' : 'light'} semanticTint={lightHome ? 'light' : 'none'} semanticTintOpacity={0.2}
                            className="flex min-h-11 items-center px-4 py-2 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                            contentClassName={lightHome ? 'text-center text-slate-950' : 'text-center text-white'}>
                            SIGN IN / SIGN UP
                        </TahoeGlassSurface>
                    )}
                </div>

                {/* --- MOBILE NAVIGATION (HAMBURGER) --- */}
                <div className={cn("ml-auto flex items-center gap-2 min-[360px]:gap-3", user && usesProfileEditorMenu ? "lg:hidden" : "md:hidden")}>

                    {/* Default Mode: Contextual Button (Preview/Copy) */}
                    {!isOwnerMode && showAuthButtons && user && primaryMobileButton}

                    {/* Every account needs access to security and session controls. */}
                    {user && (
                        <TahoeGlassButton
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            radius={8}
                            className="h-11 w-11 p-0 text-white transition-colors"
                            contentClassName="text-white"
                            tone="light"
                            aria-label="Open account menu"
                            aria-expanded={mobileMenuOpen}
                            aria-controls="mobile-account-menu"
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

                    {/* Mobile Slide-out Menu */}
                    <TahoeGlassDialog
                        id="mobile-account-menu"
                        open={mobileMenuOpen}
                        onOpenChange={setMobileMenuOpen}
                        radius="32px 0 0 32px"
                        tone="dark"
                        aria-label="Menu"
                        preventBodyScroll={false}
                        overlayClassName="z-[5001] items-stretch justify-end p-0"
                        backdropClassName="bg-black/70"
                        className="h-[100dvh] max-h-[100dvh] w-[min(368px,calc(100vw_-_16px))] max-w-none animate-slide-in-right overflow-hidden p-0"
                        contentClassName="h-full w-full"
                        tracking="continuous"
                    >
                        <div data-mobile-account-menu="true" className="flex h-full flex-col overflow-hidden rounded-l-[32px] bg-[#e3e7ed] bg-[linear-gradient(155deg,rgba(255,255,255,0.45),rgba(226,226,237,0.65)_48%,rgba(236,224,226,0.85))] text-slate-950 [text-shadow:none] shadow-[-24px_0_64px_rgba(0,0,0,0.28)]">
                            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-500/15 pb-5 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))]">
                                <div className="flex min-w-0 items-center gap-3">
                                    <Image src="/assets/nsso-logo.png" alt="nsso" width={458} height={224} className="h-8 w-auto" />
                                    <span className="border-l border-slate-500/25 pl-3 text-lg font-semibold tracking-tight">Menu</span>
                                </div>
                                <button type="button" onClick={() => setMobileMenuOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/45 text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_3px_10px_rgba(30,41,59,0.08)] outline-none hover:bg-white/75 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950/70" aria-label="Close menu">
                                    <X aria-hidden="true" className="h-5 w-5" />
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-5" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                                <Suspense fallback={<p className="p-3 text-sm text-slate-600">Loading menu…</p>}>
                                    <MobileMenuNavigation pathname={pathname} isAdmin={isAdmin} signingOut={signingOut} close={() => setMobileMenuOpen(false)} copyProfileUrl={copyProfileUrl} handleSignOut={handleSignOut} runAfterClose={runAfterMenuClose} />
                                </Suspense>
                            </div>
                        </div>
                    </TahoeGlassDialog>


                    {/* Mobile - Not logged in (Default Mode Only) */}
                    {!isOwnerMode && showAuthButtons && !user && (
                        <TahoeGlassSurface as="a" variant="button" href="/sign-in"
                            tone={lightHome ? 'dark' : 'light'} semanticTint={lightHome ? 'light' : 'none'} semanticTintOpacity={0.2}
                            className="flex min-h-11 items-center px-4 py-2 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                            contentClassName={lightHome ? 'text-center text-slate-950' : 'text-center text-white'}>
                            SIGN IN / SIGN UP
                        </TahoeGlassSurface>
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
