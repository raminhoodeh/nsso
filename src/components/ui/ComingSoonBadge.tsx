import React from 'react'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

export default function ComingSoonBadge({ className }: { className?: string }) {
    return (
        <TahoeGlassSurface
            variant="pill"
            radius={200}
            tone="light"
            className={`flex select-none items-center justify-center overflow-hidden px-[10px] py-[3px] ${className || ''}`}
            contentClassName="flex items-center justify-center"
        >
            <span
                className="whitespace-nowrap text-[10px] font-medium leading-[14px] text-white/96"
                style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
            >
                Coming soon
            </span>
        </TahoeGlassSurface>
    )
}
