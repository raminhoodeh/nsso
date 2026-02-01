'use client'

import React, { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { Home, User, Newspaper, Sparkles } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// Navigation Configuration
const NAV_ITEMS = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'my-nsso', label: 'My nsso', icon: Home },
    { id: 'deity', label: 'Deity', icon: Sparkles, isDeity: true },
    { id: 'news-feed', label: 'Feed', icon: Newspaper },
]

function BottomNavContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentView = searchParams.get('view') || 'profile'
    const { showToast } = useToast()

    const handleItemClick = (id: string) => {
        if (id === 'news-feed') {
            showToast('News Feed coming soon', 'success')
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
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
            <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 px-6 py-4">
                <div className="grid grid-cols-4 gap-0">
                    {NAV_ITEMS.map((item) => {
                        const isActive = currentView === item.id && !item.isDeity
                        const Icon = item.icon

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
