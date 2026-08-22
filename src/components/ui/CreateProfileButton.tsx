'use client'

import Link from 'next/link'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface CreateProfileButtonProps {
    className?: string
}

export default function CreateProfileButton({ className = '' }: CreateProfileButtonProps) {
    return (
        <Link href="/sign-in" legacyBehavior passHref>
            <TahoeGlassSurface
                as="a"
                variant="button"
                tone="light"
                className={`group flex items-center justify-center overflow-hidden px-6 py-2 transition-all duration-300 hover:scale-105 active:scale-95 ${className}`}
                contentClassName="flex flex-col items-center justify-center"
            >
                <span className="whitespace-nowrap text-center text-[14px] font-semibold leading-normal tracking-wide text-[#5ac8f5] drop-shadow-sm">
                    Create your nsso profile
                </span>
            </TahoeGlassSurface>
        </Link>
    )
}
