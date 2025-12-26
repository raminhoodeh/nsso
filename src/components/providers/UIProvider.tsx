'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

interface UIContextType {
    isBackgroundDimmed: boolean
    setBackgroundDimmed: (dimmed: boolean) => void
}

const UIContext = createContext<UIContextType | undefined>(undefined)

export function UIProvider({ children }: { children: ReactNode }) {
    const [isBackgroundDimmed, setBackgroundDimmed] = useState(false)

    return (
        <UIContext.Provider value={{ isBackgroundDimmed, setBackgroundDimmed }}>
            {children}
        </UIContext.Provider>
    )
}

export function useUI() {
    const context = useContext(UIContext)
    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider')
    }
    return context
}
