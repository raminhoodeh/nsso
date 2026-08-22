'use client'

import { useState } from 'react'
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

    const handleClick = async () => {
        // 1. Handle Logged Out State
        if (!isLoggedIn) {
            router.push('/sign-in')
            return
        }

        // 2. Handle Already Connected State (Optional: currently disabled button but just in case)
        if (isConnected) return

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

            if (response.ok) {
                setIsConnected(true)
                showToast('Added to My nsso', 'success')
            } else {
                throw new Error(data.error || 'Failed to add connection')
            }
        } catch (error) {
            console.error('Failed to add connection:', error)
            showToast('Failed to add connection', 'error')
        } finally {
            setLoading(false)
        }
    }

    return (
        <TahoeGlassButton
            onClick={handleClick}
            disabled={isConnected || loading}
            aria-busy={loading}
            tone="light"
            semanticTint={isConnected ? 'light' : 'none'}
            semanticTintOpacity={0.1}
            className={`group overflow-hidden px-6 py-2 transition-all duration-300 hover:scale-105 active:scale-95 disabled:!pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${className}`}
            contentClassName="flex flex-col items-center justify-center text-inherit"
        >
            <span className={`whitespace-nowrap text-center text-[14px] font-semibold leading-normal tracking-wide drop-shadow-sm transition-colors ${isConnected ? 'text-green-400' : 'text-[#5ac8f5]'}`}>
                {loading ? 'Adding...' : isConnected ? 'Added' : 'Add to my nsso'}
            </span>
        </TahoeGlassButton>
    )
}
