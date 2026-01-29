'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import Input from '@/components/ui/Input'
import { Link } from '@/lib/types'

interface Props {
    link: Link
    updateLink: (id: string, field: 'link_name' | 'link_url', value: string) => void
    removeLink: (id: string) => void
}

export function SortableLinkItem({ link, updateLink, removeLink }: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: link.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : 1,
        position: 'relative' as const,
    }

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex flex-col md:flex-row gap-4 items-stretch md:items-center p-4 rounded-xl border transition-colors ${isDragging ? 'bg-white/10 border-white/30 shadow-xl' : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/10'
                }`}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="hidden md:flex items-center justify-center cursor-move text-white/30 hover:text-white/70 transition-colors -ml-2 p-2 touch-none select-none"
            >
                <GripVertical size={20} />
            </div>

            {/* Mobile Drag Handle (Top Center) */}
            <div
                {...attributes}
                {...listeners}
                className="flex md:hidden items-center justify-center cursor-move text-white/30 hover:text-white/70 transition-colors py-1 -mx-4 -mt-4 mb-2 bg-white/5 border-b border-white/5 touch-none select-none"
            >
                <GripVertical size={16} />
            </div>

            <div className="w-full md:flex-1">
                <Input
                    value={link.link_name}
                    onChange={(e) => updateLink(link.id, 'link_name', e.target.value)}
                    placeholder="Link name (e.g. Portfolio)"
                    className="bg-black/20 border-white/10 focus:border-white/30"
                />
            </div>
            <div className="flex w-full md:flex-1 gap-4 items-center">
                {/* Validation Status Indicator */}
                <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                        backgroundColor: link.link_url && link.link_url.startsWith('http')
                            ? 'rgb(34, 197, 94)' // green for valid
                            : 'rgb(239, 68, 68)' // red for invalid/empty
                    }}
                    title={link.link_url && link.link_url.startsWith('http') ? 'Valid URL' : 'Invalid or missing URL'}
                />
                <div className="flex-1 min-w-0">
                    <Input
                        value={link.link_url}
                        onChange={(e) => updateLink(link.id, 'link_url', e.target.value)}
                        placeholder="https://..."
                        className="bg-black/20 border-white/10 focus:border-white/30"
                    />
                </div>
                <button
                    onClick={() => removeLink(link.id)}
                    className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-colors shrink-0 border border-red-500/20"
                >
                    ×
                </button>
            </div>
        </div>
    )
}
