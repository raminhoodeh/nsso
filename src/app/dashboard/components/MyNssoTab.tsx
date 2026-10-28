'use client'

import { useState, useEffect, useRef } from 'react'
import { MyNssoConnection } from '@/lib/types'
import NetworkTable from './NetworkTable'
import NetworkingTimeline from './NetworkingTimeline'
import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import { useToast } from '@/components/ui/Toast'
import { useUI } from '@/components/providers/UIProvider'
import { TahoeGlassButton, TahoeGlassDialog, TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { boundedClientRead } from '@/lib/client-read'
import Link from 'next/link'

interface MyNssoTabProps {
    initialData?: {
        connections: MyNssoConnection[]
    }
}

export default function MyNssoTab({ initialData }: MyNssoTabProps) {
    const { setBackgroundDimmed } = useUI()
    const { showToast } = useToast()
    const [connections, setConnections] = useState<MyNssoConnection[]>(initialData?.connections || [])
    const [loading, setLoading] = useState(!initialData)
    const [loadError, setLoadError] = useState('')
    const connectionRead = useRef<AbortController | null>(null)
    // A late dashboard prefetch must not abort the tab's own in-flight read or
    // overwrite edits. initialData is a seed for this mounted account only.
    const hasInitialSeed = useRef(Boolean(initialData))

    // Handle background dimming
    useEffect(() => {
        setBackgroundDimmed(true)
        return () => setBackgroundDimmed(false)
    }, [setBackgroundDimmed])

    // Hoisted State for Modal
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [selectedConnection, setSelectedConnection] = useState<MyNssoConnection | null>(null)

    function openModal(conn: MyNssoConnection) {
        setSelectedConnection(conn)
        setIsModalOpen(true)
    }

    function closeModal() {
        setIsModalOpen(false)
        setSelectedConnection(null)
    }

    async function handleSaveNotes(id: string, notes: string): Promise<string | null> {
        try {
            await handleUpdateConnection(id, { notes })
            showToast('Notes saved', 'success')
            closeModal()
            return null
        } catch {
            return 'Your notes could not be saved. Your draft is still here. Please try again.'
        }
    }

    async function handleRemoveConnection(id: string): Promise<string | null> {
        try {
            const response = await fetch(`/api/my-nsso/connections/${id}`, { method: 'DELETE' })
            if (!response.ok) return response.status === 429
                ? 'Too many requests. Please wait a moment and try again.'
                : 'This connection could not be removed. Your notes are still here. Please try again.'
            setConnections(previous => previous.filter(connection => connection.id !== id))
            closeModal()
            showToast('Removed from My nsso', 'success')
            return null
        } catch {
            return 'We could not confirm removal. Please check your connections before trying again.'
        }
    }

    const loadConnections = async (signal?: AbortSignal) => {
        connectionRead.current?.abort()
        const controller = new AbortController()
        connectionRead.current = controller
        const lifetime = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
        setLoadError('')
        try {
            const data = await boundedClientRead(async readSignal => {
                const response = await fetch('/api/my-nsso/connections?sort=date&order=desc', { signal: readSignal, cache: 'no-store' })
                if (!response.ok) throw new Error('unavailable')
                const body = await response.json()
                if (!Array.isArray(body.connections)) throw new Error('invalid response')
                return body
            }, { signal: lifetime })
            if (!lifetime.aborted) setConnections(data.connections)
        } catch {
            if (!lifetime.aborted) setLoadError('Your connections could not be loaded. Your saved notes have not changed.')
        } finally { if (!lifetime.aborted) setLoading(false) }
    }

    useEffect(() => {
        const controller = new AbortController()
        if (!hasInitialSeed.current) void loadConnections(controller.signal)
        return () => { controller.abort(); connectionRead.current?.abort() }
    }, [])

    // Update Connection Handler
    const handleUpdateConnection = async (id: string, data: { notes?: string, location?: string }) => {
        const response = await fetch(`/api/my-nsso/connections/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        })

        if (!response.ok) {
            throw new Error('Failed to update')
        }

        // Optimistic Update
        setConnections(prev => prev.map(c => {
            if (c.id === id) {
                return {
                    ...c,
                    ...data
                }
            }
            return c
        }))
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <TahoeGlassSurface variant="pill" tone="light" className="px-6 py-3" contentClassName="text-xl text-center">
                    All of you...<br />all in one place
                </TahoeGlassSurface>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {loadError && <div role="alert" className="rounded-xl border border-white/20 p-4 text-white"><p>{loadError}</p><TahoeGlassButton type="button" tone="light" className="mt-3 min-h-11 px-4 py-2" contentClassName="text-sm text-white" onClick={() => { void loadConnections() }}>Retry connections</TahoeGlassButton></div>}
            <GlassCard refractive className="relative p-4 sm:p-6 lg:p-8">
                {/* Header Section */}
                <div className="text-left space-y-2 mb-6 md:pr-52">
                    <h2 className="text-2xl font-bold text-white sm:text-3xl">My nsso Network</h2>
                    <p className="text-white/80 max-w-lg">
                        Your personal timeline of everyone you&apos;ve met.
                        Scan QR codes to build your journey.
                    </p>
                </div>

                <p className="mb-6 text-sm text-white/70 md:absolute md:right-8 md:top-8 md:mb-0 md:max-w-44">Discover nsso users — coming soon</p>

                {connections.length === 0 && !loadError && <section aria-labelledby="network-start-title" className="mb-6 rounded-2xl border border-white/20 bg-black/25 p-5 text-white">
                    <h3 id="network-start-title" className="text-lg font-semibold">Start with someone you know</h3>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-white/85">
                        <li>Open your profile and tap the profile photo to show your QR code.</li>
                        <li>Ask someone to scan it with their phone camera and open your profile.</li>
                        <li>They can sign in and choose “Add to My nsso”. You will both see the connection here; notes stay private.</li>
                    </ol>
                    <Link href="/preview" className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-white/30 bg-white/10 px-4 py-2 font-medium outline-none focus-visible:ring-2 focus-visible:ring-white">Open my profile and QR</Link>
                </section>}

                {/* Top Section: Table View */}
                <div className="space-y-4 mb-12">
                    {/*  <div className="flex items-center gap-2 px-2">
                        <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Quick Access</span>
                        <div className="h-[1px] flex-1 bg-white/10" />
                    </div> */}
                    <NetworkTable
                        connections={connections}
                        onUpdateConnection={handleUpdateConnection}
                        onOpenNotes={openModal}
                    />
                </div>

                {/* Bottom Section: Timeline View */}
                {connections.length > 0 && (
                    <div className="space-y-8 pt-8 border-t border-white/5 relative">
                        {/*  <div className="flex items-center justify-center mb-12">
                             <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-white/60 uppercase tracking-widest backdrop-blur-md">
                                Your Journey
                            </span>
                        </div> */}

                        <h3 className="text-center text-xl font-bold text-white/90">Your Journey</h3>

                        <NetworkingTimeline
                            connections={connections}
                            onOpenNotes={openModal}
                        />
                    </div>
                )}
            </GlassCard>

            {/* Shared Notes Modal */}
            {selectedConnection && (
                <NotesModal
                    key={selectedConnection.id}
                    isOpen={isModalOpen}
                    onClose={closeModal}
                    connection={selectedConnection}
                    onSave={handleSaveNotes}
                    onRemove={handleRemoveConnection}
                />
            )}
        </div>
    )


}

interface NotesModalProps {
    isOpen: boolean
    onClose: () => void
    connection: MyNssoConnection
    onSave: (id: string, notes: string) => Promise<string | null>
    onRemove: (id: string) => Promise<string | null>
}

function NotesModal({ isOpen, onClose, connection, onSave, onRemove }: NotesModalProps) {
    const [content, setContent] = useState(connection.notes || '')
    const [saving, setSaving] = useState(false)
    const [removing, setRemoving] = useState(false)
    const [confirmRemoval, setConfirmRemoval] = useState(false)
    const [error, setError] = useState('')
    const pending = useRef(false)
    const busy = saving || removing

    async function saveNotes() {
        if (pending.current) return
        pending.current = true
        setSaving(true)
        setError('')
        try {
            const message = await onSave(connection.id, content)
            if (message) setError(message)
        } finally {
            pending.current = false
            setSaving(false)
        }
    }

    async function removeConnection() {
        if (!confirmRemoval || pending.current) return
        pending.current = true
        setRemoving(true)
        setError('')
        try {
            const message = await onRemove(connection.id)
            if (message) setError(message)
        } finally {
            pending.current = false
            setRemoving(false)
        }
    }

    return (
        <TahoeGlassDialog
            open={isOpen}
            onOpenChange={(open) => { if (!open && !busy) onClose() }}
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.38}
            aria-label={`Notes for ${connection.fullName}`}
            overlayClassName="z-[10000]"
            backdropClassName="bg-black/70"
            className="max-w-lg p-6"
            contentClassName="rounded-2xl bg-[#202126] p-1"
        >
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">Notes for {connection.fullName}</h3>
                <TahoeGlassButton tone="light" onClick={onClose} disabled={busy} className="h-11 w-11 shrink-0 p-0" contentClassName="text-white/85" aria-label="Close notes dialog">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </TahoeGlassButton>
            </div>
            <TahoeGlassField label="Connection notes" visuallyHideLabel tone="light" surfaceClassName="p-0 mb-2" controlClassName="max-h-[35dvh] min-h-24 p-3 resize-y custom-scrollbar">
                <textarea
                    aria-label="Connection notes"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={busy}
                    maxLength={3333}
                    rows={8}
                    placeholder="Add notes about your meeting, context, or follow-ups..."
                    className="text-base text-white placeholder:text-white/60"
                />
            </TahoeGlassField>
            {error && <p role="alert" className="mb-3 text-sm text-rose-200">{error}</p>}
            <div className="flex flex-wrap justify-between items-center text-xs text-white/70 gap-3">
                <span>{content.length} / 3333 characters</span>
                <TahoeGlassButton tone="light" onClick={() => { void saveNotes() }} disabled={busy || confirmRemoval} className="min-h-11 px-4 py-2" contentClassName="text-white font-semibold">
                    {saving ? 'Saving...' : 'Save Notes'}
                </TahoeGlassButton>
            </div>
            <div className="mt-5 pt-4 border-t border-white/10">
                {confirmRemoval ? (
                    <div className="space-y-3">
                        <p className="text-sm text-white/80">
                            Remove {connection.fullName} from your My nsso? This removes them from your list and deletes your private notes, including any unsaved notes. Their record of you stays unchanged.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <TahoeGlassButton tone="light" onClick={() => { void removeConnection() }} disabled={busy} className="min-h-11 px-4 py-2" contentClassName="text-rose-200">
                                {removing ? 'Removing...' : 'Confirm removal'}
                            </TahoeGlassButton>
                            <TahoeGlassButton onClick={() => { setConfirmRemoval(false); setError('') }} disabled={busy} className="min-h-11 px-4 py-2">Keep connection</TahoeGlassButton>
                        </div>
                    </div>
                ) : (
                    <TahoeGlassButton tone="light" onClick={() => { setConfirmRemoval(true); setError('') }} disabled={busy} className="min-h-11 px-4 py-2" contentClassName="text-rose-200">Remove from My nsso</TahoeGlassButton>
                )}
            </div>
        </TahoeGlassDialog>
    )
}
