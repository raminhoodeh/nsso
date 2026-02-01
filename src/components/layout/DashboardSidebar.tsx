'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

const NAV_ITEMS = [
    { id: 'profile', label: 'Your Page', icon: '/nav-profile.svg' },
    { id: 'my-nsso', label: 'My nsso', icon: '/nav-my-nsso.svg' },
    { id: 'earnings', label: 'Earnings', icon: '/nav-earnings.svg' },
    { id: 'news-feed', label: 'News Feed', icon: '/nav-news.svg', disabled: true, comingSoon: true },
];

function DashboardSidebarContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const pathname = usePathname();

    const isDashboard = pathname === '/dashboard';
    const currentView = isDashboard ? (searchParams.get('view') || 'profile') : null;

    const handleNavClick = (view: string) => {
        const params = new URLSearchParams();
        params.set('view', view);
        router.push(`/dashboard?${params.toString()}`);
    };

    return (
        <aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[280px] z-50 p-6 pt-[120px]">
            {/* Glass Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[rgba(0,0,0,0.2)] backdrop-blur-[50px] mix-blend-multiply" />
                <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-[rgba(255,255,255,0.1)] to-transparent" />
            </div>

            {/* Navigation Items */}
            <nav className="relative flex flex-col gap-2 w-full">
                {NAV_ITEMS.map((item) => {
                    const isActive = currentView === item.id;
                    return (
                        <button
                            key={item.id}
                            disabled={item.disabled}
                            onClick={() => !item.disabled && handleNavClick(item.id)}
                            className={cn(
                                "group relative flex items-center gap-4 px-4 py-3.5 rounded-[20px] transition-all duration-300 text-left",
                                isActive
                                    ? "bg-white/10 shadow-[inner_0_1px_0_0_rgba(255,255,255,0.1)]"
                                    : "hover:bg-white/5",
                                item.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent"
                            )}
                        >
                            {/* Icon */}
                            <div className={cn(
                                "flex items-center justify-center w-6 h-6 transition-transform duration-300",
                                isActive ? "scale-110" : "group-hover:scale-105"
                            )}>
                                <Image
                                    src={item.icon}
                                    alt={item.label}
                                    width={24}
                                    height={24}
                                    className={cn("w-full h-full", isActive ? "brightness-150 drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" : "opacity-70 group-hover:opacity-100")}
                                />
                            </div>

                            {/* Label */}
                            <span className={cn(
                                "text-[15px] font-semibold tracking-wide transition-colors duration-300",
                                isActive ? "text-white" : "text-white/60 group-hover:text-white"
                            )}
                                style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif" }}
                            >
                                {item.label}
                            </span>

                            {/* Active Indicator (Glow) */}
                            {isActive && (
                                <div className="absolute inset-0 rounded-[20px] bg-gradient-to-r from-white/5 to-transparent pointer-events-none" />
                            )}

                            {/* Coming Soon Badge */}
                            {item.comingSoon && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/40 backdrop-blur-md border border-white/10 px-2 py-0.5 rounded text-[10px] uppercase font-bold text-white/40 tracking-wider">
                                    Soon
                                </div>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* Proactive Nudge Area (can be used for Deity prompts later) */}
            <div className="relative mt-auto">
                {/* Placeholder for future sidebar widgets */}
            </div>
        </aside>
    );
}

export default function DashboardSidebar() {
    return (
        <Suspense fallback={<aside className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-[280px] z-50 p-6 pt-[120px]" />}>
            <DashboardSidebarContent />
        </Suspense>
    );
}
