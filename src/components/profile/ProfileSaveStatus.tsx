'use client'
import { useProfile } from '@/components/providers/ProfileProvider'

export default function ProfileSaveStatus({ floating = false }: { floating?: boolean }) {
    const { mutationState, retryPending, loadError, refreshProfile } = useProfile()
    if (!loadError && mutationState.status === 'saved') return null
    return <div role="status" aria-live="polite" data-profile-save-status
        className={`${floating ? 'fixed inset-x-3 bottom-[calc(var(--mobile-bottom-nav-height,80px)+12px)] z-[5500] mx-auto max-w-xl md:bottom-4' : 'my-3'} rounded-xl border border-white/20 bg-[#11161d] px-4 py-3 text-sm text-white shadow-lg`}>
        {loadError && <p>{loadError}</p>}
        {mutationState.status !== 'saved' && <p>{mutationState.message || 'Saving your changes…'}</p>}
        {loadError
            ? <button type="button" className="mt-2 min-h-11 rounded-lg border border-white/30 px-3" onClick={() => { void refreshProfile() }}>Refresh profile</button>
            : mutationState.status !== 'saving' && <button type="button" className="mt-2 min-h-11 rounded-lg border border-white/30 px-3" onClick={() => { void retryPending() }}>Check status and retry my draft</button>}
    </div>
}
