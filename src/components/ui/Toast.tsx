'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

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

    const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
        const id = Math.random().toString(36).substring(7)
        setToasts(prev => [...prev, { id, message, type }])

        // Auto dismiss after 3 seconds
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 3000)
    }, [])

    const hideToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

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
                    className={`
            px-6 py-3 rounded-xl backdrop-blur-md
            text-white text-[15px] font-medium
            animate-slide-up cursor-pointer
            ${toast.type === 'success' ? 'bg-green-500/80' : ''}
            ${toast.type === 'error' ? 'bg-red-500/80' : ''}
            ${toast.type === 'info' ? 'bg-black/80' : ''}
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
    toastEl.className = `
    px-6 py-3 rounded-xl backdrop-blur-md
    text-white text-[15px] font-medium
    animate-slide-up cursor-pointer
    ${type === 'success' ? 'bg-green-500/80' : ''}
    ${type === 'error' ? 'bg-red-500/80' : ''}
    ${type === 'info' ? 'bg-black/80' : ''}
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
