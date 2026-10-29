'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import Input from '@/components/ui/Input'
import { Contact } from '@/lib/types'
import { CONTACT_METHODS } from '@/lib/contact-methods'
import { TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { LightIconButton, LightCloseButton } from '@/components/ui/LightButton'
import { useState } from 'react'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'

interface Props {
    contact: Contact
    updateContact: (id: string, field: 'value' | 'method' | 'custom_method_name', value: string) => void
    removeContact: (id: string) => void | Promise<boolean | void>
}

export function SortableContactItem({ contact, updateContact, removeContact }: Props) {
    const [confirmDelete, setConfirmDelete] = useState(false)
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: contact.id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
        zIndex: isDragging ? 10 : 1,
        position: 'relative' as const,
    }

    return (<>
        <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin"
            data-profile-item-id={contact.id}
            ref={setNodeRef}
            style={style}
            variant="card"
            radius={12}
            tone="dark"
            semanticTint="light"
            semanticTintOpacity={0.18}
            tracking={isDragging ? 'continuous' : 'static'}
            className={`nsso-crystal-panel ${isDragging ? 'ring-1 ring-slate-500/30 shadow-xl' : ''}`}
            contentClassName="flex flex-col items-stretch gap-3 p-3 sm:gap-4 sm:p-4"
        >
            <div data-sortable-controls="contact" className="-mx-3 -mt-3 grid grid-cols-[44px_minmax(0,1fr)_44px] items-center border-b border-slate-500/15 px-2 py-1 sm:-mx-4 sm:-mt-4">
                <LightIconButton
                    ref={setActivatorNodeRef}
                    type="button"
                    {...attributes}
                    {...listeners}
                    aria-label={`Drag to reorder ${contact.method} contact method`}
                    className="col-start-2 justify-self-center cursor-grab touch-none select-none active:cursor-grabbing"
                >
                    <GripVertical size={20} aria-hidden="true" />
                </LightIconButton>
                <LightCloseButton
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="col-start-3"
                    aria-label={`Remove ${contact.method} contact method`}
                />
            </div>

            <div className="flex min-w-0 flex-col gap-3 sm:gap-4 md:flex-row md:flex-wrap md:items-center">
            <div className="w-full md:w-48 shrink-0">
                <TahoeGlassField tone="dark" surfaceClassName="px-3 py-2.5">
                    <select
                        value={contact.method}
                        onChange={(e) => updateContact(contact.id, 'method', e.target.value)}
                        className="text-slate-950 cursor-pointer appearance-none"
                        aria-label="Contact method"
                    >
                        {CONTACT_METHODS.map(method => (
                            <option key={method} value={method} className="bg-white text-slate-950">
                                {method}
                            </option>
                        ))}
                    </select>
                </TahoeGlassField>
            </div>

            {contact.method === 'Other' && (
                <div className="w-full md:w-48 shrink-0">
                    <Input
                        aria-label="Custom contact method name"
                        value={contact.custom_method_name || ''}
                        onChange={(e) => updateContact(contact.id, 'custom_method_name', e.target.value)}
                        placeholder="Label"
                    />
                </div>
            )}

            <div className="flex-1 min-w-0">
                <Input
                    aria-label={`${contact.method} contact details`}
                    value={contact.value}
                    onChange={(e) => updateContact(contact.id, 'value', e.target.value)}
                    placeholder={contact.method === 'Email' ? 'you@example.com' : 'Contact details'}
                />
            </div>

            </div>
        </TahoeGlassSurface>
        <ConfirmDeleteDialog open={confirmDelete} name={`${contact.method} contact method`} onClose={() => setConfirmDelete(false)} onConfirm={() => removeContact(contact.id)} />
        </>
    )
}
