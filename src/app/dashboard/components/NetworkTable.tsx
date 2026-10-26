'use client'

import { useRef, useState } from 'react'
import { MyNssoConnection } from '@/lib/types'
import { Search, ChevronDown, ChevronUp, MapPin, NotebookPen } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'
import { TahoeGlassButton, TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface NetworkTableProps {
    connections: MyNssoConnection[]
    onOpenNotes: (connection: MyNssoConnection) => void
    onUpdateConnection: (id: string, data: { notes?: string, location?: string }) => Promise<void>
}

type SortField = 'date' | 'name' | 'location'
type SortOrder = 'asc' | 'desc'

export default function NetworkTable({ connections, onUpdateConnection, onOpenNotes }: NetworkTableProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [sortField, setSortField] = useState<SortField>('date')
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc')

    // Inline Location Editing State
    const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
    const [locationValue, setLocationValue] = useState('')
    const [savingLocation, setSavingLocation] = useState(false)
    const locationPending = useRef(false)

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

    const saveLocation = async (id: string) => {
        if (!editingLocationId || locationPending.current) return
        locationPending.current = true; setSavingLocation(true)
        try {
            await onUpdateConnection(id, { location: locationValue })
            showToast('Location updated', 'success')
            setEditingLocationId(null)
        } catch {
            showToast('Your location could not be saved. Your draft is kept; please retry.', 'error')
        } finally { locationPending.current = false; setSavingLocation(false) }
    }

    // Format Date: "21 Jan 2026"
    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    return (
        <div className="w-full space-y-4">
            {/* Search Bar */}
            <div className="relative">
                <div className="absolute inset-y-0 left-0 z-30 pl-3 flex items-center pointer-events-none text-white/40">
                    <Search size={18} />
                </div>
                <TahoeGlassField label="Search connections" visuallyHideLabel tone="light" surfaceClassName="py-2.5 pl-10 pr-4">
                    <input
                        type="search"
                        placeholder="Search connection..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="text-white text-sm placeholder:text-white/30"
                    />
                </TahoeGlassField>
            </div>

            {/* Table */}
            <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" className="overflow-x-auto">
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
                                            <TahoeGlassField label={`Location for ${conn.fullName}`} visuallyHideLabel tone="light" className="w-[200px]" surfaceClassName="px-2 py-1">
                                                <input
                                                    autoFocus
                                                    maxLength={300}
                                                    disabled={savingLocation}
                                                    type="text"
                                                    value={locationValue}
                                                    onChange={(e) => setLocationValue(e.target.value)}
                                                    onBlur={() => saveLocation(conn.id)}
                                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void saveLocation(conn.id) } if (e.key === 'Escape' && !locationPending.current) setEditingLocationId(null) }}
                                                    className="text-white text-sm"
                                                    placeholder="Where did you meet?"
                                                />
                                            </TahoeGlassField>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={savingLocation}
                                                aria-label={`Edit location for ${conn.fullName}`}
                                                className={`cursor-pointer hover:text-white/80 transition-colors ${!conn.location ? 'text-white/30 italic decoration-dashed underline underline-offset-4 decoration-white/20' : 'text-white/70'}`}
                                                onClick={() => { setEditingLocationId(conn.id); setLocationValue(conn.location || '') }}
                                                title="Edit meeting location"
                                            >
                                                {conn.location || 'Add location...'}
                                            </button>
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
                                    <TahoeGlassButton
                                        onClick={() => onOpenNotes(conn)}
                                        className="p-2"
                                        contentClassName={conn.notes ? 'text-white/80' : 'text-white/40'}
                                        title={conn.notes ? "Edit Notes" : "Add Note"}
                                        aria-label={`${conn.notes ? 'Edit' : 'Add'} notes for ${conn.fullName}`}
                                    >
                                        <NotebookPen size={16} />
                                    </TahoeGlassButton>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </TahoeGlassSurface>

        </div>
    )
}
