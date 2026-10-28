'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { TahoeGlassButton } from '@/components/ui/tahoe-glass'

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
        <TahoeGlassButton
            type="button"
            onClick={handleClick}
            disabled={isConnected || loading}
            aria-busy={loading}
            tone="light"
            className={`
                min-h-11 px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed
                ${className}
            `}
            contentClassName={`whitespace-nowrap text-center text-[14px] font-semibold leading-normal tracking-wide ${isConnected ? 'text-green-400' : 'text-white'}`}
        >
            {loading ? 'Adding...' : isConnected ? 'Added' : 'Add to my nsso'}
        </TahoeGlassButton>
    )
}
