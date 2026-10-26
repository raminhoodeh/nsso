'use client'

import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { safeWebUrl } from '@/lib/urls'

interface ShinyLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string
    children: React.ReactNode
    className?: string
}

export default function ShinyLink({ href, children, className = '', ...props }: ShinyLinkProps) {
    const destination = safeWebUrl(href)
    if (!destination) return <span className={`block p-4 text-white/60 ${className}`} title="This saved link needs to be updated.">{children}</span>
    const {
        target = '_blank',
        rel = 'noopener noreferrer',
        type: anchorType,
        ...anchorProps
    } = props

    return (
        <TahoeGlassSurface
            as="a"
            variant="pill"
            radius="100px"
            href={destination}
            target={target}
            rel={rel}
            ref={(element) => {
                if (anchorType) element?.setAttribute('type', anchorType)
            }}
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.32}
            {...anchorProps}
            className={`group block w-full transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${className}`}
            contentClassName="flex items-center justify-center p-4"
        >
            <span
                className="text-[16px] font-semibold tracking-wide text-white/96"
                style={{
                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontWeight: 590
                }}
            >
                {children}
            </span>
        </TahoeGlassSurface>
    )
}
