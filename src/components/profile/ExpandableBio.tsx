'use client'

import { useId, useState } from 'react'

interface ExpandableBioProps {
    text: string
    collapsedText?: string
    className?: string
}

export default function ExpandableBio({ text, collapsedText, className }: ExpandableBioProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const contentId = useId()
    const fullText = text.trimEnd()
    const canCollapse = Boolean(
        collapsedText &&
        fullText.startsWith(collapsedText) &&
        fullText.length > collapsedText.length,
    )
    const visibleText = canCollapse && !isExpanded ? collapsedText : fullText

    return (
        <p className={className}>
            <span id={contentId}>{visibleText}</span>
            {canCollapse && (
                <>
                    {' '}
                    <button
                        type="button"
                        aria-controls={contentId}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Collapse bio' : 'Show full bio'}
                        onClick={() => setIsExpanded((expanded) => !expanded)}
                        className="inline font-semibold text-cyan-300 underline decoration-cyan-300/50 underline-offset-4 transition-colors hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    >
                        {isExpanded ? 'see less' : 'see more'}
                    </button>
                </>
            )}
        </p>
    )
}
