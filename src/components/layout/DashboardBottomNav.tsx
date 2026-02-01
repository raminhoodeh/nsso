'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { User, LayoutDashboard, Newspaper } from 'lucide-react';

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
        id: 'deity',
        label: 'Deity',
        isDeity: true
    },
    {
        id: 'news-feed',
        label: 'Feed',
        icon: Newspaper,
        view: 'news-feed',
        disabled: true
    }
];

function DashboardBottomNavContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentView = searchParams.get('view') || 'profile';

    const handleNavClick = (item: typeof NAV_ITEMS[0]) => {
        if (item.id === 'deity') {
            window.dispatchEvent(new CustomEvent('open-deity-chat'));
            return;
        }

        if (item.view) {
            const params = new URLSearchParams(searchParams.toString());
            params.set('view', item.view);
            router.push(`/dashboard?${params.toString()}`);
        }
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pb-safe-area-inset-bottom">
            {/* Glass Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[rgba(10,10,10,0.8)] backdrop-blur-[20px]" />
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.15)] to-transparent" />
            </div>

            <nav className="relative grid grid-cols-4 items-center h-[80px] px-2 pb-2">
                {NAV_ITEMS.map((item) => {
                    const isActive = currentView === item.view && !item.isDeity;
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.id}
                            disabled={item.disabled}
                            onClick={() => !item.disabled && handleNavClick(item)}
                            className={cn(
                                "group relative flex flex-col items-center justify-center gap-1.5 h-full transition-all duration-300",
                                isActive ? "text-white" : "text-white/50",
                                item.disabled && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            {/* Active pill background - simplified for cleaner look */}
                            {isActive && (
                                <div className="absolute top-2 w-10 h-1 bg-white/50 rounded-full blur-[2px]" />
                            )}

                            {item.isDeity ? (
                                <div className="relative w-6 h-6 rounded-full overflow-hidden ring-1 ring-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                                    <Image
                                        src="/nsso-agent-avatar.png"
                                        alt="Deity"
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            ) : (
                                Icon && <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
                            )}

                            <span className="text-[10px] font-medium tracking-wide">
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}

export default function DashboardBottomNav() {
    return (
        <Suspense fallback={<div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden h-[80px]" />}>
            <DashboardBottomNavContent />
        </Suspense>
    );
}

