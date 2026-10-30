'use client'

import { createContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

export const ProfileTimelineDisclosureContext = createContext<{
    expanded: boolean
    setExpanded: Dispatch<SetStateAction<boolean>>
} | null>(null)

/** Keep the two resume timelines in step without moving their content client-side. */
export default function ProfileTimelineDisclosureGroup({ children }: { children: ReactNode }) {
    const [expanded, setExpanded] = useState(false)
    const value = useMemo(() => ({ expanded, setExpanded }), [expanded])

    return <ProfileTimelineDisclosureContext.Provider value={value}>{children}</ProfileTimelineDisclosureContext.Provider>
}
