import React from 'react'

export default function ComingSoonBadge({ className }: { className?: string }) {
    return (
        <div className={`relative border-[0.75px] border-white/45 rounded-[200px] px-[10px] py-[3px] overflow-hidden flex items-center justify-center select-none ${className}`}>
            <div className="absolute inset-0 bg-white/[0.03] mix-blend-luminosity rounded-[200px]" />
            <div className="absolute inset-0 bg-gray-500/15 mix-blend-color-dodge rounded-[200px]" />
            <img
                alt=""
                src="/assets/premium-bezel.png"
                className="absolute inset-0 w-full h-full object-cover backdrop-blur-[68px]"
            />
            <span
                className="relative z-10 font-medium text-[10px] text-white/96 leading-[14px] whitespace-nowrap"
                style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
            >
                Coming soon
            </span>
        </div>
    )
}
