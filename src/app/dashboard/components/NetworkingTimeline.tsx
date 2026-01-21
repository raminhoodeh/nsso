'use client'

import { MyNssoConnection } from '@/lib/types'
import { MapPin, Calendar, Clock, NotebookPen } from 'lucide-react'
import Link from 'next/link'
import GlassCard from '@/components/ui/GlassCard'

interface NetworkingTimelineProps {
    connections: MyNssoConnection[]
    onOpenNotes: (conn: MyNssoConnection) => void
}

export default function NetworkingTimeline({ connections, onOpenNotes }: NetworkingTimelineProps) {
    if (connections.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-70">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6">
                    <Clock className="text-white/40" size={32} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Your timeline starts here</h3>
                <p className="text-white/50 max-w-sm">
                    Scan a QR code to make your first memory. Your journey will appear here chronologically.
                </p>
            </div>
        )
    }

    // Group connections by Month Year
    const groupedConnections = connections.reduce((groups, conn) => {
        const date = new Date(conn.dateMet)
        const key = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

        if (!groups[key]) {
            groups[key] = []
        }
        groups[key].push(conn)
        return groups
    }, {} as Record<string, MyNssoConnection[]>)

    // Sort sorted keys DESC (newest month first)
    // Note: connections are already sorted DESC from API usually, but safe to enforce
    // We rely on the input order mostly, but let's just iterate keys in order they appear 
    // (JavaScript object keys order isn't guaranteed but usually insertion order for strings)
    // Better to create an array of entries
    const sortedGroups = Object.entries(groupedConnections).sort((a, b) => {
        // Parse date from "Month Year" string to sort
        const dateA = new Date(a[0])
        const dateB = new Date(b[0])
        return dateB.getTime() - dateA.getTime()
    })

    return (
        <div className="relative pl-8 md:pl-0">
            {/* The Timeline Line (Vertical) */}
            <div className="absolute left-[3px] md:left-1/2 top-4 bottom-0 w-[2px] bg-gradient-to-b from-white/20 via-white/10 to-transparent transform md:-translate-x-1/2" />

            <div className="space-y-12">
                {sortedGroups.map(([month, groupConns]) => (
                    <div key={month} className="relative">
                        {/* Month Header */}
                        <div className="flex justify-center mb-8 relative z-10">
                            <span className="px-4 py-1.5 rounded-full bg-black/40 border border-white/10 text-xs font-bold uppercase tracking-widest text-white/70 backdrop-blur-md">
                                {month}
                            </span>
                        </div>

                        {/* Cards */}
                        <div className="space-y-8">
                            {groupConns.map((conn, index) => {
                                // Alternating Layout for Desktop
                                // Even Index: Right side
                                // Odd Index: Left side
                                // Mobile: Always Right/Indent
                                const isRight = index % 2 === 0 // Change to suit preference

                                return (
                                    <div key={conn.id} className="relative md:flex md:items-center md:justify-between group">

                                        {/* Timeline Dot */}
                                        <div className="absolute left-[-29px] md:left-1/2 md:top-1/2 w-[10px] h-[10px] rounded-full bg-white border-2 border-[#1a1a1a] shadow-[0_0_0_4px_rgba(255,255,255,0.1)] transform md:-translate-x-1/2 md:-translate-y-1/2 z-20 group-hover:scale-125 transition-transform duration-300" />

                                        {/* Connector Line (Mobile Only - Horizontal small dash) */}
                                        <div className="absolute left-[-19px] top-4 w-4 h-[2px] bg-white/20 md:hidden" />

                                        {/* Card Container - Left Side */}
                                        <div className={`md:w-[45%] ${isRight ? 'md:order-2 md:ml-auto' : 'md:order-1 md:mr-auto'}`}>
                                            <GlassCard className="p-5 hover:bg-white/10 transition-colors duration-300 relative overflow-hidden group/card">

                                                {/* Header: Contextual Stamp */}
                                                <div className="flex items-center gap-2 text-[11px] font-bold text-white/40 uppercase tracking-wider mb-3">
                                                    <div className="flex items-center gap-1">
                                                        <Calendar size={10} />
                                                        {new Date(conn.dateMet).getDate()} {month.split(' ')[0]}
                                                    </div>
                                                    <span className="w-0.5 h-0.5 rounded-full bg-white/30" />
                                                    <div className="flex items-center gap-1">
                                                        <Clock size={10} />
                                                        {new Date(conn.dateMet).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                    {conn.location && (
                                                        <>
                                                            <span className="w-0.5 h-0.5 rounded-full bg-white/30" />
                                                            <div className="flex items-center gap-1 text-white/60">
                                                                <MapPin size={10} />
                                                                {conn.location}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>

                                                {/* Body: Profile */}
                                                <div className="flex items-start gap-4">
                                                    <Link href={`/${conn.username}`} className="shrink-0">
                                                        <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden ring-2 ring-white/10 group-hover/card:ring-white/30 transition-all">
                                                            {conn.profilePicUrl ? (
                                                                <img src={conn.profilePicUrl} alt={conn.fullName} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-white/40 font-bold">
                                                                    {conn.fullName.substring(0, 2).toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </Link>

                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex justify-between items-start">
                                                            <Link href={`/${conn.username}`}>
                                                                <h4 className="text-white font-bold text-lg leading-tight hover:underline bg-clip-text truncate pr-2">
                                                                    {conn.fullName}
                                                                </h4>
                                                            </Link>

                                                            {/* Add Note Mini Button */}
                                                            <button
                                                                onClick={() => onOpenNotes(conn)}
                                                                className={`p-1.5 rounded-md transition-colors ${conn.notes ? 'text-white bg-white/10' : 'text-white/30 hover:text-white hover:bg-white/10'}`}
                                                                title="Notes"
                                                            >
                                                                <NotebookPen size={14} />
                                                            </button>
                                                        </div>

                                                        {conn.headline && (
                                                            <p className="text-white/50 text-xs mb-2 truncate">
                                                                {conn.headline}
                                                            </p>
                                                        )}

                                                        {/* Note Snippet */}
                                                        {conn.notes ? (
                                                            <div className="mt-3 p-2.5 rounded-lg bg-black/20 text-xs text-white/70 italic border-l-2 border-white/20 line-clamp-2">
                                                                &quot;{conn.notes}&quot;
                                                            </div>
                                                        ) : (
                                                            <div className="mt-2 text-[11px] text-white/20 italic group-hover/card:text-white/40 transition-colors">
                                                                No notes added yet
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </GlassCard>
                                        </div>

                                        {/* Empty Spacer - Right Side (inverse of above logic basically handled by flex ordering and widths) */}
                                        {/* <div className="hidden md:block md:w-[45%]" /> */}
                                        {/* Standard flex logic above with margins handles the spacer effect beautifully */}

                                    </div>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
