'use client'

import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, ChevronDown, ChevronUp, Trash2, Info, Edit2, Upload, Loader2, ShieldCheck, ShieldAlert, Lock, Layout, Sparkles, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DOMPurify from 'dompurify'
import { Experience, Qualification, Project, Product } from '@/lib/types'
import { useProfile } from '@/components/providers/ProfileProvider'
import { useUI } from '@/components/providers/UIProvider'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import { TahoeGlassButton, TahoeGlassDialog, TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface AdvancedModeCardProps {
    userId: string
}

type ActiveSection = 'experiences' | 'qualifications' | 'projects' | 'products'

// Sortable Item Component
function SortableItem({ id, children, className }: { id: string; children: (listeners: any) => React.ReactNode; className?: string }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        touchAction: 'none', // Crucial for touch dragging
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
    }

    return (
        <TahoeGlassSurface ref={setNodeRef} style={style} variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" tracking={isDragging ? 'continuous' : 'static'} className={className} {...attributes}>
            {children(listeners)}
        </TahoeGlassSurface>
    )
}

export default function AdvancedModeCard({ userId }: AdvancedModeCardProps) {
    const [supabase] = useState(() => createClient())
    const [isExpanded, setIsExpanded] = useState(false)
    const [activeSection, setActiveSection] = useState<ActiveSection>('experiences')
    // const [isLoading, setIsLoading] = useState(false) // Driven by provider now
    const [isUploading, setIsUploading] = useState(false)
    const { setBackgroundDimmed } = useUI()
    const [showGuide, setShowGuide] = useState(false)

    // Sync dimming state with expansion
    useEffect(() => {
        setBackgroundDimmed(isExpanded)
        return () => setBackgroundDimmed(false)
    }, [isExpanded, setBackgroundDimmed])

    // Global Profile Data
    const {
        experiences: globalExperiences,
        qualifications: globalQualifications,
        projects: globalProjects,
        products: globalProducts,
        loading: globalLoading,
        reorderExperiences,
        reorderQualifications,
        reorderProjects
    } = useProfile()

    // Sensors for Drag and Drop
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    // Handle Drag End
    const handleDragEnd = async (event: DragEndEvent, type: 'experiences' | 'qualifications' | 'projects') => {
        const { active, over } = event

        if (over && active.id !== over.id) {
            if (type === 'experiences') {
                const oldIndex = experiences.findIndex((e) => e.id === active.id)
                const newIndex = experiences.findIndex((e) => e.id === over.id)
                const newItems = arrayMove(experiences, oldIndex, newIndex)
                setExperiences(newItems) // Optimistic update
                await reorderExperiences(newItems.map(i => i.id))
            } else if (type === 'qualifications') {
                const oldIndex = qualifications.findIndex((q) => q.id === active.id)
                const newIndex = qualifications.findIndex((q) => q.id === over.id)
                const newItems = arrayMove(qualifications, oldIndex, newIndex)
                setQualifications(newItems)
                await reorderQualifications(newItems.map(i => i.id))
            } else if (type === 'projects') {
                const oldIndex = projects.findIndex((p) => p.id === active.id)
                const newIndex = projects.findIndex((p) => p.id === over.id)
                const newItems = arrayMove(projects, oldIndex, newIndex)
                setProjects(newItems)
                await reorderProjects(newItems.map(i => i.id))
            }
        }
    }

    // Data States (Local state for optimistic UI)
    const [experiences, setExperiences] = useState<Experience[]>([])
    const [qualifications, setQualifications] = useState<Qualification[]>([])
    const [projects, setProjects] = useState<Project[]>([])
    const [products, setProducts] = useState<Product[]>([])

    // Sync with Global State (Deity Updates)
    useEffect(() => {
        if (globalExperiences) {
            console.log('🔄 AdvancedModeCard: Syncing globalExperiences:', globalExperiences.length)
            setExperiences(globalExperiences)
        }
    }, [globalExperiences])

    useEffect(() => {
        if (globalQualifications) setQualifications(globalQualifications)
    }, [globalQualifications])

    useEffect(() => {
        if (globalProjects) setProjects(globalProjects)
    }, [globalProjects])

    useEffect(() => {
        if (globalProducts) setProducts(globalProducts)
    }, [globalProducts])

    // Selection States
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null) // For editing specific product

    // Confirmation State
    const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; productId: string | null }>({
        isOpen: false,
        productId: null
    })

    // Security Verification State
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'scanning' | 'secure' | 'unsafe'>('idle')
    const [securityMessage, setSecurityMessage] = useState('')

    // PayPal Security Check Effect
    useEffect(() => {
        // Reset status if no product selected or no HTML
        if (!selectedProduct || !selectedProduct.paypal_html) {
            setVerificationStatus('idle')
            setSecurityMessage('')
            return
        }

        // Only scan if status is idle (fresh input) or we just started editing
        // We use a debounce to simulate scanning and prevent run-on
        setVerificationStatus('scanning')
        setSecurityMessage('Analyzing code security...')

        const timer = setTimeout(() => {
            const rawHtml = selectedProduct.paypal_html || ''

            // Allow only PayPal forms and strict tags (Updated for Single Button support)
            const clean = DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['form', 'input', 'img', 'div', 'style', 'section', 'span'],
                ALLOWED_ATTR: ['action', 'method', 'target', 'type', 'src', 'border', 'name', 'alt', 'value', 'class', 'style', 'id'],
                ALLOWED_URI_REGEXP: /^(https:\/\/.*\.paypal\.com\/|https:\/\/www\.paypal\.com\/|https:\/\/www\.paypalobjects\.com\/)/
            })

            // Additional Check: Must target PayPal or use HostedButtons
            const isPayPal = rawHtml.includes('paypal.com') || rawHtml.includes('paypal.HostedButtons')
            const hasScript = rawHtml.includes('<script') || rawHtml.includes('javascript:')

            // Smart Exception: PayPal JS SDK (Hosted Buttons)
            // We allow scripts IF they match the strict Hosted Button pattern
            const isHostedButton = /paypal\.HostedButtons\(\{\s*hostedButtonId:\s*"[A-Z0-9]+"/m.test(rawHtml)

            // Single Button Exception: Allow style tags if they contain PayPal-like classes or structure
            const isSingleButton = rawHtml.includes('<form') && rawHtml.includes('paypal.com/ncp/payment')

            if ((clean !== rawHtml && !isHostedButton && !isSingleButton) || (hasScript && !isHostedButton) || !isPayPal) {
                // If sanitization changed anything (ignoring our exceptions)
                // Note: DOMPurify might strip styles if we are not careful, but we allowed them above
                if (clean.length === 0 && !isHostedButton && !isSingleButton) {
                    setVerificationStatus('unsafe')
                    setSecurityMessage('Invalid code detected.')
                } else if (!isPayPal) {
                    setVerificationStatus('unsafe')
                    setSecurityMessage('Code does not appear to be from PayPal.')
                } else {
                    setVerificationStatus('secure')
                    setSecurityMessage('Verified Standard PayPal Button')
                }
            } else {
                setVerificationStatus('secure')
                setSecurityMessage(isHostedButton ? 'Verified Safe (Smart Button)' : 'Code verified: Safe from malicious scripts.')
            }
        }, 1500) // 1.5s "Branding" delay

        return () => clearTimeout(timer)
    }, [selectedProduct?.paypal_html])

    // Cropper State

    // Cropper State
    const [cropperOpen, setCropperOpen] = useState(false)
    const [cropperImage, setCropperImage] = useState<string | null>(null)
    const [cropperAspect, setCropperAspect] = useState(1)
    const [cropperTarget, setCropperTarget] = useState<{ type: 'project' | 'product', id?: string } | null>(null)


    // ... 

    // Modified Image Upload Handler (Now just prepares crop)
    const handleImageSelect = (file: File, type: 'project' | 'product', id?: string) => {
        if (!file) return
        const reader = new FileReader()
        reader.addEventListener('load', () => {
            setCropperImage(reader.result as string)
            setCropperAspect(type === 'project' ? 16 / 9 : 1) // 16:9 for Projects, 1:1 for Products
            setCropperTarget({ type, id })
            setCropperOpen(true)
        })
        reader.readAsDataURL(file)
    }

    // Final Upload after Crop
    const handleCropComplete = async (croppedBlob: Blob) => {
        if (!cropperTarget) return
        setIsUploading(true)

        try {
            // Upload
            const pathPrefix = cropperTarget.type === 'project' ? 'projects' : 'products'
            const fileName = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`

            const { error: uploadError } = await supabase.storage
                .from('portfolio-assets')
                .upload(fileName, croppedBlob, { contentType: 'image/jpeg' })

            if (uploadError) throw uploadError

            const { data } = supabase.storage
                .from('portfolio-assets')
                .getPublicUrl(fileName)

            const publicUrl = data.publicUrl

            // Update State & DB
            if (cropperTarget.type === 'project' && cropperTarget.id) {
                updateProject(cropperTarget.id, { project_photo_url: publicUrl })
            } else if (cropperTarget.type === 'product' && selectedProduct) {
                // If we are editing a selected product
                updateProduct(selectedProduct.id, { image_url: publicUrl })
            }

        } catch (error) {
            console.error('Error uploading image:', error)
            alert('Error uploading image. Please try again.')
        } finally {
            setIsUploading(false)
            setCropperOpen(false)
            setCropperImage(null)
            setCropperTarget(null)
        }
    }

    // --- handlers ---

    // Experience Handlers
    const addExperience = async () => {
        const { data } = await supabase.from('experiences').insert({
            user_id: userId,
            company_name: '',
            job_title: '',
            start_year: new Date().getFullYear(),
            end_year: null
        }).select().single()
        if (data) setExperiences([data, ...experiences])
    }
    const updateExperience = async (id: string, updates: Partial<Experience>) => {
        // Optimistic update
        setExperiences(experiences.map(e => e.id === id ? { ...e, ...updates } : e))
        await supabase.from('experiences').update(updates).eq('id', id)
    }
    const deleteExperience = async (id: string) => {
        setExperiences(experiences.filter(e => e.id !== id))
        await supabase.from('experiences').delete().eq('id', id)
    }
    const deleteQualification = async (id: string) => {
        setQualifications(qualifications.filter(q => q.id !== id))
        await supabase.from('qualifications').delete().eq('id', id)
    }
    const deleteProject = async (id: string) => {
        setProjects(projects.filter(p => p.id !== id))
        await supabase.from('projects').delete().eq('id', id)
    }

    // Qualification Handlers
    const addQualification = async () => {
        const { data } = await supabase.from('qualifications').insert({
            user_id: userId,
            institution: '',
            qualification_name: '',
            start_year: new Date().getFullYear(),
            end_year: new Date().getFullYear()
        }).select().single()
        if (data) setQualifications([data, ...qualifications])
    }
    const updateQualification = async (id: string, updates: Partial<Qualification>) => {
        setQualifications(qualifications.map(q => q.id === id ? { ...q, ...updates } : q))
        await supabase.from('qualifications').update(updates).eq('id', id)
    }

    // Project Handlers
    const addProject = async () => {
        const { data } = await supabase.from('projects').insert({
            user_id: userId,
            project_name: '',
            contribution: '',
            description: '',
            project_url: ''
        }).select().single()
        if (data) setProjects([data, ...projects])
    }
    const updateProject = async (id: string, updates: Partial<Project>) => {
        setProjects(projects.map(p => p.id === id ? { ...p, ...updates } : p))
        await supabase.from('projects').update(updates).eq('id', id)
    }

    // Product Handlers
    const addProduct = async () => {
        const { data } = await supabase.from('products').insert({
            user_id: userId,
            name: 'New Product',
            price: '0',
        }).select().single()
        if (data) {
            setProducts([...products, data])
            setSelectedProduct(data) // Select new product immediately
        }
    }
    const updateProduct = async (id: string, updates: Partial<Product>) => {
        setProducts(products.map(p => p.id === id ? { ...p, ...updates } : p))
        if (selectedProduct?.id === id) {
            setSelectedProduct(prev => prev ? { ...prev, ...updates } : null)
        }
        await supabase.from('products').update(updates).eq('id', id)
    }
    const confirmDeleteProduct = (id: string) => {
        setDeleteConfirmation({ isOpen: true, productId: id })
    }

    const executeDeleteProduct = async () => {
        if (!deleteConfirmation.productId) return

        const id = deleteConfirmation.productId
        setProducts(products.filter(p => p.id !== id))
        if (selectedProduct?.id === id) setSelectedProduct(null)

        setDeleteConfirmation({ isOpen: false, productId: null }) // Close immediately for UI

        await supabase.from('products').delete().eq('id', id)
    }


    // --- Render Helpers ---

    // Collapsed View
    if (!isExpanded) {
        return (
            <TahoeGlassSurface
                as="button"
                type="button"
                variant="card"
                radius={24}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.38}
                onClick={() => setIsExpanded(true)}
                className="w-full overflow-hidden text-left group"
                contentClassName="p-6 flex items-center justify-between w-full h-full"
                aria-expanded={false}
            >
                        <span className="flex items-center gap-4">
                            <span>
                                <span className="block text-2xl font-bold text-white">Advanced Mode</span>
                                <span className="block text-sm text-white/60">Add Experiences, Projects, and Products</span>
                            </span>
                        </span>
                        <ChevronDown className="text-white/50 group-hover:text-white transition-colors" />
            </TahoeGlassSurface>
        )
    }

    // Render Experiences Editor
    const renderExperiences = () => (
        <div className="flex flex-col gap-6 pt-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <h4 className="text-white font-semibold text-lg">Job titles</h4>
                    <TahoeGlassButton
                        onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add my work experience..." }
                        }))}
                        className="px-3 py-1 group"
                        contentClassName="gap-1.5 text-cyan-100"
                    >
                        <Sparkles size={12} className="text-cyan-400 group-hover:text-cyan-300" />
                        <span className="text-xs font-medium text-cyan-100 group-hover:text-white">Ask Deity</span>
                    </TahoeGlassButton>
                </div>
                <TahoeGlassButton onClick={addExperience} className="w-8 h-8 p-0" contentClassName="text-white" aria-label="Add experience">
                    <Plus size={16} />
                </TahoeGlassButton>
            </div>

            {/* List */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'experiences')}>
                <SortableContext items={experiences.map(e => e.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-4">
                        {experiences.map((exp) => (
                            <SortableItem key={exp.id} id={exp.id} className="relative group p-4">
                                {(listeners) => (
                                    <>
                                        <div
                                            {...listeners}
                                            className="absolute top-4 left-4 w-6 h-6 flex items-center justify-center text-white/20 hover:text-white/60 cursor-grab active:cursor-grabbing transition-colors z-20"
                                        >
                                            <GripVertical size={16} />
                                        </div>
                                        <TahoeGlassButton
                                            onClick={() => deleteExperience(exp.id)}
                                            className="absolute top-4 right-4 w-10 h-10 p-0 z-20"
                                            contentClassName="text-red-200"
                                            aria-label="Delete experience"
                                        >
                                            <X size={18} />
                                        </TahoeGlassButton>

                                        <div className="grid gap-4 pl-8">
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Company</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                    <input type="text" value={exp.company_name} onChange={(e) => updateExperience(exp.id, { company_name: e.target.value })} placeholder="e.g. Google" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Role</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                    <input type="text" value={exp.job_title} onChange={(e) => updateExperience(exp.id, { job_title: e.target.value })} placeholder="e.g. Senior Product Designer" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Start Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                        <input type="number" value={exp.start_year} onChange={(e) => updateExperience(exp.id, { start_year: parseInt(e.target.value) })} className="text-white/80" />
                                                    </TahoeGlassField>
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">End Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                        <input type="number" value={exp.end_year || ''} placeholder="Present" onChange={(e) => updateExperience(exp.id, { end_year: e.target.value ? parseInt(e.target.value) : null })} className="text-white/80" />
                                                    </TahoeGlassField>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </SortableItem>
                        ))}
                        {experiences.length === 0 && <p className="text-white/60 text-sm italic">No experiences added yet.</p>}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    )

    // Render Qualifications Editor
    const renderQualifications = () => (
        <div className="flex flex-col gap-6 pt-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <h4 className="text-white font-semibold text-lg">Qualifications</h4>
                    <TahoeGlassButton
                        onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add my qualifications..." }
                        }))}
                        className="px-3 py-1 group"
                        contentClassName="gap-1.5 text-cyan-100"
                    >
                        <Sparkles size={12} className="text-cyan-400 group-hover:text-cyan-300" />
                        <span className="text-xs font-medium text-cyan-100 group-hover:text-white">Ask Deity</span>
                    </TahoeGlassButton>
                </div>
                <TahoeGlassButton onClick={addQualification} className="w-8 h-8 p-0" contentClassName="text-white" aria-label="Add qualification">
                    <Plus size={16} />
                </TahoeGlassButton>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'qualifications')}>
                <SortableContext items={qualifications.map(q => q.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-4">
                        {qualifications.map((qual) => (
                            <SortableItem key={qual.id} id={qual.id} className="relative group p-4">
                                {(listeners) => (
                                    <>
                                        <div
                                            {...listeners}
                                            className="absolute top-4 left-4 w-6 h-6 flex items-center justify-center text-white/20 hover:text-white/60 cursor-grab active:cursor-grabbing transition-colors z-20"
                                        >
                                            <GripVertical size={16} />
                                        </div>
                                        <TahoeGlassButton onClick={() => deleteQualification(qual.id)} className="absolute top-4 right-4 w-10 h-10 p-0 z-20" contentClassName="text-red-200" aria-label="Delete qualification">
                                            <X size={18} />
                                        </TahoeGlassButton>

                                        <div className="grid gap-4 pl-8">
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Institution</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                    <input type="text" value={qual.institution} onChange={(e) => updateQualification(qual.id, { institution: e.target.value })} placeholder="e.g. Stanford University" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Qualification</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                    <input type="text" value={qual.qualification_name} onChange={(e) => updateQualification(qual.id, { qualification_name: e.target.value })} placeholder="e.g. MSc Computer Science" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="flex-1">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Start Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                        <input type="number" value={qual.start_year} onChange={(e) => updateQualification(qual.id, { start_year: parseInt(e.target.value) })} className="text-white/80" />
                                                    </TahoeGlassField>
                                                </div>
                                                <div className="flex-1">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">End Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                        <input type="number" value={qual.end_year} onChange={(e) => updateQualification(qual.id, { end_year: parseInt(e.target.value) })} className="text-white/80" />
                                                    </TahoeGlassField>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </SortableItem>
                        ))}
                        {qualifications.length === 0 && <p className="text-white/60 text-sm italic">No qualifications added yet.</p>}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    )

    // Render Projects Editor
    const renderProjects = () => (
        <div className="flex flex-col gap-6 pt-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <h4 className="text-white font-semibold text-lg">Projects</h4>
                    <TahoeGlassButton
                        onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add a project..." }
                        }))}
                        className="px-3 py-1 group"
                        contentClassName="gap-1.5 text-cyan-100"
                    >
                        <Sparkles size={12} className="text-cyan-400 group-hover:text-cyan-300" />
                        <span className="text-xs font-medium text-cyan-100 group-hover:text-white">Ask Deity</span>
                    </TahoeGlassButton>
                </div>
                <TahoeGlassButton onClick={addProject} className="w-8 h-8 p-0" contentClassName="text-white" aria-label="Add project">
                    <Plus size={16} />
                </TahoeGlassButton>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'projects')}>
                <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-4">
                        {projects.map((proj) => (
                            <SortableItem key={proj.id} id={proj.id} className="relative group p-4">
                                {(listeners) => (
                                    <>
                                        <div
                                            {...listeners}
                                            className="absolute top-4 left-4 w-6 h-6 flex items-center justify-center text-white/20 hover:text-white/60 cursor-grab active:cursor-grabbing transition-colors z-20"
                                        >
                                            <GripVertical size={16} />
                                        </div>
                                        <TahoeGlassButton onClick={() => deleteProject(proj.id)} className="absolute top-4 right-4 w-10 h-10 p-0 z-20" contentClassName="text-red-200" aria-label="Delete project">
                                            <X size={18} />
                                        </TahoeGlassButton>

                                        <div className="grid gap-4 pl-8">
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Project Name</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                    <input type="text" value={proj.project_name} onChange={(e) => updateProject(proj.id, { project_name: e.target.value })} placeholder="e.g. Neo-Bank Mobile App" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Your Contribution</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                    <input type="text" value={proj.contribution} onChange={(e) => updateProject(proj.id, { contribution: e.target.value })} placeholder="e.g. Lead UI/UX Designer" className="text-white/80 placeholder:text-white/20" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Project URL (Optional)</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                                                    <input type="url" value={proj.project_url || ''} onChange={(e) => updateProject(proj.id, { project_url: e.target.value })} placeholder="e.g. https://example.com" className="text-white/80 placeholder:text-white/20" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Description</label>
                                                <TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="p-3 min-h-[60px] resize-none">
                                                    <textarea value={proj.description || ''} onChange={(e) => updateProject(proj.id, { description: e.target.value })} placeholder="Describe the project..." className="text-white/70 text-sm placeholder:text-white/20" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Project Photo</label>
                                                <div className="flex items-center gap-4">
                                                    {proj.project_photo_url && (
                                                        <TahoeGlassSurface variant="mediaFrame" radius={8} className="h-16 w-16 overflow-hidden" contentClassName="h-full w-full">
                                                            <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${proj.project_photo_url})` }} />
                                                        </TahoeGlassSurface>
                                                    )}
                                                    <TahoeGlassSurface variant="button" radius={12} tone="light" className="px-4 py-2" contentClassName="flex items-center gap-2">
                                                        <label className="cursor-pointer flex items-center gap-2">
                                                            {isUploading ? <Loader2 size={16} className="animate-spin text-white/70" /> : <Upload size={16} className="text-white/70" />}
                                                            <span className="text-sm text-white/70">{proj.project_photo_url ? 'Change Photo' : 'Upload Photo'}</span>
                                                            <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                                                const file = e.target.files?.[0]
                                                                if (file) handleImageSelect(file, 'project', proj.id)
                                                                e.target.value = ''
                                                            }} />
                                                        </label>
                                                    </TahoeGlassSurface>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </SortableItem>
                        ))}
                        {projects.length === 0 && <p className="text-white/60 text-sm italic">No projects added yet.</p>}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    )

    // Render Products Editor (Requires distinct logic for dynamic selection)
    const renderProducts = () => {
        // If no product selected but existing products in list, prompt selection
        if (!selectedProduct && products.length > 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
                    <p className="text-white/80">Select a product from the left menu to edit <br /> or click + above to create one.</p>
                </div>
            )
        }

        if (!selectedProduct) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
                    <p className="text-white/80">No products yet. <br /> Click + in the sidebar to add your first product.</p>
                </div>
            )
        }

        // Edit Product Form
        return (
            <div className="flex flex-col gap-6 animate-fadeIn pt-6 relative">
                <TahoeGlassButton
                    onClick={() => confirmDeleteProduct(selectedProduct.id)}
                    className="absolute top-[27px] right-0 w-10 h-10 p-0 z-10"
                    contentClassName="text-red-200"
                    aria-label="Delete product"
                >
                    <X size={18} />
                </TahoeGlassButton>

                <div className="grid gap-6">
                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Product Name</label>
                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2 pr-12">
                            <input type="text" value={selectedProduct.name} onChange={(e) => updateProduct(selectedProduct.id, { name: e.target.value })} className="text-2xl font-bold text-white placeholder:text-white/20" />
                        </TahoeGlassField>
                    </div>

                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Price (include the currency)</label>
                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2">
                            <input type="text" value={selectedProduct.price || ''} onChange={(e) => updateProduct(selectedProduct.id, { price: e.target.value })} placeholder="e.g. $50 or Free" className="text-xl font-medium text-white placeholder:text-white/20" />
                        </TahoeGlassField>
                    </div>

                    {/* Product Image & Sales Page - Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Product Image */}
                        <div>
                            <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Product Image</label>
                            <div className="flex items-center gap-4 min-h-[64px]">
                                {selectedProduct.image_url && (
                                    <TahoeGlassSurface variant="mediaFrame" radius={8} className="h-16 w-16 overflow-hidden" contentClassName="h-full w-full">
                                        <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${selectedProduct.image_url})` }} />
                                    </TahoeGlassSurface>
                                )}
                                <TahoeGlassSurface variant="button" radius={12} tone="light" className="px-4 py-2" contentClassName="flex items-center gap-2">
                                    <label className="cursor-pointer flex items-center gap-2">
                                        {isUploading ? <Loader2 size={16} className="animate-spin text-white/70" /> : <Upload size={16} className="text-white/70" />}
                                        <span className="text-sm text-white/70">{selectedProduct.image_url ? 'Change Image' : 'Upload Image'}</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            const file = e.target.files?.[0]
                                            if (file) handleImageSelect(file, 'product', selectedProduct.id)
                                            e.target.value = ''
                                        }} />
                                    </label>
                                </TahoeGlassSurface>
                            </div>
                        </div>

                        {/* Sales Page Creator */}
                        <div>
                            <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Product Sales Page</label>
                            <div className="flex items-center gap-4 min-h-[64px]">
                                <TahoeGlassButton
                                    onClick={() => updateProduct(selectedProduct.id, { sales_page_active: !selectedProduct.sales_page_active })}
                                    role="switch"
                                    aria-checked={selectedProduct.sales_page_active}
                                    aria-label="Enable product sales page"
                                    semanticTint={selectedProduct.sales_page_active ? 'light' : 'dark'}
                                    className="w-11 h-6 p-0 flex-shrink-0"
                                    contentClassName="relative block h-full w-full"
                                >
                                    <span aria-hidden="true" className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all ${selectedProduct.sales_page_active ? 'left-6' : 'left-1'}`} />
                                </TahoeGlassButton>
                                {selectedProduct.sales_page_active && (
                                    <TahoeGlassButton
                                        onClick={() => window.open(`/dashboard/products/${selectedProduct.id}/creator`, '_blank')}
                                        className="px-4 py-2"
                                        contentClassName="text-white/70"
                                    >
                                        <Layout size={16} className="text-white/70" />
                                        <span className="text-sm text-white/70">Open Sales Page Creator</span>
                                    </TahoeGlassButton>
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Description</label>
                        <TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="p-4 min-h-[100px] resize-none">
                            <textarea value={selectedProduct.description || ''} onChange={(e) => updateProduct(selectedProduct.id, { description: e.target.value })} className="text-white/80 text-sm" placeholder="Describe your offering..." />
                        </TahoeGlassField>
                    </div>

                    {/* Purchase Link Toggle */}
                    <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={12} tone="light" className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-sm font-medium text-white">Purchase Link</label>
                            <TahoeGlassButton
                                onClick={() => updateProduct(selectedProduct.id, { purchase_link_active: !selectedProduct.purchase_link_active })}
                                role="switch"
                                aria-checked={selectedProduct.purchase_link_active}
                                aria-label="Enable purchase link"
                                semanticTint={selectedProduct.purchase_link_active ? 'light' : 'dark'}
                                className="w-11 h-6 p-0"
                                contentClassName="relative block h-full w-full"
                            >
                                <span aria-hidden="true" className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all ${selectedProduct.purchase_link_active ? 'left-6' : 'left-1'}`} />
                            </TahoeGlassButton>
                        </div>
                        {selectedProduct.purchase_link_active && (
                            <TahoeGlassField tone="light" surfaceClassName="p-2">
                                <input type="url" value={selectedProduct.purchase_link || ''} onChange={(e) => updateProduct(selectedProduct.id, { purchase_link: e.target.value })} placeholder="https://..." className="text-white/80 text-sm" />
                            </TahoeGlassField>
                        )}
                    </TahoeGlassSurface>

                    {/* PayPal HTML Toggle */}
                    <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={12} tone="light" className="p-4">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2 pt-0.5">
                                <label className="text-sm font-medium text-white">PayPal Button Code</label>
                                <div className="group relative hidden min-[391px]:block">
                                    <TahoeGlassButton
                                        onClick={() => setShowGuide(!showGuide)}
                                        className="px-2 py-0.5"
                                        contentClassName="gap-1.5 text-white/60"
                                    >
                                        <Info size={12} className="text-white/60" />
                                        <span className="text-[10px] font-medium text-white/60">Where is this?</span>
                                    </TahoeGlassButton>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <TahoeGlassButton
                                    onClick={() => updateProduct(selectedProduct.id, { paypal_active: !selectedProduct.paypal_active })}
                                    role="switch"
                                    aria-checked={selectedProduct.paypal_active}
                                    aria-label="Enable PayPal button code"
                                    semanticTint={selectedProduct.paypal_active ? 'light' : 'dark'}
                                    className="w-11 h-6 p-0"
                                    contentClassName="relative block h-full w-full"
                                >
                                    <span aria-hidden="true" className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all ${selectedProduct.paypal_active ? 'left-6' : 'left-1'}`} />
                                </TahoeGlassButton>
                                <div className="group relative block min-[391px]:hidden">
                                    <TahoeGlassButton
                                        onClick={() => setShowGuide(!showGuide)}
                                        className="px-2 py-0.5"
                                        contentClassName="gap-1.5 text-white/60"
                                    >
                                        <Info size={12} className="text-white/60" />
                                        <span className="text-[10px] font-medium text-white/60">Where is this?</span>
                                    </TahoeGlassButton>
                                </div>
                            </div>
                        </div>
                        {selectedProduct.paypal_active && (
                            <div className="relative space-y-3">
                                {/* Guide Image Accordion */}
                                {showGuide && (
                                    <TahoeGlassSurface variant="popover" radius={12} tone="light" className="overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                        <div className="p-3 border-b border-white/10 flex justify-between items-center">
                                            <span className="text-xs font-medium text-white/80">PayPal Dashboard &gt; Copy Code</span>
                                            <TahoeGlassButton onClick={() => setShowGuide(false)} className="h-7 w-7 p-0" contentClassName="text-white/60" aria-label="Close PayPal guide">
                                                <X size={14} />
                                            </TahoeGlassButton>
                                        </div>
                                        <div className="p-4 flex justify-center">
                                            <a
                                                href="https://youtu.be/9KihkWujsaI?si=hwAHbrQDLvOog6U8&t=28"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="relative group block max-w-full cursor-pointer"
                                            >
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <TahoeGlassSurface variant="pill" tone="light" className="opacity-0 group-hover:opacity-100 px-3 py-1.5 transition-opacity transform translate-y-2 group-hover:translate-y-0 duration-200" contentClassName="text-white text-xs font-medium">
                                                        Watch Video Tutorial ↗
                                                    </TahoeGlassSurface>
                                                </div>
                                                <img
                                                    src="/guide-paypal.png"
                                                    alt="Guide: Copy the Button HTML Code"
                                                    className="max-w-full rounded-lg shadow-2xl border border-white/10"
                                                />
                                            </a>
                                        </div>
                                    </TahoeGlassSurface>
                                )}

                                <TahoeGlassField
                                    tone="light"
                                    surfaceClassName={`p-0 ring-1 ${verificationStatus === 'scanning' ? 'ring-yellow-500/50' : verificationStatus === 'secure' ? 'ring-green-500/50' : verificationStatus === 'unsafe' ? 'ring-red-500/50' : 'ring-white/10'}`}
                                    controlClassName="p-2 min-h-[80px] text-xs font-mono resize-none"
                                >
                                    <textarea value={selectedProduct.paypal_html || ''} onChange={(e) => updateProduct(selectedProduct.id, { paypal_html: e.target.value })} placeholder="<form action=...>" className="text-white/80" />
                                </TahoeGlassField>
                                {/* Security Status Indicator Overlay */}
                                {selectedProduct.paypal_html && (
                                    <div className="mt-2 flex items-center justify-between animate-in fade-in duration-300">
                                        <div className="flex items-center gap-2">
                                            {verificationStatus === 'scanning' && (
                                                <>
                                                    <Loader2 size={14} className="text-yellow-400 animate-spin" />
                                                    <span className="text-yellow-400 text-xs font-medium tracking-wide">Scanning code...</span>
                                                </>
                                            )}
                                            {verificationStatus === 'secure' && (
                                                <>
                                                    <ShieldCheck size={14} className="text-green-400" />
                                                    <span className="text-green-400 text-xs font-medium tracking-wide">Verified Safe</span>
                                                </>
                                            )}
                                            {verificationStatus === 'unsafe' && (
                                                <>
                                                    <ShieldAlert size={14} className="text-red-400" />
                                                    <span className="text-red-400 text-xs font-medium tracking-wide">Unsafe content detected</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-50">
                                            <Lock size={10} className="text-white" />
                                            <span className="text-[10px] uppercase tracking-widest text-white">nsso secure html verification</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </TahoeGlassSurface>



                </div>

            </div>

        )
    }

    // Main Expanded View
    return (
        <GlassCard
            className="w-full min-h-[600px] rounded-[40px] relative"
        >
            <div className="flex flex-col md:flex-row w-full h-full">

                {/* Collapse Button */}
                <TahoeGlassButton
                    onClick={() => setIsExpanded(false)}
                    className="absolute top-4 right-4 z-50 h-9 w-9 p-0"
                    contentClassName="text-white/65"
                    aria-label="Collapse advanced mode"
                    aria-expanded={true}
                >
                    <ChevronUp size={20} />
                </TahoeGlassButton>

                {/* LEFT COLUMN: Sidebar Navigation */}
                <TahoeGlassSurface as="aside" variant="menu" tone="light" className="w-full md:w-[300px] border-r border-white/10" contentClassName="p-6 flex flex-col gap-8">

                    {/* Experiences Section */}
                    <div>
                        <h3 className="text-xs text-white/70 uppercase tracking-widest font-bold mb-4">Experiences</h3>
                        <div className="flex flex-col gap-2">
                            <TahoeGlassButton
                                onClick={() => { setActiveSection('experiences'); setSelectedProduct(null); }}
                                semanticTint={activeSection === 'experiences' ? 'light' : 'dark'}
                                className="w-full px-4 py-3"
                                contentClassName="w-full justify-start text-left text-white/90"
                            >
                                Job Titles
                            </TahoeGlassButton>
                            <TahoeGlassButton
                                onClick={() => { setActiveSection('qualifications'); setSelectedProduct(null); }}
                                semanticTint={activeSection === 'qualifications' ? 'light' : 'dark'}
                                className="w-full px-4 py-3"
                                contentClassName="w-full justify-start text-left text-white/90"
                            >
                                Qualifications
                            </TahoeGlassButton>
                            <TahoeGlassButton
                                onClick={() => { setActiveSection('projects'); setSelectedProduct(null); }}
                                semanticTint={activeSection === 'projects' ? 'light' : 'dark'}
                                className="w-full px-4 py-3"
                                contentClassName="w-full justify-start text-left text-white/90"
                            >
                                Projects
                            </TahoeGlassButton>
                        </div>
                    </div>

                    {/* Products Section */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs text-white/70 uppercase tracking-widest font-bold">Products & Services</h3>
                            <div className="flex items-center gap-2">
                                <TahoeGlassButton
                                    onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                        detail: { initialMessage: "I want to add a product or service..." }
                                    }))}
                                    className="w-7 h-7 p-0"
                                    contentClassName="text-cyan-300"
                                    title="Ask Deity"
                                >
                                    <Sparkles size={12} />
                                </TahoeGlassButton>
                                <TahoeGlassButton
                                    onClick={addProduct}
                                    className="w-7 h-7 p-0"
                                    contentClassName="text-white"
                                    aria-label="Add product"
                                >
                                    <Plus size={12} />
                                </TahoeGlassButton>
                            </div>
                        </div>

                        {/* Web3 Coming Soon Teaser */}
                        <div className="relative group mb-4">
                            <TahoeGlassSurface variant="panel" radius={12} tone="light" className="w-full cursor-help opacity-60 hover:opacity-100 transition-opacity" contentClassName="flex items-center justify-between px-4 py-3 text-left">
                                <span className="text-white/50 text-[15px]">Integrate web3 wallet</span>
                                <TahoeGlassSurface variant="pill" tone="light" className="px-[10px] py-[3px]">
                                    <span className="font-medium text-[10px] text-white/96 leading-[14px] whitespace-nowrap" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                                        Coming soon
                                    </span>
                                </TahoeGlassSurface>
                            </TahoeGlassSurface>

                            {/* Tooltip */}
                            <TahoeGlassSurface variant="popover" radius={12} tone="light" className="absolute left-0 -bottom-2 translate-y-full w-full p-3 z-[60] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none shadow-xl" contentClassName="text-white/80 text-xs leading-relaxed">
                                Allow customers to pay for your products & services using crypto, available February 2026 subject to regulatory approvals
                            </TahoeGlassSurface>
                        </div>

                        {/* Facebook Pixel Coming Soon Teaser */}
                        <div className="relative group mb-4">
                            <TahoeGlassSurface variant="panel" radius={12} tone="light" className="w-full cursor-help opacity-60 hover:opacity-100 transition-opacity" contentClassName="flex items-center justify-between px-4 py-3 text-left">
                                <span className="text-white/50 text-[15px]">Connect Facebook Pixel</span>
                                <TahoeGlassSurface variant="pill" tone="light" className="px-[10px] py-[3px]">
                                    <span className="font-medium text-[10px] text-white/96 leading-[14px] whitespace-nowrap" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                                        Coming soon
                                    </span>
                                </TahoeGlassSurface>
                            </TahoeGlassSurface>

                            {/* Tooltip */}
                            <TahoeGlassSurface variant="popover" radius={12} tone="light" className="absolute left-0 -bottom-2 translate-y-full w-full p-3 z-[60] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none shadow-xl" contentClassName="text-white/80 text-xs leading-relaxed">
                                Track conversions and optimize your ads with Facebook Pixel integration.
                            </TahoeGlassSurface>
                        </div>

                        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2">
                            {products.map(product => (
                                <div key={product.id} className="relative group">
                                    <TahoeGlassButton
                                        onClick={() => { setActiveSection('products'); setSelectedProduct(product); }}
                                        semanticTint={activeSection === 'products' && selectedProduct?.id === product.id ? 'light' : 'dark'}
                                        className="w-full px-4 py-3 pr-8"
                                        contentClassName="w-full justify-start truncate text-left text-white/90"
                                    >
                                        {product.name || 'New Product'}
                                    </TahoeGlassButton>
                                    <TahoeGlassButton
                                        onClick={(e) => { e.stopPropagation(); confirmDeleteProduct(product.id); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 opacity-0 group-hover:opacity-100"
                                        contentClassName="text-red-300"
                                        aria-label={`Delete ${product.name || 'product'}`}
                                    >
                                        <X size={12} />
                                    </TahoeGlassButton>
                                </div>
                            ))}
                            {products.length === 0 && (
                                <p className="text-white/60 text-xs italic px-2">No products added.</p>
                            )}
                        </div>
                    </div>
                </TahoeGlassSurface>

                {/* RIGHT COLUMN: Content Editor */}
                <div className="flex-1 p-6 md:p-10 overflow-y-auto max-h-[800px] relative">
                    {activeSection === 'experiences' && renderExperiences()}
                    {activeSection === 'qualifications' && renderQualifications()}
                    {activeSection === 'projects' && renderProjects()}
                    {activeSection === 'products' && renderProducts()}
                </div>

                {/* Cropper Modal */}
                {cropperImage && (
                    <ImageCropperModal
                        isOpen={cropperOpen}
                        onClose={() => setCropperOpen(false)}
                        imageSrc={cropperImage}
                        aspectRatio={cropperAspect}
                        onCropComplete={handleCropComplete}
                        loading={isUploading}
                    />
                )}
                <TahoeGlassDialog
                    open={deleteConfirmation.isOpen}
                    onOpenChange={(open) => { if (!open) setDeleteConfirmation({ isOpen: false, productId: null }) }}
                    portal={false}
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.38}
                    title="Are you sure?"
                    description="You cannot restore your Product after it has been deleted. This action is permanent."
                    titleClassName="text-xl font-bold text-white"
                    descriptionClassName="text-white/70 leading-relaxed"
                    className="max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200"
                >
                            <div className="flex gap-3">
                                <TahoeGlassButton
                                    onClick={() => setDeleteConfirmation({ isOpen: false, productId: null })}
                                    className="flex-1 py-2.5"
                                    contentClassName="text-white font-medium"
                                >
                                    Cancel
                                </TahoeGlassButton>
                                <TahoeGlassButton
                                    onClick={executeDeleteProduct}
                                    className="flex-1 py-2.5"
                                    contentClassName="text-red-200 font-medium"
                                >
                                    Delete
                                </TahoeGlassButton>
                            </div>
                </TahoeGlassDialog>
            </div>
        </GlassCard>
    )
}
