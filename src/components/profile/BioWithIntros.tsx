'use client'

import { useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'

// ─────────────────────────────────────────────────────────
// Type definitions
// ─────────────────────────────────────────────────────────
type IntroKey = 'recruiter' | 'collaborator' | 'client'

interface IntrosBios {
    recruiter: string
    collaborator: string
    client: string
}

interface BioWithIntrosProps {
    defaultBio: string | null
    introsBios: IntrosBios | null
}

// ─────────────────────────────────────────────────────────
// Chip configuration — label shown to viewer on public profile
// ─────────────────────────────────────────────────────────
const CHIPS: { key: 'default' | IntroKey; label: string }[] = [
    { key: 'default',      label: 'Bio'          },
    { key: 'recruiter',    label: 'Recruiter'    },
    { key: 'collaborator', label: 'Collaborator' },
    { key: 'client',       label: 'Client'       },
]

// ─────────────────────────────────────────────────────────
// BioWithIntros
//
// Renders the bio section on the public profile.
// - If intros_bios is null → shows plain bio (no chips), same as before
// - If intros_bios exists → shows 4 chips; viewer picks audience,
//   bio swaps in-place with a fade transition
// ─────────────────────────────────────────────────────────
export default function BioWithIntros({ defaultBio, introsBios }: BioWithIntrosProps) {
    const [active, setActive] = useState<'default' | IntroKey>('default')
    const [fading, setFading] = useState(false)

    if (!defaultBio) return null

    const hasIntros = !!introsBios

    // Smooth cross-fade when switching chips
    const handleChipClick = (key: 'default' | IntroKey) => {
        if (key === active) return
        setFading(true)
        setTimeout(() => {
            setActive(key)
            setFading(false)
        }, 150)
    }

    const displayedBio =
        active === 'default'
            ? defaultBio
            : (introsBios?.[active] ?? defaultBio)

    return (
        <GlassCard className="p-6 !mt-10">
            {/* ── Chip row ── only renders when intros exist ── */}
            {hasIntros && (
                <div className="flex flex-wrap gap-2 mb-5">
                    {CHIPS.map(({ key, label }) => {
                        const isActive = active === key
                        return (
                            <button
                                key={key}
                                onClick={() => handleChipClick(key)}
                                aria-pressed={isActive}
                                className={[
                                    // Base chip — pill shape, SF Pro weight, smooth all-property transition
                                    'relative flex items-center justify-center',
                                    'px-4 py-1.5 rounded-full',
                                    'text-[13px] font-medium tracking-wide',
                                    'transition-all duration-200 ease-out',
                                    'select-none cursor-pointer',
                                    'overflow-hidden',

                                    // Active state — filled glass chip with specular highlight
                                    isActive
                                        ? 'text-white/96'
                                        : 'text-white/40 hover:text-white/70',
                                ].join(' ')}
                                style={{
                                    // Active: use the app's glass-style-1 colour recipe inline
                                    // Inactive: near-invisible, just the label
                                    background: isActive
                                        ? 'rgba(255, 255, 255, 0.12)'
                                        : 'transparent',
                                    border: isActive
                                        ? '1px solid rgba(255, 255, 255, 0.22)'
                                        : '1px solid rgba(255, 255, 255, 0.08)',
                                    backdropFilter: isActive ? 'blur(8px)' : 'none',
                                    WebkitBackdropFilter: isActive ? 'blur(8px)' : 'none',
                                    boxShadow: isActive
                                        ? 'inset 1px 1px 1px rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.15)'
                                        : 'none',
                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                    fontWeight: isActive ? 590 : 400,
                                }}
                            >
                                {/* Specular highlight layer — matches glass-specular from globals.css */}
                                {isActive && (
                                    <span
                                        aria-hidden="true"
                                        className="absolute inset-0 rounded-full pointer-events-none"
                                        style={{
                                            background:
                                                'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 60%)',
                                        }}
                                    />
                                )}
                                <span className="relative z-10">{label}</span>
                            </button>
                        )
                    })}
                </div>
            )}

            {/* ── Bio text ── cross-fades on chip switch ── */}
            <p
                className="text-white/90 text-lg leading-relaxed whitespace-pre-wrap transition-opacity duration-150"
                style={{ opacity: fading ? 0 : 1 }}
            >
                {displayedBio}
            </p>
        </GlassCard>
    )
}
