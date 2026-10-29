'use client'

import { Children, useId, useState, type ReactNode } from 'react'
import ReadMoreChip from './ReadMoreChip'

interface ExpandableProfileListProps {
    children: ReactNode
    context: string
    className?: string
}

function ProfileListDisclosure({ items, context, className }: Omit<ExpandableProfileListProps, 'children'> & { items: ReactNode[] }) {
    const [expanded, setExpanded] = useState(false)
    const remainingId = useId()
    const canExpand = items.length > 4

    return <div data-profile-list-disclosure={context} className={className}>
        {items.slice(0, 4)}
        {canExpand && <ReadMoreChip
            aria-controls={remainingId}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Read less' : 'Read more'} about ${context}`}
            onClick={event => {
                // Keep focus outside the region being hidden, including in
                // browsers that do not focus buttons on a pointer click.
                event.currentTarget.focus({ preventScroll: true })
                setExpanded(value => !value)
            }}
        >{expanded ? 'Read less' : 'Read more'}</ReadMoreChip>}
        {canExpand && <div id={remainingId} hidden={!expanded} className={className}>
            {items.slice(4)}
        </div>}
    </div>
}

export default function ExpandableProfileList({ children, ...props }: ExpandableProfileListProps) {
    const items = Children.toArray(children)
    const identity = items.map(item => typeof item === 'object' && item !== null && 'key' in item ? String(item.key) : String(item))
    return <ProfileListDisclosure key={JSON.stringify([props.context, identity])} {...props} items={items} />
}
