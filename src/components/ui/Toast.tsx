'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

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

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2">
            {toasts.map(toast => (
                <div
                    key={toast.id}
                    data-glass-auto="true"
                    data-glass-variant="lens"
                    data-glass-radius="12"
                    data-glass-distortion="9"
                    className={`
            px-6 py-3 rounded-xl backdrop-blur-md
            text-white text-[15px] font-medium
            animate-slide-up cursor-pointer
            ${toast.type === 'success' ? 'bg-green-500/60' : ''}
            ${toast.type === 'error' ? 'bg-red-500/60' : ''}
            ${toast.type === 'info' ? 'bg-black/60' : ''}
          `}
                    onClick={() => onDismiss(toast.id)}
                >
                    {toast.message}
                </div>
            ))}
        </div>
    )
}

// Simple toast function for one-off usage
export function toast(message: string, type: Toast['type'] = 'info') {
    // Create and append toast element directly to DOM for simple usage
    const container = document.getElementById('toast-container') || createToastContainer()

    const toastEl = document.createElement('div')
    toastEl.dataset.glassAuto = 'true'
    toastEl.dataset.glassVariant = 'lens'
    toastEl.dataset.glassRadius = '12'
    toastEl.dataset.glassDistortion = '9'
    toastEl.className = `
    px-6 py-3 rounded-xl backdrop-blur-md
    text-white text-[15px] font-medium
    animate-slide-up cursor-pointer
    ${type === 'success' ? 'bg-green-500/60' : ''}
    ${type === 'error' ? 'bg-red-500/60' : ''}
    ${type === 'info' ? 'bg-black/60' : ''}
  `
    toastEl.textContent = message
    toastEl.style.backdropFilter = 'blur(10px)'

    toastEl.onclick = () => toastEl.remove()
    container.appendChild(toastEl)

    setTimeout(() => toastEl.remove(), 3000)
}

function createToastContainer() {
    const container = document.createElement('div')
    container.id = 'toast-container'
    container.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2'
    document.body.appendChild(container)
    return container
}
