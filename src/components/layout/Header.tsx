'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { LightCloseButton } from '@/components/ui/LightButton'
import GlassButton from '@/components/ui/GlassButton'
import NssoTopBar, { NSSO_TOPBAR_CONTENT_CLASS } from '@/components/layout/NssoTopBar'
import { useToast } from '@/components/ui/Toast'
import { useUser } from '@/components/providers/UserProvider'
import { boundedClientRead } from '@/lib/client-read'
import { canAccessAdmin } from '@/lib/admin-access'
import { isAccountDeletionAvailable } from '@/lib/delete-profile-client'
import DeleteProfileDialog from '@/components/layout/DeleteProfileDialog'
import { routeUsesMobileProfileMenu } from '@/lib/tahoe-glass/route-boundaries'
import { useState, useEffect, useCallback, Suspense, type ReactNode } from 'react'
import { ArrowLeft, ChevronRight, Eye, Home, LayoutDashboard, Link as LinkIcon, LogOut, Newspaper, Sparkles, Trash2, UserRound, UsersRound } from 'lucide-react'
import {
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

const MENU_ROW_CLASS = 'group flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[15px] font-medium text-slate-950 outline-none transition-colors hover:bg-white/65 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950/70'

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
    runAfterClose: (action: 'deity' | 'news' | 'delete-profile') => void
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
    const groupClass = cn(LIGHT_PANEL.group, 'rounded-[24px] p-1.5')

    return <nav aria-label="Account and profile" className="space-y-6">
        <section data-mobile-menu-group="profile" aria-labelledby="mobile-menu-profile-heading">
            <h3 id="mobile-menu-profile-heading" className="mb-2 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600">Your nsso</h3>
            <div className={groupClass}>
                <Link href="/?view=home" onClick={close} className={cn(MENU_ROW_CLASS, pathname === '/' && 'bg-white/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]')} aria-current={pathname === '/' ? 'page' : undefined}>
                    <MenuRowContent icon={<Home className={iconClass} />}>nsso homepage</MenuRowContent>
                </Link>
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
                {isAdmin && <Link href="/admin" onClick={close} className={MENU_ROW_CLASS} aria-current={pathname === '/admin' ? 'page' : undefined}>
                    <MenuRowContent icon={<LayoutDashboard className={iconClass} />}>Admin</MenuRowContent>
                </Link>}
                {isAccountDeletionAvailable() && <button type="button" onClick={() => runAfterClose('delete-profile')} className={cn(MENU_ROW_CLASS, 'text-rose-900')}>
                    <MenuRowContent icon={<Trash2 className={iconClass} />}>Delete my profile</MenuRowContent>
                </button>}
            </div>
        </section>
        <button type="button" onClick={() => { void handleSignOut() }} disabled={signingOut} className={cn(MENU_ROW_CLASS, 'border border-rose-900/10 bg-white/35 text-rose-900 hover:bg-white/65 disabled:cursor-wait disabled:opacity-60')}>
            <MenuRowContent icon={<LogOut className={iconClass} />} trailing={<span aria-hidden="true" />}>{signingOut ? 'Signing out…' : 'Sign Out'}</MenuRowContent>
        </button>
    </nav>
}

export default function Header({ showAuthButtons = true, variant = 'default', username, className }: HeaderProps) {
    const { user } = useUser()
    const isAdmin = canAccessAdmin(user)
    const supabase = createClient()
    const pathname = usePathname()
    const usesProfileEditorMenu = routeUsesMobileProfileMenu(pathname)
    const router = useRouter()
    const { showToast } = useToast()
    const [signingOut, setSigningOut] = useState(false)
    const [pendingMenuAction, setPendingMenuAction] = useState<{ action: 'deity' | 'news' | 'delete-profile'; pathname: string } | null>(null)
    const [deleteProfileOpen, setDeleteProfileOpen] = useState(false)
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
            } else if (pendingMenuAction.action === 'delete-profile') {
                setDeleteProfileOpen(true)
            } else {
                showToast('News Feed coming soon', 'info')
            }
        })
        return () => window.cancelAnimationFrame(frame)
    }, [mobileMenuOpen, pendingMenuAction, pathname, showToast, user])

    const runAfterMenuClose = (action: 'deity' | 'news' | 'delete-profile') => {
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
    const isPreviewRoute = pathname === '/preview' || pathname === '/preview/'
    // Preview has no desktop sidebar, so its account menu remains available at
    // every width. The editor's shared sidebar replaces it on desktop.
    const authenticatedVisibilityClass = usesProfileEditorMenu && !isPreviewRoute ? 'lg:hidden' : undefined

    // Determine which primary button to show on mobile (Default Mode)
    const isPreviewPage = isOwnerMode || isPreviewRoute || (user?.username && pathname?.replace(/\/+$/, '') === `/${user.username}`)
    const primaryMobileButton = isPreviewPage ? (
        <GlassButton
            variant="ghost"
            size="sm"
            tone="dark"
            onClick={copyProfileUrl}
            aria-label="Copy page URL"
            className={cn('min-h-11 px-3 min-[360px]:px-4', isPreviewRoute && 'hidden md:inline-flex')}
        >
            <span className="min-[360px]:hidden">Copy URL</span>
            <span className="hidden min-[360px]:inline">Copy page URL</span>
        </GlassButton>
    ) : (
        <TahoeGlassButton
            onClick={() => router.push('/preview')}
            className="min-h-11 px-3 py-2 text-sm font-medium transition-all min-[360px]:px-4 hover:scale-[1.02] active:scale-[0.98]"
            contentClassName="text-slate-950"
            tone="dark"
        >
            <span className="min-[360px]:hidden">Preview</span>
            <span className="hidden min-[360px]:inline">Preview Profile</span>
        </TahoeGlassButton>
    )

    return (
        <NssoTopBar
            className={cn(user && authenticatedVisibilityClass, className)}
            contentClassName="h-full w-full"
        >
            <nav className={NSSO_TOPBAR_CONTENT_CLASS} aria-label={isPreviewRoute ? 'Profile preview' : 'Main navigation'}>

                <div className="flex min-w-0 items-center gap-2 md:gap-3">
                    {isPreviewRoute && user && <GlassButton
                        variant="ghost"
                        size="sm"
                        tone="dark"
                        onClick={() => router.push('/dashboard?view=profile')}
                        aria-label="Edit profile"
                        className="min-h-11 px-3 min-[360px]:px-4"
                    >
                        <ArrowLeft aria-hidden="true" size={18} />
                        <span>Edit profile</span>
                    </GlassButton>}
                    {/* Shared logo and material on editor, profile and preview. */}
                    <Link
                        href={user ? "/?view=home" : "/"}
                        aria-label="nsso homepage"
                        className={cn("flex items-center", user && authenticatedVisibilityClass)}
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
                </div>

                {/* --- RIGHT SIDE / DESKTOP NAV --- */}
                <div className="hidden md:flex items-center gap-4">
                    {!user && (
                        <TahoeGlassSurface as="a" variant="button" href="/sign-in" onMouseEnter={() => router.prefetch('/sign-in')}
                            tone="dark"
                            className="flex min-h-11 items-center px-4 py-2 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                            contentClassName="text-center text-slate-950">
                            SIGN IN / SIGN UP
                        </TahoeGlassSurface>
                    )}
                </div>

                {/* --- MOBILE NAVIGATION (HAMBURGER) --- */}
                <div className={cn("ml-auto flex items-center gap-2 min-[360px]:gap-3", user ? authenticatedVisibilityClass : 'md:hidden')}>

                    {/* Default Mode: Contextual Button (Preview/Copy) */}
                    {showAuthButtons && user && primaryMobileButton}

                    {/* Every account keeps access to profile and session controls. */}
                    {user && (
                        <TahoeGlassButton
                            onClick={event => { event.currentTarget.focus(); setMobileMenuOpen(!mobileMenuOpen) }}
                            radius={8}
                            className="h-11 w-11 p-0 text-slate-950 transition-colors"
                            contentClassName="text-slate-950"
                            tone="dark"
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
                        <div data-mobile-account-menu="true" className={cn(LIGHT_PANEL.surface, "flex h-full flex-col overflow-hidden rounded-l-[32px] shadow-[-24px_0_64px_rgba(0,0,0,0.28)]")}>
                            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-500/15 pb-5 pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))]">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span data-mobile-menu-logo="true" className="relative block h-8 w-[69px] shrink-0 overflow-hidden">
                                        <Image src="/assets/nsso-logo-dark.png" alt="nsso" width={3840} height={2172} sizes="140px" className="absolute left-[-43.79%] top-[-60.02%] h-[230.33%] w-[188.51%] max-w-none" />
                                    </span>
                                    <span className="border-l border-slate-500/25 pl-3 text-lg font-semibold tracking-tight">Menu</span>
                                </div>
                                <LightCloseButton onClick={() => setMobileMenuOpen(false)} aria-label="Close menu" />
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-5" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
                                <Suspense fallback={<p className="p-3 text-sm text-slate-600">Loading menu…</p>}>
                                    <MobileMenuNavigation pathname={pathname} isAdmin={isAdmin} signingOut={signingOut} close={() => setMobileMenuOpen(false)} copyProfileUrl={copyProfileUrl} handleSignOut={handleSignOut} runAfterClose={runAfterMenuClose} />
                                </Suspense>
                            </div>
                        </div>
                    </TahoeGlassDialog>

                    <DeleteProfileDialog open={deleteProfileOpen} onOpenChange={setDeleteProfileOpen} />


                    {/* Mobile - Not logged in (Default Mode Only) */}
                    {!isOwnerMode && showAuthButtons && !user && (
                        <TahoeGlassSurface as="a" variant="button" href="/sign-in"
                            tone="dark"
                            className="flex min-h-11 items-center px-4 py-2 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
                            contentClassName="text-center text-slate-950">
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
                @media (prefers-reduced-motion: reduce) {
                    .animate-slide-in-right {
                        animation: none;
                    }
                }
            `}</style>
        </NssoTopBar>
    )
}
