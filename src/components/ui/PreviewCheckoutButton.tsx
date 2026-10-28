'use client'

import { type ReactNode, useId, useState } from 'react'
import GlassButton from '@/components/ui/GlassButton'
import { LIGHT_PANEL } from '@/components/ui/light-panel'

interface PreviewCheckoutButtonProps {
    children: ReactNode
    className?: string
    buttonClassName?: string
}

/** A real, keyboard-accessible attempt never submits a form or opens a provider. */
export default function PreviewCheckoutButton({ children, className = '', buttonClassName }: PreviewCheckoutButtonProps) {
    const noticeId = useId()
    const [attempted, setAttempted] = useState(false)
    const props = {
        type: 'button' as const,
        onClick: () => setAttempted(true),
        'aria-describedby': attempted ? noticeId : undefined,
    }

    return <div className={className}>
        {buttonClassName
            ? <button {...props} className={buttonClassName}>{children}</button>
            : <GlassButton {...props} className="w-full">{children}</GlassButton>}
        {attempted && <p id={noticeId} role="status" className={`${LIGHT_PANEL.surface} mt-3 rounded-xl border border-white/80 px-3 py-2 text-center text-sm font-medium`}>
            <span>Checkout is disabled during profile preview</span>
        </p>}
    </div>
}
