'use client'

import React, { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'

// Navigation Configuration
const NAV_ITEMS = [
    { id: 'profile', label: 'Edit Profile', icon: '/nav-profile.svg' },
    { id: 'my-nsso', label: 'My nsso', icon: '/nav-my-nsso.svg' },
    { id: 'deity', label: 'Deity', icon: '/nsso-agent-avatar.png' },
    { id: 'news', label: 'News Feed', icon: '/nav-news.svg' },
]

function BottomNavContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const activeView = searchParams.get('view') || 'profile'
    const { showToast } = useToast()

    const handleItemClick = (id: string) => {
        if (id === 'news') {
            showToast('News Feed coming soon', 'info')
            return
        }
        if (id === 'deity') {
            window.dispatchEvent(new CustomEvent('open-deity-chat'))
            return
        }

        const params = new URLSearchParams(searchParams.toString())
        params.set('view', id)
        router.push(`/dashboard?${params.toString()}`)
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#1C1C1E]/90 backdrop-blur-xl border-t border-white/10 pb-safe">
            <div className="flex justify-between items-center px-8 h-[80px]">
                {NAV_ITEMS.map((item) => {
                    const isActive = activeView === item.id && item.id !== 'deity' && item.id !== 'news'

                    return (
                        <button
                            key={item.id}
                            onClick={() => handleItemClick(item.id)}
                            className="flex flex-col items-center justify-center gap-1 min-w-[64px]"
                        >
                            <div className={cn(
                                "transition-all duration-300 relative",
                                isActive ? "opacity-100 scale-100" : "opacity-40 hover:opacity-80"
                            )}>
                                {item.id === 'deity' ? (
                                    <div className="w-[28px] h-[28px] rounded-full overflow-hidden border border-white/20">
                                        <Image
                                            src={item.icon}
                                            alt={item.label}
                                            width={28}
                                            height={28}
                                            className="object-cover"
                                        />
                                    </div>
                                ) : (
                                    <div className="relative w-[24px] h-[24px]">
                                        <Image
                                            src={item.icon}
                                            alt={item.label}
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                )}
                            </div>
                        </button>
                    )
                })}
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
