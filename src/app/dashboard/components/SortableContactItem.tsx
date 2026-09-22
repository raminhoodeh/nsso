'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import Input from '@/components/ui/Input'
import { Contact, ContactMethod } from '@/lib/types'
import { TahoeGlassButton, TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface Props {
    contact: Contact
    updateContact: (id: string, field: 'value' | 'method' | 'custom_method_name', value: string) => void
    removeContact: (id: string) => void
}

const CONTACT_METHODS: ContactMethod[] = ['Email', 'Phone', 'WhatsApp', 'Telegram', 'Signal', 'WeChat', 'Line', 'Discord', 'X', 'Instagram', 'LinkedIn', 'YouTube', 'TikTok', 'Twitch', 'Facebook', 'Snapchat', 'Pinterest', 'Reddit', 'GitHub', 'GitLab', 'Medium', 'Substack', 'Patreon', 'Ko-fi', 'Buy Me a Coffee', 'PayPal', 'Cash App', 'Venmo', 'Zelle', 'Other'] as ContactMethod[]

export function SortableContactItem({ contact, updateContact, removeContact }: Props) {
    const {
        attributes,
        listeners,
        setNodeRef,
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

    return (
        <TahoeGlassSurface
            ref={setNodeRef}
            style={style}
            variant="card"
            radius={12}
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.38}
            tracking={isDragging ? 'continuous' : 'static'}
            className={isDragging ? 'ring-1 ring-white/30 shadow-xl' : ''}
            contentClassName="flex flex-col items-stretch gap-3 p-3 sm:gap-4 sm:p-4 md:flex-row md:items-center"
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
                className="-mx-3 -mt-3 mb-1 flex min-h-11 cursor-move touch-none select-none items-center justify-center border-b border-white/10 py-1 text-white/30 transition-colors hover:text-white/70 sm:-mx-4 sm:-mt-4 md:hidden"
            >
                <GripVertical size={16} />
            </div>

            <div className="w-full md:w-48 shrink-0">
                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5">
                    <select
                        value={contact.method}
                        onChange={(e) => updateContact(contact.id, 'method', e.target.value)}
                        className="text-white cursor-pointer appearance-none"
                        aria-label="Contact method"
                    >
                        {CONTACT_METHODS.map(method => (
                            <option key={method} value={method} className="bg-neutral-900 text-white">
                                {method}
                            </option>
                        ))}
                    </select>
                </TahoeGlassField>
            </div>

            {contact.method === 'Other' && (
                <div className="w-full md:w-48 shrink-0">
                    <Input
                        value={contact.custom_method_name || ''}
                        onChange={(e) => updateContact(contact.id, 'custom_method_name', e.target.value)}
                        placeholder="Label"
                    />
                </div>
            )}

            <div className="flex-1 min-w-0">
                <Input
                    value={contact.value}
                    onChange={(e) => updateContact(contact.id, 'value', e.target.value)}
                    placeholder={contact.method === 'Email' ? 'you@example.com' : 'Contact details'}
                />
            </div>

            <TahoeGlassButton
                onClick={() => removeContact(contact.id)}
                className="h-11 w-11 shrink-0 p-0"
                contentClassName="text-red-200 text-xl"
                aria-label={`Remove ${contact.method} contact method`}
            >
                ×
            </TahoeGlassButton>
        </TahoeGlassSurface>
    )
}
