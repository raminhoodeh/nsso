import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { safeWebUrl } from '@/lib/urls'

export default function SafeExternalLink({ href, children, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { href: unknown; children: ReactNode }) {
    const destination = safeWebUrl(href)
    if (!destination) return <span className={props.className} title="This saved link needs to be updated.">{children}</span>
    return <a {...props} href={destination} rel="noopener noreferrer">{children}</a>
}
