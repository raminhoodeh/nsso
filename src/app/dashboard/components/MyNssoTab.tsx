'use client'

import { useState, useEffect } from 'react'
import { MyNssoConnection } from '@/lib/types'
import NetworkTable from './NetworkTable'
import NetworkingTimeline from './NetworkingTimeline'
import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import { useToast } from '@/components/ui/Toast'
import { useUI } from '@/components/providers/UIProvider'
import { TahoeGlassButton, TahoeGlassDialog, TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

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

    async function handleSaveNotes(id: string, notes: string) {
        try {
            await handleUpdateConnection(id, { notes })
            showToast('Notes saved', 'success')
            setIsModalOpen(false)
        } catch (error) {
            showToast('Failed to save notes', 'error')
        }
    }



    // Load Connections
    const loadConnections = async () => {
        try {
            const response = await fetch('/api/my-nsso/connections?sort=date&order=desc')
            if (response.ok) {
                const data = await response.json()
                setConnections(data.connections)
            } else {
                showToast('Failed to load connections', 'error')
            }
        } catch (error) {
            console.error('Error loading connections:', error)
            showToast('Failed to load connections', 'error')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!initialData) {
            loadConnections()
        }
    }, [initialData])

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
            <GlassCard refractive className="p-6 lg:p-8 relative pt-[48px]">
                {/* Header Section */}
                <div className="text-left space-y-2 mb-10">
                    <h2 className="text-3xl font-bold text-white">My nsso Network</h2>
                    <p className="text-white/60 max-w-lg">
                        Your personal timeline of everyone you&apos;ve met.
                        Scan QR codes to build your journey.
                    </p>
                </div>

                {/* Coming Soon: Discover nsso users */}
                <TahoeGlassSurface variant="panel" radius={12} tone="light" className="absolute top-8 right-8 hidden md:block cursor-help opacity-60 hover:opacity-100 transition-opacity group" contentClassName="flex items-center gap-4 px-4 py-2.5">
                    <span className="text-white/50 text-[15px]">Discover nsso users</span>
                    <TahoeGlassSurface variant="pill" tone="light" className="px-[10px] py-[3px]" contentClassName="flex items-center justify-center">
                        <span className="font-medium text-[10px] text-white/96 leading-[14px] whitespace-nowrap" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                            Coming soon
                        </span>
                    </TahoeGlassSurface>

                    {/* Tooltip */}
                    <TahoeGlassSurface variant="popover" radius={12} tone="light" className="absolute right-0 top-full mt-2 w-64 p-3 z-[60] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none shadow-xl" contentClassName="text-white/80 text-xs leading-relaxed text-right">
                        Find and follow other users to grow your network.
                    </TahoeGlassSurface>
                </TahoeGlassSurface>

                {/* Top Section: Table View */}
                <div className="space-y-4 mb-12">
                    {/*  <div className="flex items-center gap-2 px-2">
                        <span className="text-xs font-bold text-white/40 uppercase tracking-widest">Quick Access</span>
                        <div className="h-[1px] flex-1 bg-white/10" />
                    </div> */}
                    <NetworkTable
                        connections={connections}
                        onUpdateConnection={handleUpdateConnection}
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
                            onOpenNotes={(conn) => {
                                // We can reuse the modal logic from Table if we hoist the state up, 
                                // OR simpler: Just define a shared update handler and let Timeline trigger it?
                                // Actually Timeline opens Notes too. 
                                // Since the Notes Modal is built into NetworkTable currently, 
                                // we should probably extract the Modal to this parent level OR 
                                // let Timeline have its own Modal (might duplicate code but simpler refactor).

                                // Better UX: Hoist the modal state here to MyNssoTab so both children can open it.
                                // However, simply for V1 speed, let's keep it simple.
                                // If user clicks note in Timeline, we need to show a modal.
                                // For now, let's just pass a "not implemented" toast or 
                                // Actually, I should refactor NetworkTable to accept `isNotesOpen` etc if hoisting.

                                // Let's create a shared modal here in MyNssoTab instead!
                                // Refactoring decision: Yes, hoist modal state.
                                openModal(conn)
                            }}
                        />
                    </div>
                )}
            </GlassCard>

            {/* Shared Notes Modal */}
            {selectedConnection && (
                <NotesModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    connection={selectedConnection}
                    onSave={handleSaveNotes}
                />
            )}
        </div>
    )


}

// Extracted Modal Component (Same as inside NetworkTable roughly)
interface NotesModalProps {
    isOpen: boolean;
    onClose: () => void;
    connection: MyNssoConnection;
    onSave: (id: string, notes: string) => Promise<void>;
}

function NotesModal({ isOpen, onClose, connection, onSave }: NotesModalProps) {
    const [content, setContent] = useState(connection.notes || '')
    const [saving, setSaving] = useState(false)

    return (
        <TahoeGlassDialog
            open={isOpen}
            onOpenChange={(open) => { if (!open) onClose() }}
            portal={false}
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.38}
            aria-label={`Notes for ${connection.fullName}`}
            className="max-w-lg p-6"
        >
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-white">
                            Notes for {connection.fullName}
                        </h3>
                        <TahoeGlassButton onClick={onClose} className="h-9 w-9 p-0" contentClassName="text-white/70" aria-label="Close notes dialog">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </TahoeGlassButton>
                    </div>

                    <TahoeGlassField tone="light" surfaceClassName="p-0 mb-2" controlClassName="p-4 resize-none custom-scrollbar">
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            maxLength={3333}
                            rows={8}
                            placeholder="Add notes about your meeting, context, or follow-ups..."
                            className="text-white placeholder:text-white/30"
                        />
                    </TahoeGlassField>

                    <div className="flex justify-between items-center text-xs text-white/40">
                        <span>{content.length} / 3333 characters</span>
                        <TahoeGlassButton
                            onClick={async () => {
                                setSaving(true)
                                await onSave(connection.id, content)
                                setSaving(false)
                            }}
                            disabled={saving}
                            className="px-4 py-2"
                            contentClassName="text-white font-semibold"
                        >
                            {saving ? 'Saving...' : 'Save Notes'}
                        </TahoeGlassButton>
                    </div>
        </TahoeGlassDialog>
    )
}
