'use client';

import { Suspense, useSyncExternalStore } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import {
    LayoutDashboard,
    User,
    Newspaper,
    LogOut,
    Eye,
    Link as LinkIcon
} from 'lucide-react';
import ComingSoonBadge from '@/components/ui/ComingSoonBadge';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { useUser } from '@/components/providers/UserProvider';
import { TahoeBackdropSurface, TahoeGlassButton, TahoeGlassSurface } from '@/components/ui/tahoe-glass';
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
}: {
    backdropEnabled: boolean;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();
    const { showToast } = useToast();
    const { user } = useUser();
    const isAdmin = user?.user_type === 'admin';

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
        await supabase.auth.signOut();
        window.location.href = '/';
    };

    const copyProfileUrl = () => {
        const targetUsername = user?.username;
        if (!targetUsername) return;
        const url = `${window.location.origin}/${targetUsername}`;
        navigator.clipboard.writeText(url);
        showToast('Profile URL copied to clipboard!', 'success');
    };

    return (
        <TahoeBackdropSurface
            as="aside"
            backdropEnabled={backdropEnabled}
            variant="panel"
            radius="0 28px 28px 0"
            className="fixed bottom-0 left-0 top-0 z-50 hidden w-[280px] transition-colors duration-300 lg:block"
            contentClassName="flex h-full flex-col"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.38}
        >
            {/* Logo Area */}
            <div className="px-8 py-8">
                <div
                    className="cursor-pointer"
                    onClick={() => router.push('/?view=home')}
                >
                    <Image
                        src="/assets/nsso-logo.png"
                        alt="nsso"
                        width={80}
                        height={32}
                        className="h-8 w-auto opacity-90 hover:opacity-100 transition-opacity"
                        priority
                    />
                </div>
            </div>

            {/* Navigation Items */}
            <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
                {NAV_ITEMS.map((item) => {
                    const isActive = currentView === item.view;
                    const Icon = item.icon;

                    return (
                        <TahoeGlassButton
                            key={item.id}
                            onClick={() => handleNavClick(item.view, item.comingSoon)}
                            radius={12}
                            semanticTint={isActive ? 'light' : 'none'}
                            semanticTintOpacity={0.08}
                            tone="light"
                            className={cn(
                                "group relative w-full px-4 py-3 transition-all duration-200",
                                isActive
                                    ? "text-white"
                                    : "text-white/60 hover:text-white",
                                item.comingSoon && "cursor-pointer"
                            )}
                            contentClassName="w-full justify-start gap-3 text-inherit"
                            aria-current={isActive ? 'page' : undefined}
                        >
                            {/* Active Indicator */}
                            {isActive && (
                                <span
                                    aria-hidden="true"
                                    className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-white/80 blur-[2px]"
                                />
                            )}

                            <Icon
                                size={20}
                                className={cn(
                                    "transition-colors",
                                    isActive ? "text-white" : "text-white/60 group-hover:text-white"
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
                        </TahoeGlassButton>
                    );
                })}
            </nav>

            {/* Footer Actions */}
            <div className="p-4 mt-auto border-t border-white/5 space-y-2">
                {isAdmin && (
                    <TahoeGlassSurface
                        as="a"
                        variant="button"
                        radius={12}
                        href="/admin"
                        tone="light"
                        className="group mb-3 block w-full px-4 py-3 text-left text-white/80 transition-all hover:text-white"
                        contentClassName="flex w-full items-center gap-3 text-left"
                    >
                            <LayoutDashboard size={18} className="group-hover:text-white transition-colors" />
                            <span className="font-medium text-[14px]">Admin</span>
                    </TahoeGlassSurface>
                )}

                {/* Preview Profile */}
                <TahoeGlassButton
                    onClick={() => router.push('/preview')}
                    radius={12}
                    tone="light"
                    className="group w-full px-4 py-3 text-left text-white/80 transition-all hover:text-white"
                    contentClassName="w-full justify-start gap-3 text-inherit"
                >
                    <Eye size={18} className="group-hover:text-white transition-colors" />
                    <span className="font-medium text-[14px]">Preview Profile</span>
                </TahoeGlassButton>

                {/* Copy URL */}
                <TahoeGlassButton
                    onClick={copyProfileUrl}
                    radius={12}
                    tone="light"
                    className="group w-full px-4 py-3 text-left text-white/80 transition-all hover:text-white"
                    contentClassName="w-full justify-start gap-3 text-inherit"
                >
                    <LinkIcon size={18} className="group-hover:text-white transition-colors" />
                    <span className="font-medium text-[14px]">Copy profile link</span>
                </TahoeGlassButton>

                {/* Sign Out */}
                <TahoeGlassButton
                    onClick={handleSignOut}
                    radius={12}
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.1}
                    className="group w-full px-4 py-3 text-left text-red-400/90 transition-all hover:text-red-300"
                    contentClassName="w-full justify-start gap-3 text-inherit"
                >
                    <LogOut size={18} className="group-hover:text-red-300 transition-colors" />
                    <span className="font-medium text-[14px]">Sign Out</span>
                </TahoeGlassButton>
            </div>
        </TahoeBackdropSurface>
    );
}

export default function DashboardSidebar() {
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

    if (!isDesktop) return null;

    return (
        <Suspense fallback={null}>
            <DashboardSidebarContent backdropEnabled={backdropEnabled} />
        </Suspense>
    );
}
