'use client'

import { useState, useRef, useEffect } from 'react'
import { MyNssoConnection } from '@/lib/types'
import { Search, ChevronDown, ChevronUp, MapPin, NotebookPen, ExternalLink } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import ShinyLink from '@/components/ui/ShinyLink'
import Link from 'next/link'

interface NetworkTableProps {
    connections: MyNssoConnection[]
    onUpdateConnection: (id: string, data: { notes?: string, location?: string }) => Promise<void>
}

type SortField = 'date' | 'name' | 'location'
type SortOrder = 'asc' | 'desc'

export default function NetworkTable({ connections, onUpdateConnection }: NetworkTableProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [sortField, setSortField] = useState<SortField>('date')
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

    // Notes Modal State
    const [isNotesOpen, setIsNotesOpen] = useState(false)
    const [selectedConnection, setSelectedConnection] = useState<MyNssoConnection | null>(null)
    const [noteContent, setNoteContent] = useState('')
    const [savingNote, setSavingNote] = useState(false)

    // Inline Location Editing State
    const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
    const [locationValue, setLocationValue] = useState('')

    const { showToast } = useToast()

    // Filter and Sort
    const filteredConnections = connections.filter(conn => {
        const query = searchQuery.toLowerCase()
        return (
            conn.fullName.toLowerCase().includes(query) ||
            conn.username.toLowerCase().includes(query) ||
            (conn.location && conn.location.toLowerCase().includes(query))
        )
    }).sort((a, b) => {
        let valA: string | number = ''
        let valB: string | number = ''

        if (sortField === 'date') {
            valA = new Date(a.dateMet).getTime()
            valB = new Date(b.dateMet).getTime()
        } else if (sortField === 'name') {
            valA = a.fullName.toLowerCase()
            valB = b.fullName.toLowerCase()
        } else if (sortField === 'location') {
            valA = (a.location || '').toLowerCase()
            valB = (b.location || '').toLowerCase()
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1
        return 0
    })

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortOrder('asc') // Default to asc for new field (except date maybe?)
        }
    }

    const openNotes = (conn: MyNssoConnection) => {
        setSelectedConnection(conn)
        setNoteContent(conn.notes || '')
        setIsNotesOpen(true)
    }

    const saveNotes = async () => {
        if (!selectedConnection) return
        setSavingNote(true)
        try {
            await onUpdateConnection(selectedConnection.id, { notes: noteContent })
            showToast('Notes saved', 'success')
            setIsNotesOpen(false)
        } catch (error) {
            showToast('Failed to save notes', 'error')
        }
        setSavingNote(false)
    }

    const saveLocation = async (id: string) => {
        if (!editingLocationId) return
        try {
            await onUpdateConnection(id, { location: locationValue })
            showToast('Location updated', 'success')
            setEditingLocationId(null)
        } catch (error) {
            showToast('Failed to update location', 'error')
        }
    }

    // Format Date: "21 Jan 2026"
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    // Sort Icon
    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <div className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-30 transition-opacity" />
        return sortOrder === 'asc' ? <ChevronUp size={14} className="ml-1" /> : <ChevronDown size={14} className="ml-1" />
    }

    return (
        <div className="w-full space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-white/40">
                    <Search size={18} />
                </div>
                <input
                    type="text"
                    placeholder="Search connection..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-white text-sm focus:outline-none focus:bg-white/10 transition-colors placeholder:text-white/30"
                />
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-white/10 bg-white/5">
                            {/* User Column */}
                            <th
                                className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider cursor-pointer group hover:bg-white/5 transition-colors"
                                onClick={() => handleSort('name')}
                            >
                                <div className="flex items-center">
                                    User
                                    <div className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-30 transition-opacity">
                                        {sortField === 'name' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                    </div>
                                </div>
                            </th>

                            {/* Location */}
                            <th
                                className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider cursor-pointer group hover:bg-white/5 transition-colors"
                                onClick={() => handleSort('location')}
                            >
                                <div className="flex items-center">
                                    Location
                                    <div className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-30 transition-opacity">
                                        {sortField === 'location' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                    </div>
                                </div>
                            </th>

                            {/* Date Met */}
                            <th
                                className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider cursor-pointer group hover:bg-white/5 transition-colors"
                                onClick={() => handleSort('date')}
                            >
                                <div className="flex items-center">
                                    Date Met
                                    <div className="w-4 h-4 ml-1 opacity-0 group-hover:opacity-30 transition-opacity">
                                        {sortField === 'date' && (sortOrder === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />)}
                                    </div>
                                </div>
                            </th>

                            {/* Notes */}
                            <th className="p-4 text-xs font-semibold text-white/60 uppercase tracking-wider w-[100px]">
                                Notes
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredConnections.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-8 text-center text-white/40">
                                    No connections found.
                                </td>
                            </tr>
                        ) : filteredConnections.map((conn) => (
                            <tr key={conn.id} className="hover:bg-white/5 transition-colors group">
                                {/* Name/User */}
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <Link href={`/${conn.username}`} className="flex-shrink-0">
                                            <div className="w-10 h-10 rounded-full bg-white/10 overflow-hidden ring-1 ring-white/20">
                                                {conn.profilePicUrl ? (
                                                    <img src={conn.profilePicUrl} alt={conn.fullName} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-white/40 text-xs font-bold">
                                                        {conn.fullName.substring(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>
                                        </Link>
                                        <div className="min-w-0">
                                            <Link href={`/${conn.username}`}>
                                                <div className="text-white font-medium hover:underline truncate bg-clip-text">
                                                    {conn.fullName}
                                                </div>
                                            </Link>
                                            <div className="text-white/40 text-xs truncate">nsso.me/{conn.username}</div>
                                        </div>
                                    </div>
                                </td>

                                {/* Location */}
                                <td className="p-4">
                                    <div className="flex items-center gap-1.5 text-sm">
                                        <MapPin size={12} className="text-white/40 flex-shrink-0" />
                                        {editingLocationId === conn.id ? (
                                            <input
                                                autoFocus
                                                type="text"
                                                value={locationValue}
                                                onChange={(e) => setLocationValue(e.target.value)}
                                                onBlur={() => saveLocation(conn.id)}
                                                onKeyDown={(e) => e.key === 'Enter' && saveLocation(conn.id)}
                                                className="bg-black/20 text-white rounded px-2 py-0.5 text-sm w-[200px] outline-none border border-white/20"
                                                placeholder="Where did you meet?"
                                            />
                                        ) : (
                                            <span
                                                className={`cursor-pointer hover:text-white/80 transition-colors ${!conn.location ? 'text-white/30 italic decoration-dashed underline underline-offset-4 decoration-white/20' : 'text-white/70'}`}
                                                onClick={() => !conn.location && (() => { setEditingLocationId(conn.id); setLocationValue(''); })()}
                                                title={!conn.location ? "Click to add location" : ""}
                                            >
                                                {conn.location || 'Add location...'}
                                            </span>
                                        )}
                                    </div>
                                </td>

                                {/* Date Met */}
                                <td className="p-4">
                                    <div className="text-sm text-white/60">
                                        {formatDate(conn.dateMet)}
                                    </div>
                                </td>

                                {/* Notes Button */}
                                <td className="p-4">
                                    <button
                                        onClick={() => openNotes(conn)}
                                        className={`p-2 rounded-lg transition-colors ${conn.notes ? 'text-white/80 hover:bg-white/10 bg-white/5' : 'text-white/30 hover:bg-white/5 hover:text-white/50'}`}
                                        title={conn.notes ? "Edit Notes" : "Add Note"}
                                    >
                                        <NotebookPen size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Notes Modal */}
            {isNotesOpen && selectedConnection && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsNotesOpen(false)} />
                    <div className="relative z-10 w-full max-w-lg">
                        <GlassCard className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold text-white">
                                    Notes for {selectedConnection.fullName}
                                </h3>
                                <button onClick={() => setIsNotesOpen(false)} className="text-white/50 hover:text-white">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            <textarea
                                value={noteContent}
                                onChange={(e) => setNoteContent(e.target.value)}
                                maxLength={3333}
                                rows={8}
                                placeholder="Add notes about your meeting, context, or follow-ups..."
                                className="w-full bg-black/20 border border-white/10 rounded-xl p-4 text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 resize-none custom-scrollbar mb-2"
                            />

                            <div className="flex justify-between items-center text-xs text-white/40">
                                <span>{noteContent.length} / 3333 characters</span>
                                <button
                                    onClick={saveNotes}
                                    disabled={savingNote}
                                    className="px-4 py-2 bg-white text-black font-semibold rounded-lg hover:bg-white/90 disabled:opacity-50 transition-colors"
                                >
                                    {savingNote ? 'Saving...' : 'Save Notes'}
                                </button>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            )}
        </div>
    )
}
