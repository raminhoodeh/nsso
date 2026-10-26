'use client'
import { useProfile } from '@/components/providers/ProfileProvider'

export default function ProfileSaveStatus() {
    const { mutationState, retryPending } = useProfile()
    if (mutationState.status === 'saved') return null
    return <div role="status" className="my-3 rounded-xl border border-white/15 bg-black/20 p-3 text-sm text-white/80">
        <p>{mutationState.message}</p>
        {mutationState.status !== 'saving' && <button type="button" className="mt-2 min-h-11 rounded-lg border border-white/20 px-3" onClick={() => { void retryPending() }}>Check status and retry my draft</button>}
    </div>
}
