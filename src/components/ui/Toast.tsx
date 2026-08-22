'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { TahoeGlassSurface, type TahoeGlassSemanticTint } from '@/components/ui/tahoe-glass'

interface Toast {
    id: string
    message: string
    type: 'success' | 'error' | 'info'
}

interface ToastContextType {
    toasts: Toast[]
    showToast: (message: string, type?: Toast['type']) => void
    hideToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    // Store the timeout ID to clear it when showing a new toast
    const [timerId, setTimerId] = useState<NodeJS.Timeout | null>(null)

    const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Math.random().toString(36).substring(7)

        // Clear existing timeout if any, to "refresh" the timer for the new toast
        if (timerId) {
            clearTimeout(timerId)
        }

        // Replace any existing toasts with the new one
        setToasts([{ id, message, type }])

        // Set a new timeout to auto dismiss
        const newTimerId = setTimeout(() => {
            setToasts([])
            setTimerId(null)
        }, 3000)

        setTimerId(newTimerId)
    }, [timerId])

    const hideToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerId) clearTimeout(timerId)
        }
    }, [timerId])

    return (
        <ToastContext.Provider value={{ toasts, showToast, hideToast }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={hideToast} />
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider')
    }
    return context
}

function ToastContainer({
    toasts,
    onDismiss
}: {
    toasts: Toast[]
    onDismiss: (id: string) => void
}) {
    if (toasts.length === 0) return null

    const semanticTint = (type: Toast['type']): TahoeGlassSemanticTint => {
        if (type === 'success') return 'light'
        if (type === 'error') return 'dark'
        return 'none'
    }

    const contentClassName = (type: Toast['type']): string => {
        if (type === 'success') return 'text-emerald-100'
        if (type === 'error') return 'text-red-100'
        return 'text-white'
    }

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2">
            {toasts.map(toast => (
                <TahoeGlassSurface
                    key={toast.id}
                    variant="popover"
                    radius={12}
                    tone="light"
                    semanticTint={semanticTint(toast.type)}
                    semanticTintOpacity={0.1}
                    role={toast.type === 'error' ? 'alert' : 'status'}
                    className="animate-slide-up cursor-pointer px-6 py-3 text-[15px] font-medium"
                    contentClassName={contentClassName(toast.type)}
                    onClick={() => onDismiss(toast.id)}
                >
                    {toast.message}
                </TahoeGlassSurface>
            ))}
        </div>
    )
}

// Simple toast function for one-off usage
export function toast(message: string, type: Toast['type'] = 'info') {
    const container = document.getElementById('toast-container') || createToastContainer()
    const host = document.createElement('div')
    const root = createRoot(host)
    let dismissed = false
    const dismiss = () => {
        if (dismissed) return
        dismissed = true
        root.unmount()
        host.remove()
    }
    const semanticTint = type === 'success' ? 'light' : type === 'error' ? 'dark' : 'none'

    container.appendChild(host)
    root.render(
        <TahoeGlassSurface
            variant="popover"
            radius={12}
            tone="light"
            semanticTint={semanticTint}
            semanticTintOpacity={0.1}
            role={type === 'error' ? 'alert' : 'status'}
            className="animate-slide-up cursor-pointer px-6 py-3 text-[15px] font-medium"
            contentClassName={type === 'success' ? 'text-emerald-100' : type === 'error' ? 'text-red-100' : 'text-white'}
            onClick={dismiss}
        >
            {message}
        </TahoeGlassSurface>
    )

    setTimeout(dismiss, 3000)
}

function createToastContainer() {
    const container = document.createElement('div')
    container.id = 'toast-container'
    container.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2'
    document.body.appendChild(container)
    return container
}
