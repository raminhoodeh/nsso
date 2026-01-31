'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import Input from '@/components/ui/Input'
import { Contact, ContactMethod } from '@/lib/types'

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

            <div className="w-full md:w-48 shrink-0">
                <select
                    value={contact.method}
                    onChange={(e) => updateContact(contact.id, 'method', e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-white/30 cursor-pointer appearance-none"
                    style={{ backgroundImage: 'none' }} // Remove default arrow to style it better if needed, or keep default
                >
                    {CONTACT_METHODS.map(method => (
                        <option key={method} value={method} className="bg-neutral-900 text-white">
                            {method}
                        </option>
                    ))}
                </select>
            </div>

            {contact.method === 'Other' && (
                <div className="w-full md:w-48 shrink-0">
                    <Input
                        value={contact.custom_method_name || ''}
                        onChange={(e) => updateContact(contact.id, 'custom_method_name', e.target.value)}
                        placeholder="Label"
                        className="bg-black/20 border-white/10 focus:border-white/30"
                    />
                </div>
            )}

            <div className="flex-1 min-w-0">
                <Input
                    value={contact.value}
                    onChange={(e) => updateContact(contact.id, 'value', e.target.value)}
                    placeholder={contact.method === 'Email' ? 'you@example.com' : 'Contact details'}
                    className="bg-black/20 border-white/10 focus:border-white/30"
                />
            </div>

            <button
                onClick={() => removeContact(contact.id)}
                className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-colors shrink-0 border border-red-500/20"
            >
                ×
            </button>
        </div>
    )
}
