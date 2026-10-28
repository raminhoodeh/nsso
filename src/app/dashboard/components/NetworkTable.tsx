'use client'

import { useRef, useState } from 'react'
import { MyNssoConnection } from '@/lib/types'
import { Search, MapPin, NotebookPen } from 'lucide-react'
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
    const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
    const [locationValue, setLocationValue] = useState('')
    const [savingLocation, setSavingLocation] = useState(false)
    const [locationError, setLocationError] = useState('')
    const locationPending = useRef(false)
    const { showToast } = useToast()

    const filteredConnections = connections.filter(conn => {
        const query = searchQuery.trim().toLowerCase()
        return [conn.fullName, conn.username, conn.location].some(value => value?.toLowerCase().includes(query))
    }).sort((a, b) => {
        const value = (row: MyNssoConnection) => sortField === 'date'
            ? new Date(row.dateMet).getTime() || 0
            : (sortField === 'name' ? row.fullName : row.location || '').toLowerCase()
        const first = value(a), second = value(b)
        return (first < second ? -1 : first > second ? 1 : 0) * (sortOrder === 'asc' ? 1 : -1)
    })

    async function saveLocation(id: string) {
        if (locationPending.current) return
        locationPending.current = true
        setSavingLocation(true)
        setLocationError('')
        try {
            await onUpdateConnection(id, { location: locationValue.trim() })
            showToast('Location updated', 'success')
            setEditingLocationId(null)
        } catch {
            setLocationError('Your location could not be saved. Your draft is kept; please retry.')
        } finally {
            locationPending.current = false
            setSavingLocation(false)
        }
    }

    const formatDate = (date: string) => Number.isNaN(new Date(date).getTime()) ? 'Date not recorded' : new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

    return <div className="w-full min-w-0 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="relative flex-1">
                <Search aria-hidden="true" size={18} className="pointer-events-none absolute left-3 top-1/2 z-30 -translate-y-1/2 text-white/70" />
                <TahoeGlassField label="Search connections" visuallyHideLabel tone="light" surfaceClassName="min-h-11 py-2.5 pl-10 pr-4">
                    <input type="search" placeholder="Search people or meeting locations" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} className="text-base text-white placeholder:text-white/60" />
                </TahoeGlassField>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:w-[320px]">
                <TahoeGlassField label="Sort connections" tone="light" surfaceClassName="min-h-11 px-3 py-2.5">
                    <select aria-label="Sort connections" value={sortField} onChange={event => setSortField(event.target.value as SortField)} className="text-base text-white">
                        <option value="date" className="bg-neutral-900">Date met</option>
                        <option value="name" className="bg-neutral-900">Name</option>
                        <option value="location" className="bg-neutral-900">Location</option>
                    </select>
                </TahoeGlassField>
                <TahoeGlassButton tone="light" className="min-h-11 self-end px-3 py-2" onClick={() => setSortOrder(current => current === 'asc' ? 'desc' : 'asc')} aria-label={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`} contentClassName="text-sm text-white">
                    {sortField === 'date' ? (sortOrder === 'desc' ? 'Newest first ↓' : 'Oldest first ↑') : (sortOrder === 'asc' ? 'A–Z ↑' : 'Z–A ↓')}
                </TahoeGlassButton>
            </div>
        </div>
        <p role="status" className="text-sm text-white/70">{filteredConnections.length} {filteredConnections.length === 1 ? 'connection' : 'connections'}{searchQuery.trim() ? ' found' : ''}</p>
        {filteredConnections.length === 0 ? <div className="rounded-2xl border border-white/15 bg-black/20 p-5 text-white/80">
            <p>{connections.length ? 'No connections match your search.' : 'No connections yet.'}</p>
            {searchQuery && <TahoeGlassButton type="button" tone="light" className="mt-2 min-h-11 px-3 py-2" contentClassName="text-sm text-white" onClick={() => setSearchQuery('')}>Clear search</TahoeGlassButton>}
        </div> : <>
            <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_144px] gap-4 px-4 text-xs font-semibold uppercase tracking-wider text-white/70 md:grid"><span>Person</span><span>Meeting location</span><span>Date met</span><span>Notes</span></div>
            <ul className="space-y-3" aria-label="Your connections">
                {filteredConnections.map(conn => <li key={conn.id}>
                    <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" contentClassName="grid min-w-0 gap-4 p-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_144px] md:items-center">
                        <Link href={`/${conn.username}`} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/15 font-semibold text-white ring-1 ring-white/20">
                                {conn.profilePicUrl ? <img src={conn.profilePicUrl} alt="" className="h-full w-full object-cover" /> : conn.fullName.slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0"><span className="block break-words font-semibold text-white">{conn.fullName}</span><span className="block break-all text-sm text-white/70">nsso.me/{conn.username}</span></span>
                        </Link>
                        <div className="min-w-0">
                            <p className="mb-1 text-xs font-semibold text-white/70 md:sr-only">Meeting location</p>
                            {editingLocationId === conn.id ? <form onSubmit={event => { event.preventDefault(); void saveLocation(conn.id) }} className="space-y-2">
                                <TahoeGlassField label={`Location for ${conn.fullName}`} visuallyHideLabel tone="light" surfaceClassName="px-3 py-2">
                                    <input autoFocus type="text" maxLength={300} disabled={savingLocation} value={locationValue} onChange={event => setLocationValue(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && !locationPending.current) setEditingLocationId(null) }} placeholder="Where did you meet?" className="text-base text-white placeholder:text-white/60" />
                                </TahoeGlassField>
                                {locationError && <p role="alert" className="text-sm text-rose-200">{locationError}</p>}
                                <div className="flex flex-wrap gap-2"><TahoeGlassButton type="submit" disabled={savingLocation} className="min-h-11 px-3 py-2">{savingLocation ? 'Saving…' : 'Save location'}</TahoeGlassButton><TahoeGlassButton disabled={savingLocation} className="min-h-11 px-3 py-2" onClick={() => setEditingLocationId(null)}>Cancel</TahoeGlassButton></div>
                            </form> : <button type="button" disabled={savingLocation} aria-label={`Edit location for ${conn.fullName}`} className="flex min-h-11 w-full items-center gap-2 rounded-lg text-left text-sm text-white/85 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white" onClick={() => { setEditingLocationId(conn.id); setLocationValue(conn.location || ''); setLocationError('') }}><MapPin aria-hidden="true" size={16} className="shrink-0" /><span className="break-words">{conn.location || 'Add meeting location'}</span></button>}
                        </div>
                        <div><p className="text-xs font-semibold text-white/70 md:sr-only">Date met</p><time dateTime={conn.dateMet} className="text-sm text-white/85">{formatDate(conn.dateMet)}</time></div>
                        <TahoeGlassButton type="button" tone="light" onClick={() => onOpenNotes(conn)} className="h-11 min-h-11 w-36 max-w-full shrink-0 justify-self-start px-4 py-0" contentClassName="gap-2 whitespace-nowrap text-sm leading-5 text-white" aria-label={`${conn.notes ? 'Edit' : 'Add'} notes for ${conn.fullName}`}><NotebookPen aria-hidden="true" size={18} className="shrink-0" /><span className="whitespace-nowrap">{conn.notes ? 'Edit notes' : 'Add notes'}</span></TahoeGlassButton>
                    </TahoeGlassSurface>
                </li>)}
            </ul>
        </>}
    </div>
}
