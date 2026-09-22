'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

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

export function ToastViewport() {
    const { toasts, hideToast } = useToast()
    return <ToastContainer toasts={toasts} onDismiss={hideToast} />
}

function ToastContainer({
    toasts,
    onDismiss
}: {
    toasts: Toast[]
    onDismiss: (id: string) => void
}) {
    if (toasts.length === 0) return null

    return (
        <div className="fixed bottom-[calc(var(--mobile-bottom-nav-height)+12px)] left-1/2 z-[9999] flex w-[calc(100%_-_2rem)] max-w-sm -translate-x-1/2 flex-col gap-2 md:bottom-6 md:w-auto">
            {toasts.map(toast => (
                <div key={toast.id} className="w-full">
                    <span className="sr-only" role={toast.type === 'error' ? 'alert' : 'status'}>
                        {toast.message}
                    </span>
                    <button
                        type="button"
                        aria-label={`Dismiss notification: ${toast.message}`}
                        className={cn(
                            'animate-slide-up min-h-12 w-full cursor-pointer rounded-2xl border bg-[#11161d] px-5 py-3 text-center text-[15px] font-semibold text-white shadow-[0_18px_50px_rgba(0,0,0,0.55)] outline-none focus-visible:ring-2 focus-visible:ring-white/80 md:w-auto',
                            toast.type === 'success' && 'border-emerald-300/50 text-emerald-100',
                            toast.type === 'error' && 'border-red-300/50 text-red-100',
                            toast.type === 'info' && 'border-white/25'
                        )}
                        onClick={() => onDismiss(toast.id)}
                    >
                        {toast.message}
                    </button>
                </div>
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
