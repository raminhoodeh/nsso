import React from 'react'

interface ShinyLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string
    children: React.ReactNode
    className?: string
}

export default function ShinyLink({ href, children, className = '', ...props }: ShinyLinkProps) {
    return (
        <div
            className={`p-[0.75px] rounded-[100px] group ${className}`}
            style={{
                background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)'
            }}
        >
            <a
                href={href}
                {...props}
                className="relative h-[42px] w-full rounded-[100px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                    boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)'
                }}
            >
                {/* Shiny button background layers */}
                <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[100px]" />
                <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[100px]" />

                <span
                    className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide"
                    // Fallback to system fonts if SF Pro isn't loaded globally, but keeping the requested stack
                    style={{
                        fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                        fontWeight: 590
                    }}
                >
                    {children}
                </span>
            </a>
        </div>
    )
}
