'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
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
const IMPERATIVE_TOAST_EVENT = 'nsso:toast'

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Math.random().toString(36).substring(7)

        // Clear existing timeout if any, to "refresh" the timer for the new toast
        if (timerRef.current) {
            clearTimeout(timerRef.current)
        }

        // Replace any existing toasts with the new one
        setToasts([{ id, message, type }])

        // Set a new timeout to auto dismiss
        timerRef.current = setTimeout(() => {
            setToasts([])
            timerRef.current = null
        }, 3000)
    }, [])

    const hideToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    useEffect(() => {
        const receiveImperativeToast = (event: Event) => {
            const detail = (event as CustomEvent<{ message?: unknown; type?: unknown }>).detail
            if (!detail || typeof detail.message !== 'string') return
            const type = detail.type === 'success' || detail.type === 'error' ? detail.type : 'info'
            showToast(detail.message, type)
        }
        window.addEventListener(IMPERATIVE_TOAST_EVENT, receiveImperativeToast)
        return () => {
            window.removeEventListener(IMPERATIVE_TOAST_EVENT, receiveImperativeToast)
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    }, [showToast])

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
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(IMPERATIVE_TOAST_EVENT, {
        detail: { message, type }
    }))
}
