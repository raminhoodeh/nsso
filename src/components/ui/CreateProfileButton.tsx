'use client'

import Link from 'next/link'

interface CreateProfileButtonProps {
    className?: string
}

export default function CreateProfileButton({ className = '' }: CreateProfileButtonProps) {
    return (
        <Link
            href="/sign-in"
            className={`
                relative group flex items-center justify-center px-6 py-2 rounded-full overflow-hidden transition-all duration-300
                backdrop-blur-xl bg-black/60 hover:bg-black/70
                border border-white/10 hover:border-white/20
                shadow-lg hover:shadow-xl hover:scale-105 active:scale-95
                ${className}
            `}
        >
            <span
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none rounded-full opacity-50"
                style={{
                    background: 'radial-gradient(circle at center top, rgba(255, 255, 255, 0.15), transparent 70%)'
                }}
            />

            <span className="relative z-10 whitespace-nowrap text-center text-[14px] font-semibold leading-normal tracking-wide text-[#5ac8f5] drop-shadow-sm">
                Create your nsso profile
            </span>
        </Link>
    )
}
