import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface ShinyLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string
    children: React.ReactNode
    className?: string
}

export default function ShinyLink({ href, children, className = '', ...props }: ShinyLinkProps) {
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
            href={href}
            target={target}
            rel={rel}
            ref={(element) => {
                if (anchorType) element?.setAttribute('type', anchorType)
            }}
            tone="light"
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
