'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'

interface AddToMyNssoButtonProps {
    profileUserId: string
    isLoggedIn: boolean
    initialIsConnected: boolean
    className?: string
}

export default function AddToMyNssoButton({
    profileUserId,
    isLoggedIn,
    initialIsConnected,
    className = ''
}: AddToMyNssoButtonProps) {
    const router = useRouter()
    const { showToast } = useToast()
    const [isConnected, setIsConnected] = useState(initialIsConnected)
    const [loading, setLoading] = useState(false)
    const pending = useRef(false)

    const handleClick = async () => {
        // 1. Handle Logged Out State
        if (!isLoggedIn) {
            router.push(`/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`)
            return
        }

        // 2. Handle Already Connected State (Optional: currently disabled button but just in case)
        if (isConnected || pending.current) return
        pending.current = true

        // 3. Add Connection Logic
        setLoading(true)
        try {
            const response = await fetch('/api/my-nsso/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scannedUserId: profileUserId,
                    location: 'Online Profile' // Context for non-QR connections
                })
            })

            const data = await response.json()

            if (response.ok && data.success === true) {
                setIsConnected(true)
                showToast(data.isNewConnection ? 'Added to My nsso' : 'This person is already in My nsso', 'success')
            } else {
                throw new Error(data.error || 'Failed to add connection')
            }
        } catch {
            showToast('The connection could not be saved. Please retry.', 'error')
        } finally {
            pending.current = false; setLoading(false)
        }
    }

    return (
        <button
            onClick={handleClick}
            disabled={isConnected || loading}
            aria-busy={loading}
            className={`
                relative group flex min-h-11 items-center justify-center px-6 py-2 rounded-full overflow-hidden transition-all duration-300
                backdrop-blur-xl bg-black/60 hover:bg-black/70
                border border-white/10 hover:border-white/20
                shadow-lg hover:shadow-xl hover:scale-105 active:scale-95
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                ${className}
            `}
        >
            <span
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none rounded-full opacity-50"
                style={{
                    background: 'radial-gradient(circle at center top, rgba(255, 255, 255, 0.15), transparent 70%)'
                }}
            />

            <span className={`relative z-10 whitespace-nowrap text-center text-[14px] font-semibold leading-normal tracking-wide drop-shadow-sm transition-colors ${isConnected ? 'text-green-400' : 'text-[#5ac8f5]'}`}>
                {loading ? 'Adding...' : isConnected ? 'Added' : 'Add to my nsso'}
            </span>
        </button>
    )
}
