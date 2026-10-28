'use client'
import { useProfile } from '@/components/providers/ProfileProvider'
import { TahoeGlassButton } from '@/components/ui/tahoe-glass'

export default function ProfileSaveStatus({ floating = false, aboveBottomNav = true }: { floating?: boolean; aboveBottomNav?: boolean }) {
    const { mutationState, retryPending, loadError, refreshProfile } = useProfile()
    if (!loadError && mutationState.status === 'saved') return null
    return <div role="status" aria-live="polite" data-profile-save-status
        className={`${floating ? `fixed inset-x-3 z-[5500] mx-auto max-w-xl ${aboveBottomNav ? 'bottom-[calc(var(--mobile-bottom-nav-height,80px)+12px)] md:bottom-4' : 'bottom-[max(1rem,env(safe-area-inset-bottom))]'}` : 'my-3'} rounded-xl border border-white/20 bg-[#11161d] px-4 py-3 text-sm text-white shadow-lg`}>
        {loadError && <p>{loadError}</p>}
        {mutationState.status !== 'saved' && <p>{mutationState.message || 'Saving your changes…'}</p>}
        {loadError
            ? <TahoeGlassButton type="button" tone="light" className="mt-2 min-h-11 px-3 py-2" contentClassName="text-sm text-white" onClick={() => { void refreshProfile() }}>Refresh profile</TahoeGlassButton>
            : mutationState.status !== 'saving' && <TahoeGlassButton type="button" tone="light" className="mt-2 min-h-11 px-3 py-2" contentClassName="text-sm text-white" onClick={() => { void retryPending() }}>Check status and retry my draft</TahoeGlassButton>}
    </div>
}
