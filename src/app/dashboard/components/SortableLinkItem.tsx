'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import Input from '@/components/ui/Input'
import { Link } from '@/lib/types'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { LightIconButton, LightCloseButton } from '@/components/ui/LightButton'
import { safeWebUrl } from '@/lib/urls'
import { useState } from 'react'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'

interface Props {
    link: Link
    updateLink: (id: string, field: 'link_name' | 'link_url', value: string) => void
    removeLink: (id: string) => void | Promise<boolean | void>
}

export function SortableLinkItem({ link, updateLink, removeLink }: Props) {
    const [confirmDelete, setConfirmDelete] = useState(false)
    const validUrl = Boolean(safeWebUrl(link.link_url))
    const urlStatus = validUrl ? 'Valid URL format; destination not checked' : link.link_url ? 'Invalid URL format' : 'Missing URL'
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
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

    return (<>
        <TahoeGlassSurface
            data-profile-item-id={link.id}
            ref={setNodeRef}
            style={style}
            variant="card"
            radius={12}
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.38}
            tracking={isDragging ? 'continuous' : 'static'}
            className={isDragging ? 'ring-1 ring-white/30 shadow-xl' : ''}
            contentClassName="flex flex-col items-stretch gap-3 p-3 sm:gap-4 sm:p-4"
        >
            <div data-sortable-controls="link" className="-mx-3 -mt-3 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center border-b border-white/10 px-2 py-1 sm:-mx-4 sm:-mt-4">
                <LightIconButton
                    ref={setActivatorNodeRef}
                    type="button"
                    {...attributes}
                    {...listeners}
                    aria-label={`Drag to reorder ${link.link_name || 'link'}`}
                    className="col-start-2 justify-self-center cursor-grab touch-none select-none active:cursor-grabbing"
                >
                    <GripVertical size={20} aria-hidden="true" />
                </LightIconButton>
                <LightCloseButton
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="col-start-3"
                    aria-label={`Remove ${link.link_name || 'link'}`}
                />
            </div>

            <div className="grid min-w-0 grid-cols-1 items-center gap-3 sm:gap-4 md:grid-cols-2">
            <div className="min-w-0">
                <Input
                    aria-label="Link name"
                    value={link.link_name}
                    onChange={(e) => updateLink(link.id, 'link_name', e.target.value)}
                    placeholder="Link name (e.g. Portfolio)"
                />
            </div>
            <div className="flex w-full items-center gap-2 sm:gap-4 md:flex-1">
                {/* Validation Status Indicator */}
                <div
                    role="img"
                    aria-label={urlStatus}
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{
                        backgroundColor: validUrl
                            ? 'rgb(34, 197, 94)' // green for valid
                            : 'rgb(239, 68, 68)' // red for invalid/empty
                    }}
                    title={urlStatus}
                />
                <div className="flex-1 min-w-0">
                    <Input
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        spellCheck={false}
                        aria-label="Link URL"
                        value={link.link_url}
                        onChange={(e) => updateLink(link.id, 'link_url', e.target.value)}
                        placeholder="https://..."
                    />
                </div>
            </div>
            </div>
        </TahoeGlassSurface>
        <ConfirmDeleteDialog open={confirmDelete} name={link.link_name || 'link'} onClose={() => setConfirmDelete(false)} onConfirm={() => removeLink(link.id)} />
        </>
    )
}
