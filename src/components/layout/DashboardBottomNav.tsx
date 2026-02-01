
'use client'

import React, { Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Home, Search, ShoppingBag, User } from 'lucide-react';
import { MyNssoIcon } from '../icons/MyNssoIcon';
import { useToast } from '@/components/ui/Toast'

// Navigation Configuration
const NAV_ITEMS = [
    { id: 'profile', label: 'Edit Profile', icon: User },
    { id: 'my-nsso', label: 'My nsso', icon: MyNssoIcon },
    { id: 'products', label: 'Products', icon: ShoppingBag },
    { id: 'contacts', label: 'Network', icon: Search },
];

function BottomNavContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const activeView = searchParams.get('view') || 'profile'
    const { showToast } = useToast()

    const handleItemClick = (id: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('view', id)
        router.push(`/dashboard?${params.toString()}`)
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
            {/* Glass Container */}
            <div className="mx-6 mb-8 rounded-[24px] overflow-hidden bg-[#1C1C1E]/80 backdrop-blur-xl border border-white/10 shadow-2xl">
                <div className="flex justify-between items-center px-8 h-[72px]">
                    {NAV_ITEMS.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeView === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => handleItemClick(item.id)}
                                className="flex flex-col items-center justify-center gap-1 min-w-[64px]"
                            >
                                {item.isDeity ? (
                                    <div className="relative w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/20 shadow-lg shadow-purple-500/20">
                                        <Image
                                            src="/nsso-agent-avatar.png"
                                            alt="Deity"
                                            fill
                                            className="object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className={cn(
                                        "transition-all duration-300",
                                        isActive ? "text-white scale-110" : "text-white/40 hover:text-white/80"
                                    )}>
                                        <Icon size={28} strokeWidth={isActive ? 2.5 : 2} />
                                    </div>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

export default function DashboardBottomNav() {
    return (
        <Suspense fallback={null}>
            <BottomNavContent />
        </Suspense>
    )
}
