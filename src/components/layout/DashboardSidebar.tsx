'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
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

const NAV_ITEMS = [
    {
        id: 'profile',
        label: 'Profile',
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
        badge: <ComingSoonBadge />
    }
];

function DashboardSidebarContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();
    const supabase = createClient();
    const { showToast } = useToast();
    const { user } = useUser();

    const currentView = searchParams.get('view') || 'profile';

    const handleNavClick = (view: string) => {
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
        <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[280px] z-50 glass-panel border-r border-white/10">
            {/* Logo Area */}
            <div className="px-8 py-8">
                <div
                    className="cursor-pointer"
                    onClick={() => router.push('/')}
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
                        <button
                            key={item.id}
                            onClick={() => handleNavClick(item.view)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative",
                                isActive
                                    ? "bg-white/10 text-white shadow-lg shadow-black/5"
                                    : "text-white/60 hover:text-white hover:bg-white/5"
                            )}
                        >
                            {/* Active Indicator */}
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-white/80 rounded-r-full blur-[2px]" />
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
                                <div className="ml-auto transform scale-90 origin-right">
                                    {item.badge}
                                </div>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Footer Actions */}
            <div className="p-4 mt-auto border-t border-white/5 space-y-2">
                {/* Preview Profile */}
                <button
                    onClick={() => router.push('/preview')}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all text-left group"
                >
                    <Eye size={18} className="group-hover:text-white transition-colors" />
                    <span className="font-medium text-[14px]">Preview Profile</span>
                </button>

                {/* Copy URL */}
                <button
                    onClick={copyProfileUrl}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-all text-left group"
                >
                    <LinkIcon size={18} className="group-hover:text-white transition-colors" />
                    <span className="font-medium text-[14px]">Copy Link</span>
                </button>

                {/* Sign Out */}
                <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400/80 hover:text-red-400 hover:bg-white/5 transition-all text-left group"
                >
                    <LogOut size={18} className="group-hover:text-red-400 transition-colors" />
                    <span className="font-medium text-[14px]">Sign Out</span>
                </button>
            </div>
        </aside>
    );
}

export default function DashboardSidebar() {
    return (
        <Suspense fallback={<aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[280px] z-50 glass-panel border-r border-white/10" />}>
            <DashboardSidebarContent />
        </Suspense>
    );
}

