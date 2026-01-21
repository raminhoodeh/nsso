'use client'

import { useState, useEffect } from 'react'
import { MyNssoConnection } from '@/lib/types'
import NetworkTable from './NetworkTable'
import NetworkingTimeline from './NetworkingTimeline'
import GlassCard from '@/components/ui/GlassCard'
import { useToast } from '@/components/ui/Toast'
import { useUI } from '@/components/providers/UIProvider'

export default function MyNssoTab() {
    const { setBackgroundDimmed } = useUI()
    const { showToast } = useToast()
    const [connections, setConnections] = useState<MyNssoConnection[]>([])
    const [loading, setLoading] = useState(true)

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
        loadConnections()
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
                <div className="text-white text-xl text-center">
                    All of you...<br />all in one place
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <GlassCard className="p-6 lg:p-8">
                {/* Header Section */}
                <div className="text-left space-y-2 mb-10 pt-12 md:pt-0">
                    <h2 className="text-3xl font-bold text-white">My nsso Network</h2>
                    <p className="text-white/60 max-w-lg">
                        Your personal timeline of everyone you&apos;ve met.
                        Scan QR codes to build your journey.
                    </p>
                </div>

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

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-lg">
                <GlassCard className="p-6">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-white">
                            Notes for {connection.fullName}
                        </h3>
                        <button onClick={onClose} className="text-white/50 hover:text-white">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        maxLength={3333}
                        rows={8}
                        placeholder="Add notes about your meeting, context, or follow-ups..."
                        className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none custom-scrollbar mb-2"
                    />

                    <div className="flex justify-between items-center text-xs text-white/40">
                        <span>{content.length} / 3333 characters</span>
                        <button
                            onClick={async () => {
                                setSaving(true)
                                await onSave(connection.id, content)
                                setSaving(false)
                            }}
                            disabled={saving}
                            className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors"
                        >
                            {saving ? 'Saving...' : 'Save Notes'}
                        </button>
                    </div>
                </GlassCard>
            </div>
        </div>
    )
}
