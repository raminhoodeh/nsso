'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { LightButton } from '@/components/ui/LightButton'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
export default function QRScanHandler({ scannedUserId, currentUser }: { scannedUserId: string; currentUser: { id: string } | null }) {
    const searchParams = useSearchParams()
    const { showToast } = useToast()
    const [dismissed, setDismissed] = useState(false)
    const [busy, setBusy] = useState(false)
    const [location, setLocation] = useState('')
    const inFlight = useRef(false)
    const eligible = searchParams.get('source') === 'qr' && currentUser && currentUser.id !== scannedUserId
    async function connect(event: React.FormEvent) {
        event.preventDefault()
        if (inFlight.current) return
        inFlight.current = true; setBusy(true)
        try {
            const response = await fetch('/api/my-nsso/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scannedUserId, location: location.trim() }) })
            const data = await response.json()
            if (!response.ok || data.success !== true) throw new Error('Connection unavailable')
            showToast(data.isNewConnection ? 'Added to My nsso' : 'This person is already in My nsso', 'success')
            setDismissed(true)
        } catch { showToast('Your connection could not be saved. Please retry.', 'error') }
        finally { setBusy(false); inFlight.current = false }
    }
    if (!eligible || dismissed) return null
    return <aside aria-label="Save scanned profile" className={`${LIGHT_PANEL.surface} ${LIGHT_PANEL.focusWithin} fixed inset-x-4 bottom-5 z-[90] mx-auto max-w-md rounded-2xl border border-white/80 p-5 shadow-xl`}>
        <form onSubmit={connect} className="space-y-3">
            <p>Add this person to My nsso? You will both see the connection; your notes stay private.</p>
            <label className="block text-sm">Where did you meet? (optional)<input maxLength={300} value={location} onChange={event => setLocation(event.target.value)} placeholder="For example, Dubai conference" className={`${LIGHT_PANEL.group} ${LIGHT_PANEL.focus} mt-2 min-h-11 w-full rounded-lg p-3 text-base text-slate-950 placeholder:text-slate-700`} /></label>
            <div className="flex gap-3"><LightButton type="submit" disabled={busy} className="min-h-11 px-4 py-2" contentClassName="text-sm">{busy ? 'Adding…' : 'Add to My nsso'}</LightButton><LightButton type="button" onClick={() => setDismissed(true)} className="min-h-11 px-4 py-2" contentClassName="text-sm">Not now</LightButton></div>
        </form>
    </aside>
}
