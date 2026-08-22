import Link from 'next/link'

interface ShinyLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    href: string
    children: React.ReactNode
    className?: string
}

export default function ShinyLink({ href, children, className = '', ...props }: ShinyLinkProps) {
    return (
        <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            {...props}
            className={`group block relative w-full transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] glass-style-1 rounded-[100px] ${className}`}
            style={{
                '--glass-bg': 'rgba(0, 0, 0, 0.4)',
                '--glass-border': 'rgba(255, 255, 255, 0.1)'
            } as React.CSSProperties}
        >
            {/* Inner specular highlight for liquid effect */}
            <div className="glass-specular" aria-hidden="true" />

            <div className="relative z-10 flex items-center justify-center p-4">
                <span
                    className="text-[16px] font-semibold text-white/96 tracking-wide"
                    style={{
                        fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                        fontWeight: 590
                    }}
                >
                    {children}
                </span>
            </div>
        </Link>
    )
}
