'use client'

import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface CreateProfileButtonProps {
    className?: string
    returnTo?: string
}

export default function CreateProfileButton({ className = '', returnTo }: CreateProfileButtonProps) {
    const destination = returnTo?.startsWith('/') && !returnTo.startsWith('//') && !/[\\\u0000-\u001f]/.test(returnTo)
        ? `/sign-up?next=${encodeURIComponent(returnTo)}` : '/sign-up'
    return (
        <TahoeGlassSurface
            as="a"
            variant="button"
            href={destination}
            tone="dark"
            semanticTint="light"
            semanticTintOpacity={0.25}
            className={`
                group flex min-h-12 items-center justify-center overflow-hidden px-6 py-3 transition-all duration-300
                hover:scale-105 active:scale-95 focus-visible:outline-slate-950
                ${className}
            `}
            contentClassName="text-center text-base font-semibold leading-normal text-slate-950"
        >
            Create your nsso profile
        </TahoeGlassSurface>
    )
}
