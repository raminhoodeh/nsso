'use client'

import { useRouter } from 'next/navigation'
import GlassButton from '@/components/ui/GlassButton'
import { useToast } from '@/components/ui/Toast'

interface OwnerProfileNavProps {
    username: string
}

export default function OwnerProfileNav({ username }: OwnerProfileNavProps) {
    const router = useRouter()
    const { showToast } = useToast()

    const copyProfileUrl = () => {
        const url = `${window.location.origin}/${username}`
        navigator.clipboard.writeText(url)
        showToast('Profile URL copied!', 'success')
    }

    return (
        <nav className="fixed top-0 left-0 right-0 z-[5000] bg-black/20 backdrop-blur-md">
            <div className="max-w-[1470px] mx-auto px-6 lg:px-[165px] h-[72px] flex items-center justify-between">
                <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/dashboard')}
                >
                    ← Back to Dashboard
                </GlassButton>
                <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={copyProfileUrl}
                >
                    Copy page URL
                </GlassButton>
            </div>
        </nav>
    )
}
