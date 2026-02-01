'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
    { id: 'profile', label: 'Your Page', icon: '/nav-profile.svg' },
    { id: 'my-nsso', label: 'My nsso', icon: '/nav-my-nsso.svg' },
    { id: 'earnings', label: 'Earnings', icon: '/nav-earnings.svg' },
    { id: 'news-feed', label: 'Feed', icon: '/nav-news.svg', disabled: true },
];

export default function DashboardBottomNav() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const currentView = searchParams.get('view') || 'profile';

    const handleNavClick = (view: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('view', view);
        router.push(`/dashboard?${params.toString()}`);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden pb-safe-area-inset-bottom">
            {/* Glass Background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 bg-[rgba(10,10,10,0.8)] backdrop-blur-[20px]" />
                <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.15)] to-transparent" />
            </div>

            <nav className="relative flex justify-around items-center h-[80px] px-2 pb-2">
                {NAV_ITEMS.map((item) => {
                    const isActive = currentView === item.id;
                    return (
                        <button
                            key={item.id}
                            disabled={item.disabled}
                            onClick={() => !item.disabled && handleNavClick(item.id)}
                            className={cn(
                                "group relative flex flex-col items-center justify-center w-16 h-16 rounded-full transition-all duration-300",
                                item.disabled && "opacity-40 cursor-not-allowed"
                            )}
                        >
                            {/* Active pill background */}
                            {isActive && (
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 rounded-full blur-[2px]" />
                            )}

                            <div className={cn(
                                "relative w-6 h-6 transition-all duration-300 mb-1",
                                isActive ? "scale-110 -translate-y-1" : "group-hover:scale-105"
                            )}>
                                <Image
                                    src={item.icon}
                                    alt={item.label}
                                    fill
                                    className={cn(
                                        "object-contain transition-all duration-300",
                                        isActive ? "brightness-150 drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]" : "opacity-60"
                                    )}
                                />
                            </div>

                            {/* Label (Optional for bottom nav, maybe hide on very small screens if crowded) */}
                            {/* <span className={cn(
                                "text-[10px] font-medium transition-colors duration-300",
                                isActive ? "text-white" : "text-white/40"
                            )}>
                                {item.label}
                            </span> */}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
}
