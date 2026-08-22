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
            {/* Inner Gradient/Sheen Effect for Depth */}
            <div
                className="absolute inset-0 pointer-events-none rounded-full opacity-50"
                style={{
                    background: 'radial-gradient(circle at center top, rgba(255, 255, 255, 0.15), transparent 70%)'
                }}
            />

            {/* Text Content */}
            <div className="relative z-10 flex flex-col items-center justify-center">
                <p className="font-semibold text-[14px] text-[#5ac8f5] text-center whitespace-nowrap leading-normal tracking-wide drop-shadow-sm">
                    Create your nsso profile
                </p>
            </div>
        </Link>
    )
}
