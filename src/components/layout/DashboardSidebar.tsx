'use client';

import { NativeGlassLens } from '@/components/ui/tahoe-glass/NativeGlassLens'

import { Suspense, useState, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    User,
    Newspaper,
    LogOut,
    Eye,
    Home,
    Link as LinkIcon,
    Trash2
} from 'lucide-react';
import ComingSoonBadge from '@/components/ui/ComingSoonBadge';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/components/providers/UserProvider';
import { boundedClientRead } from '@/lib/client-read';
import { canAccessAdmin } from '@/lib/admin-access';
import { isAccountDeletionAvailable } from '@/lib/delete-profile-client';
import DeleteProfileDialog from '@/components/layout/DeleteProfileDialog';
import { TahoeBackdropSurface } from '@/components/ui/tahoe-glass';
import { LightButton, lightButtonClass } from '@/components/ui/LightButton';
import { LIGHT_PANEL } from '@/components/ui/light-panel';
import {
    getDashboardDesktopLayoutSnapshot,
    getDashboardDirectBackdropSnapshot,
    getDashboardServerSnapshot,
    subscribeDashboardBackdropPolicy,
} from '@/lib/tahoe-glass/dashboard-backdrop-policy';

// Define interface for navigation items
interface NavItem {
    id: string;
    label: string;
    icon: React.ElementType; // Use ElementType for components
    view: string;
    badge?: React.ReactNode;
    comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    {
        id: 'profile',
        label: 'Edit Profile',
        icon: User,
        view: 'profile'
    },
    {
        id: 'my-nsso',
        label: 'My nsso',
        icon: LayoutDashboard,
        view: 'my-nsso'
    },
    {
        id: 'news-feed',
        label: 'News Feed',
        icon: Newspaper,
        view: 'news-feed',
        badge: <ComingSoonBadge />,
        comingSoon: true
    }
];

function DashboardSidebarContent({
    backdropEnabled,
    onDeleteProfile,
}: {
    backdropEnabled: boolean;
    onDeleteProfile: () => void;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();
    const { showToast } = useToast();
    const { user } = useUser();
    const [signingOut, setSigningOut] = useState(false);
    const isAdmin = canAccessAdmin(user);

    const currentView = searchParams.get('view') || 'profile';
    const handleNavClick = (view: string, comingSoon?: boolean) => {
        if (comingSoon) {
            showToast('News Feed coming soon', 'success');
            return;
        }
        const params = new URLSearchParams(searchParams.toString());
        params.set('view', view);
        router.push(`/dashboard?${params.toString()}`);
    };

    const handleSignOut = async () => {
        if (signingOut) return;
        setSigningOut(true);
        try {
            // Release the control on an uncertain timeout without replaying logout.
            const { error } = await boundedClientRead(() => supabase.auth.signOut());
            if (error) throw error;
            window.location.href = '/';
        } catch {
            showToast('Sign-out could not be confirmed. Please try again.', 'error');
            setSigningOut(false);
        }
    };

    const copyProfileUrl = async () => {
        const targetUsername = user?.username;
        if (!targetUsername) { showToast('Choose a profile name before sharing your URL.', 'info'); return; }
        const url = `${window.location.origin}/${targetUsername}`;
        try {
            await navigator.clipboard.writeText(url);
            showToast('Profile URL copied to clipboard!', 'success');
        } catch { showToast('Could not copy the profile URL. Please try again.', 'error'); }
    };

    return (
        <TahoeBackdropSurface chromiumAppearance="light" materialFinish="satin"
            as="aside"
            backdropEnabled={backdropEnabled}
            variant="panel"
            radius="0 28px 28px 0"
            className="nsso-crystal-panel fixed bottom-0 left-0 top-0 z-50 hidden w-[280px] transition-colors duration-300 lg:block"
            contentClassName="flex h-full flex-col text-slate-950"
            tone="dark"
            semanticTint="light"
            semanticTintOpacity={0.18}
        >
            {/* Logo Area */}
            <div className="px-8 py-8">
                <Link
                    href="/?view=home"
                    aria-label="nsso homepage"
                    className="inline-flex rounded-sm focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-700"
                >
                    <span data-sidebar-logo="true" className="relative block h-8 w-[69px] shrink-0 overflow-hidden">
                        <Image
                            src="/assets/nsso-logo-dark.png"
                            alt="nsso"
                            width={3840}
                            height={2172}
                            sizes="140px"
                            className="absolute left-[-43.79%] top-[-60.02%] h-[230.33%] w-[188.51%] max-w-none opacity-90 transition-opacity hover:opacity-100"
                            priority
                        />
                    </span>
                </Link>
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                    const isActive = currentView === item.view;
                    const Icon = item.icon;

                    return (
                        <LightButton
                            key={item.id}
                            onClick={() => handleNavClick(item.view, item.comingSoon)}
                            radius={12}
                            className={cn(
                                "group relative w-full px-4 py-3 transition-all duration-200",
                                isActive
                                    ? LIGHT_PANEL.silver
                                    : "text-slate-900 hover:text-slate-950",
                                item.comingSoon && "cursor-pointer"
                            )}
                            contentClassName="w-full justify-start gap-3 text-inherit"
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <Icon
                                size={20}
                                className={cn(
                                    "transition-colors",
                                    isActive ? "text-slate-950" : "text-slate-900 group-hover:text-slate-950"
                                )}
                            />
                            <span className="font-medium text-[15px]" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif" }}>
                                {item.label}
                            </span>

                            {item.badge && (
                                <span className="ml-auto origin-right scale-90 transform">
                                    {item.badge}
                                </span>
                            )}
                        </LightButton>
                    );
                })}
                <LightButton
                    onClick={() => router.push('/?view=home')}
                    radius={12}
                    className="group relative w-full px-4 py-3 text-slate-900 transition-all duration-200 hover:text-slate-900"
                    contentClassName="w-full justify-start gap-3 text-inherit"
                >
                    <Home size={20} className="text-slate-900 transition-colors group-hover:text-slate-950" />
                    <span className="text-[15px] font-medium">nsso homepage</span>
                </LightButton>
            </nav>

            {/* Footer Actions */}
            <div className="p-4 mt-auto border-t border-slate-500/15 space-y-2">
                {isAdmin && (
                    <NativeGlassLens as={Link} href="/admin" className={cn(lightButtonClass, 'group mb-3 flex w-full justify-start gap-3 rounded-xl px-4 py-3 text-left')}>
                        <LayoutDashboard size={18} aria-hidden="true" />
                        <span className="text-[14px] font-medium">Admin</span>
                    </NativeGlassLens>
                )}

                {/* Preview Profile */}
                <LightButton
                    onClick={() => router.push('/preview')}
                    radius={12}
                    className="group w-full px-4 py-3 text-left text-slate-900 transition-all hover:text-slate-900"
                    contentClassName="w-full justify-start gap-3 text-inherit"
                >
                    <Eye size={18} className="group-hover:text-slate-950 transition-colors" />
                    <span className="font-medium text-[14px]">Preview Profile</span>
                </LightButton>

                {/* Copy URL */}
                <LightButton
                    onClick={copyProfileUrl}
                    radius={12}
                    className="group w-full px-4 py-3 text-left text-slate-900 transition-all hover:text-slate-900"
                    contentClassName="w-full justify-start gap-3 text-inherit"
                >
                    <LinkIcon size={18} className="group-hover:text-slate-950 transition-colors" />
                    <span className="font-medium text-[14px]">Copy profile link</span>
                </LightButton>

                {isAccountDeletionAvailable() && <LightButton intent="muted"
                    onClick={event => { event.currentTarget.focus(); onDeleteProfile() }}
                    radius={12}
                    className="group w-full px-4 py-3 text-left text-slate-900 transition-colors hover:text-slate-900"
                    contentClassName="w-full justify-start gap-3 text-inherit"
                >
                    <Trash2 size={18} />
                    <span className="font-normal text-[13px]">Delete my profile</span>
                </LightButton>}

                {/* Sign Out */}
                <LightButton
                    onClick={handleSignOut}
                    intent="danger"
                    disabled={signingOut}
                    radius={12}
                    className="group w-full px-4 py-3 text-left transition-colors focus-visible:text-nsso-danger"
                    contentClassName="w-full justify-start gap-3 text-inherit"
                >
                    <LogOut size={18} className="transition-colors" />
                    <span className="font-medium text-[14px]">{signingOut ? 'Signing out…' : 'Sign Out'}</span>
                </LightButton>
            </div>
        </TahoeBackdropSurface>
    );
}

export default function DashboardSidebar() {
    const [deleteProfileOpen, setDeleteProfileOpen] = useState(false);
    // Width controls only whether the desktop sidebar exists. Optical
    // capability is independent, so a 1024/1366px iPad can show the sidebar
    // without allocating an Apple-mobile owned-scene WebGL lens.
    const isDesktop = useSyncExternalStore(
        subscribeDashboardBackdropPolicy,
        getDashboardDesktopLayoutSnapshot,
        getDashboardServerSnapshot,
    );
    const backdropEnabled = useSyncExternalStore(
        subscribeDashboardBackdropPolicy,
        getDashboardDirectBackdropSnapshot,
        getDashboardServerSnapshot,
    );

    return (
        <>
            {isDesktop && <Suspense fallback={null}>
                <DashboardSidebarContent backdropEnabled={backdropEnabled} onDeleteProfile={() => setDeleteProfileOpen(true)} />
            </Suspense>}
            <DeleteProfileDialog open={deleteProfileOpen} onOpenChange={setDeleteProfileOpen} />
        </>
    );
}
