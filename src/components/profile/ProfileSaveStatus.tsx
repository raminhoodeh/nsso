'use client'
import { useProfile } from '@/components/providers/ProfileProvider'
import { LIGHT_PANEL } from '@/components/ui/light-panel'

export default function ProfileSaveStatus({ floating = false, aboveBottomNav = true }: { floating?: boolean; aboveBottomNav?: boolean }) {
    const { mutationState, retryPending, loadError, refreshProfile } = useProfile()
    if (!loadError && mutationState.status === 'saved') return null
    return <div role="status" aria-live="polite" data-profile-save-status
        className={`${LIGHT_PANEL.surface} ${floating ? `fixed inset-x-3 z-[5500] mx-auto max-w-xl ${aboveBottomNav ? 'bottom-[calc(var(--mobile-bottom-nav-height,80px)+12px)] md:bottom-4' : 'bottom-[max(1rem,env(safe-area-inset-bottom))]'}` : 'my-3'} rounded-2xl border border-white/80 px-4 py-3 text-sm shadow-lg`}>
        {loadError && <p>{loadError}</p>}
        {mutationState.status !== 'saved' && <p>{mutationState.message || 'Saving your changes…'}</p>}
        {loadError
            ? <button type="button" className={`${LIGHT_PANEL.control} ${LIGHT_PANEL.focus} mt-2 min-h-11 rounded-full px-3 py-2 text-sm font-medium`} onClick={() => { void refreshProfile() }}>Refresh profile</button>
            : mutationState.status !== 'saving' && <button type="button" className={`${LIGHT_PANEL.control} ${LIGHT_PANEL.focus} mt-2 min-h-11 rounded-full px-3 py-2 text-sm font-medium`} onClick={() => { void retryPending() }}>Check status and retry my draft</button>}
    </div>
}
