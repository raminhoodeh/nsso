import React from 'react'

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
            className="group block relative w-full transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] glass-style-1 rounded-[100px]"
            style={{
                '--glass-bg': 'rgba(0, 0, 0, 0.4)',
                '--glass-border': 'rgba(255, 255, 255, 0.1)'
            } as React.CSSProperties}
        >
            {/* Inner specular highlight for liquid effect */}
            <div className="glass-specular" aria-hidden="true" />

            <div className="relative z-10 flex items-center p-4">
                {/* Thumbnail */}
                <div className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden border border-white/10 bg-black/20">
                    {thumbnailUrl ? (
                        <Image
                            src={thumbnailUrl}
                            alt={title}
                            fill
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 ml-4 flex flex-col justify-center">
                    <h3 className="text-white font-medium truncate text-base pr-8">
                        {title}
                    </h3>
                </div>

                {/* External Link Icon */}
                <div className="absolute right-6 text-white/30 group-hover:text-white/70 transition-colors">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                </div>
            </div>
        </Link>
    )
}
