'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { getProfileTextPreview } from './profileBio'
import ReadMoreChip from './ReadMoreChip'

interface ExpandableProfileTextProps {
    text: string
    context: string
    className?: string
}

function ProfileTextDisclosure({ text, context, className }: ExpandableProfileTextProps) {
    const [expanded, setExpanded] = useState(false)
    const contentId = useId()
    const preview = getProfileTextPreview(text)
    const canExpand = preview !== undefined

    return <p data-profile-text-disclosure="true" className={cn('whitespace-pre-wrap [overflow-wrap:anywhere]', className)}>
        <span id={contentId} data-profile-text-content="true">{canExpand && !expanded ? `${preview}…` : text}</span>
        {canExpand && <>{' '}<ReadMoreChip
            aria-controls={contentId}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Read less' : 'Read more'} about ${context}`}
            onClick={event => {
                event.currentTarget.focus({ preventScroll: true })
                setExpanded(value => !value)
            }}
        >{expanded ? 'Read less' : 'Read more'}</ReadMoreChip></>}
    </p>
}

/** Display-only disclosure; a new entity or saved body starts collapsed. */
export default function ExpandableProfileText(props: ExpandableProfileTextProps) {
    if (!props.text.trim()) return null
    return <ProfileTextDisclosure key={JSON.stringify([props.context, props.text])} {...props} />
}
