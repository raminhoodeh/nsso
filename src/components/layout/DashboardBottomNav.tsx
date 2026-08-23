'use client'

import React, { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { TahoeGlassButton, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

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
        <TahoeGlassSurface
            as="nav"
            variant="menu"
            radius="24px 24px 0 0"
            aria-label="Dashboard"
            className="fixed bottom-0 left-0 right-0 z-50 pb-safe md:hidden"
            contentClassName="w-full"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.38}
        >
            <div className="flex justify-between items-center px-8 h-[64px]">
                {NAV_ITEMS.map((item) => {
                    const isActive = activeView === item.id && item.id !== 'deity' && item.id !== 'news'

                    return (
                        <TahoeGlassButton
                            key={item.id}
                            onClick={() => handleItemClick(item.id)}
                            radius={14}
                            tone="light"
                            semanticTint={isActive ? 'light' : 'none'}
                            semanticTintOpacity={0.08}
                            className="min-w-[64px] px-3 py-2"
                            contentClassName="flex-col gap-1 text-inherit"
                            aria-label={item.label}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <span className={cn(
                                "relative block transition-all duration-300",
                                isActive || item.id === 'deity' ? "opacity-100 scale-100" : "opacity-40 hover:opacity-80"
                            )}>
                                {item.id === 'deity' ? (
                                    <span className="block h-[32px] w-[32px] overflow-hidden rounded-full">
                                        <Image
                                            src={item.icon}
                                            alt={item.label}
                                            width={32}
                                            height={32}
                                            className="object-cover"
                                        />
                                    </span>
                                ) : (
                                    <span className="relative block h-[24px] w-[24px]">
                                        <Image
                                            src={item.icon}
                                            alt={item.label}
                                            fill
                                            className="object-contain"
                                        />
                                    </span>
                                )}
                            </span>
                        </TahoeGlassButton>
                    )
                })}
            </div>
        </TahoeGlassSurface>
    )
}

export default function DashboardBottomNav() {
    return (
        <Suspense fallback={null}>
            <BottomNavContent />
        </Suspense>
    )
}
