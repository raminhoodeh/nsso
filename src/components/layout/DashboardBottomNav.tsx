'use client'

import React, { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { TahoeBackdropSurface } from '@/components/ui/tahoe-glass'

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
        <TahoeBackdropSurface
            as="nav"
            variant="menu"
            radius="24px 24px 0 0"
            aria-label="Dashboard"
            className="fixed bottom-0 left-0 right-0 z-[5000] overflow-hidden md:hidden"
            contentClassName="w-full bg-[#080c14]/40"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.42}
            displacementProfile="prism-bottom"
            materialLighting="uniform"
            data-mobile-nav-material="dark-refractive"
        >
            <div
                className="grid min-h-[64px] grid-cols-4 items-center gap-1 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-2"
                style={{ paddingBottom: 'var(--mobile-bottom-safe-space)' }}
            >
                {NAV_ITEMS.map((item) => {
                    const isActive = activeView === item.id && item.id !== 'deity' && item.id !== 'news'

                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => handleItemClick(item.id)}
                            className={cn(
                                'relative flex h-14 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl border px-1 py-1.5 text-white outline-none transition-[background-color,border-color,box-shadow,transform] duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#080c14]',
                                isActive
                                    ? 'border-white/35 bg-white/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,0.20),0_4px_14px_rgba(0,0,0,0.18)]'
                                    : 'border-white/10 bg-black/[0.12] hover:border-white/25 hover:bg-white/[0.10]'
                            )}
                            aria-label={item.label}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <span className={cn(
                                'relative block transition-all duration-200',
                                isActive || item.id === 'deity' ? 'scale-100 opacity-100' : 'opacity-80'
                            )}>
                                {item.id === 'deity' ? (
                                    <span className="block h-7 w-7 overflow-hidden rounded-full">
                                        <Image
                                            src={item.icon}
                                            alt={item.label}
                                            width={28}
                                            height={28}
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
                            <span className={cn(
                                'max-w-full truncate text-[10px] font-semibold leading-3',
                                isActive || item.id === 'deity' ? 'text-white' : 'text-white/80'
                            )}>
                                {item.label}
                            </span>
                        </button>
                    )
                })}
            </div>
        </TahoeBackdropSurface>
    )
}

export default function DashboardBottomNav() {
    return (
        <Suspense fallback={null}>
            <BottomNavContent />
        </Suspense>
    )
}
