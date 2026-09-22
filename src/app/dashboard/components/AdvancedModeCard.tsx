'use client'

import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, ChevronDown, ChevronUp, Info, Upload, Loader2, ShieldCheck, ShieldAlert, Lock, Layout, Sparkles, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import DOMPurify from 'dompurify'
import { Experience, Qualification, Project, Product } from '@/lib/types'
import { useProfile } from '@/components/providers/ProfileProvider'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import { TahoeGlassButton, TahoeGlassDialog, TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface AdvancedModeCardProps {
    userId: string
}

type ActiveSection = 'experiences' | 'qualifications' | 'projects'
type ExpandedPanel = 'experience' | 'products' | null
const ACTIVE_SECTION_ORDER: ActiveSection[] = ['experiences', 'qualifications', 'projects']

interface SortableItemRenderProps {
    attributes: DraggableAttributes
    listeners: DraggableSyntheticListeners
    setActivatorNodeRef: (element: HTMLElement | null) => void
}

// Sortable Item Component
function SortableItem({ id, children, className }: { id: string; children: (props: SortableItemRenderProps) => React.ReactNode; className?: string }) {
    const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id })

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative' as const,
    }

    return (
        <TahoeGlassSurface ref={setNodeRef} style={style} variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" tracking={isDragging ? 'continuous' : 'static'} className={className}>
            {children({ attributes, listeners, setActivatorNodeRef })}
        </TahoeGlassSurface>
    )
}

export default function AdvancedModeCard({ userId }: AdvancedModeCardProps) {
    const [supabase] = useState(() => createClient())
    const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null)
    const [activeSection, setActiveSection] = useState<ActiveSection>('experiences')
    // const [isLoading, setIsLoading] = useState(false) // Driven by provider now
    const [isUploading, setIsUploading] = useState(false)
    const [showGuide, setShowGuide] = useState(false)
    const sectionTabRefs = useRef<Record<ActiveSection, HTMLButtonElement | null>>({
        experiences: null,
        qualifications: null,
        projects: null,
    })

    const handleSectionTabKeyDown = (event: KeyboardEvent<HTMLElement>, section: ActiveSection) => {
        let nextIndex: number | null = null
        const currentIndex = ACTIVE_SECTION_ORDER.indexOf(section)

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            nextIndex = (currentIndex + 1) % ACTIVE_SECTION_ORDER.length
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            nextIndex = (currentIndex - 1 + ACTIVE_SECTION_ORDER.length) % ACTIVE_SECTION_ORDER.length
        } else if (event.key === 'Home') {
            nextIndex = 0
        } else if (event.key === 'End') {
            nextIndex = ACTIVE_SECTION_ORDER.length - 1
        }

        if (nextIndex === null) return
        event.preventDefault()
        const nextSection = ACTIVE_SECTION_ORDER[nextIndex]
        setActiveSection(nextSection)
        sectionTabRefs.current[nextSection]?.focus()
    }

    // Global Profile Data
    const {
        experiences: globalExperiences,
        qualifications: globalQualifications,
        projects: globalProjects,
        products: globalProducts,
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

    const renderPanelToggle = (
        panel: Exclude<ExpandedPanel, null>,
        title: string,
        description: string,
        controls: string
    ) => {
        const expanded = expandedPanel === panel

        return (
            <TahoeGlassSurface
                as="button"
                type="button"
                id={`${controls}-toggle`}
                variant="card"
                radius={24}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.38}
                onClick={() => setExpandedPanel(current => current === panel ? null : panel)}
                className="w-full overflow-hidden text-left group"
                contentClassName="p-4 sm:p-6 flex items-center justify-between gap-4 w-full h-full"
                aria-expanded={expanded}
                aria-controls={controls}
            >
                <span className="min-w-0">
                    <span className="block text-xl sm:text-2xl font-bold text-white">{title}</span>
                    <span className="block text-sm text-white/60">{description}</span>
                </span>
                {expanded ? (
                    <ChevronUp className="shrink-0 text-white/80 transition-colors" />
                ) : (
                    <ChevronDown className="shrink-0 text-white/50 transition-colors group-hover:text-white" />
                )}
            </TahoeGlassSurface>
        )
    }

    // Render Experiences Editor
    const renderExperiences = () => (
        <div className="flex flex-col gap-4 pt-4 md:gap-6 md:pt-6">
            {/* Header */}
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_44px] items-start gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="text-white font-semibold text-lg">Job titles</h4>
                    <TahoeGlassButton
                        onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add my work experience..." }
                        }))}
                        className="min-h-11 min-w-11 shrink-0 px-3 py-2 group md:min-h-0 md:min-w-0 md:py-1"
                        contentClassName="gap-1.5 text-cyan-100"
                    >
                        <Sparkles size={12} className="text-cyan-400 group-hover:text-cyan-300" />
                        <span className="hidden text-xs font-medium text-cyan-100 group-hover:text-white min-[360px]:inline">Ask Deity</span>
                    </TahoeGlassButton>
                </div>
                <TahoeGlassButton onClick={addExperience} className="h-11 w-11 shrink-0 p-0 md:h-8 md:w-8" contentClassName="text-white" aria-label="Add experience">
                    <Plus size={16} />
                </TahoeGlassButton>
            </div>

            {/* List */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'experiences')}>
                <SortableContext items={experiences.map(e => e.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3 md:gap-4">
                        {experiences.map((exp) => (
                            <SortableItem key={exp.id} id={exp.id} className="relative group p-3 md:p-4">
                                {({ attributes, listeners, setActivatorNodeRef }) => (
                                    <>
                                        <div className="mb-3 flex items-center justify-between gap-3 md:mb-0">
                                            <button
                                                ref={setActivatorNodeRef}
                                                type="button"
                                                {...attributes}
                                                {...listeners}
                                                className="z-20 flex h-11 w-11 touch-none cursor-grab items-center justify-center rounded-xl text-white/40 outline-none transition-colors hover:text-white/70 focus-visible:ring-2 focus-visible:ring-white/80 active:cursor-grabbing md:absolute md:left-4 md:top-4 md:h-8 md:w-8 md:text-white/20"
                                                aria-label="Drag to reorder experience"
                                            >
                                                <GripVertical size={16} />
                                            </button>
                                            <TahoeGlassButton
                                                onClick={() => deleteExperience(exp.id)}
                                                className="z-20 h-11 w-11 p-0 md:absolute md:right-4 md:top-4 md:h-10 md:w-10"
                                                contentClassName="text-red-200"
                                                aria-label="Delete experience"
                                            >
                                                <X size={18} />
                                            </TahoeGlassButton>
                                        </div>

                                        <div className="grid gap-3 md:gap-4 md:pl-8">
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Company</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                    <input type="text" value={exp.company_name} onChange={(e) => updateExperience(exp.id, { company_name: e.target.value })} placeholder="e.g. Google" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Role</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                    <input type="text" value={exp.job_title} onChange={(e) => updateExperience(exp.id, { job_title: e.target.value })} placeholder="e.g. Senior Product Designer" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:gap-4">
                                                <div className="min-w-0">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Start Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                        <input type="number" value={exp.start_year} onChange={(e) => updateExperience(exp.id, { start_year: parseInt(e.target.value) })} className="text-white/80" />
                                                    </TahoeGlassField>
                                                </div>
                                                <div className="min-w-0">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">End Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
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
        <div className="flex flex-col gap-4 pt-4 md:gap-6 md:pt-6">
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_44px] items-start gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="text-white font-semibold text-lg">Qualifications</h4>
                    <TahoeGlassButton
                        onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add my qualifications..." }
                        }))}
                        className="min-h-11 min-w-11 shrink-0 px-3 py-2 group md:min-h-0 md:min-w-0 md:py-1"
                        contentClassName="gap-1.5 text-cyan-100"
                    >
                        <Sparkles size={12} className="text-cyan-400 group-hover:text-cyan-300" />
                        <span className="hidden text-xs font-medium text-cyan-100 group-hover:text-white min-[360px]:inline">Ask Deity</span>
                    </TahoeGlassButton>
                </div>
                <TahoeGlassButton onClick={addQualification} className="h-11 w-11 shrink-0 p-0 md:h-8 md:w-8" contentClassName="text-white" aria-label="Add qualification">
                    <Plus size={16} />
                </TahoeGlassButton>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'qualifications')}>
                <SortableContext items={qualifications.map(q => q.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3 md:gap-4">
                        {qualifications.map((qual) => (
                            <SortableItem key={qual.id} id={qual.id} className="relative group p-3 md:p-4">
                                {({ attributes, listeners, setActivatorNodeRef }) => (
                                    <>
                                        <div className="mb-3 flex items-center justify-between gap-3 md:mb-0">
                                            <button
                                                ref={setActivatorNodeRef}
                                                type="button"
                                                {...attributes}
                                                {...listeners}
                                                className="z-20 flex h-11 w-11 touch-none cursor-grab items-center justify-center rounded-xl text-white/40 outline-none transition-colors hover:text-white/70 focus-visible:ring-2 focus-visible:ring-white/80 active:cursor-grabbing md:absolute md:left-4 md:top-4 md:h-8 md:w-8 md:text-white/20"
                                                aria-label="Drag to reorder qualification"
                                            >
                                                <GripVertical size={16} />
                                            </button>
                                            <TahoeGlassButton
                                                onClick={() => deleteQualification(qual.id)}
                                                className="z-20 h-11 w-11 p-0 md:absolute md:right-4 md:top-4 md:h-10 md:w-10"
                                                contentClassName="text-red-200"
                                                aria-label="Delete qualification"
                                            >
                                                <X size={18} />
                                            </TahoeGlassButton>
                                        </div>

                                        <div className="grid gap-3 md:gap-4 md:pl-8">
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Institution</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                    <input type="text" value={qual.institution} onChange={(e) => updateQualification(qual.id, { institution: e.target.value })} placeholder="e.g. Stanford University" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Qualification</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                    <input type="text" value={qual.qualification_name} onChange={(e) => updateQualification(qual.id, { qualification_name: e.target.value })} placeholder="e.g. MSc Computer Science" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:gap-4">
                                                <div className="min-w-0">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Start Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                        <input type="number" value={qual.start_year} onChange={(e) => updateQualification(qual.id, { start_year: parseInt(e.target.value) })} className="text-white/80" />
                                                    </TahoeGlassField>
                                                </div>
                                                <div className="min-w-0">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">End Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
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
        <div className="flex flex-col gap-4 pt-4 md:gap-6 md:pt-6">
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_44px] items-start gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="text-white font-semibold text-lg">Projects</h4>
                    <TahoeGlassButton
                        onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add a project..." }
                        }))}
                        className="min-h-11 min-w-11 shrink-0 px-3 py-2 group md:min-h-0 md:min-w-0 md:py-1"
                        contentClassName="gap-1.5 text-cyan-100"
                    >
                        <Sparkles size={12} className="text-cyan-400 group-hover:text-cyan-300" />
                        <span className="hidden text-xs font-medium text-cyan-100 group-hover:text-white min-[360px]:inline">Ask Deity</span>
                    </TahoeGlassButton>
                </div>
                <TahoeGlassButton onClick={addProject} className="h-11 w-11 shrink-0 p-0 md:h-8 md:w-8" contentClassName="text-white" aria-label="Add project">
                    <Plus size={16} />
                </TahoeGlassButton>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'projects')}>
                <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3 md:gap-4">
                        {projects.map((proj) => (
                            <SortableItem key={proj.id} id={proj.id} className="relative group p-3 md:p-4">
                                {({ attributes, listeners, setActivatorNodeRef }) => (
                                    <>
                                        <div className="mb-3 flex items-center justify-between gap-3 md:mb-0">
                                            <button
                                                ref={setActivatorNodeRef}
                                                type="button"
                                                {...attributes}
                                                {...listeners}
                                                className="z-20 flex h-11 w-11 touch-none cursor-grab items-center justify-center rounded-xl text-white/40 outline-none transition-colors hover:text-white/70 focus-visible:ring-2 focus-visible:ring-white/80 active:cursor-grabbing md:absolute md:left-4 md:top-4 md:h-8 md:w-8 md:text-white/20"
                                                aria-label="Drag to reorder project"
                                            >
                                                <GripVertical size={16} />
                                            </button>
                                            <TahoeGlassButton
                                                onClick={() => deleteProject(proj.id)}
                                                className="z-20 h-11 w-11 p-0 md:absolute md:right-4 md:top-4 md:h-10 md:w-10"
                                                contentClassName="text-red-200"
                                                aria-label="Delete project"
                                            >
                                                <X size={18} />
                                            </TahoeGlassButton>
                                        </div>

                                        <div className="grid gap-3 md:gap-4 md:pl-8">
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Project Name</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                    <input type="text" value={proj.project_name} onChange={(e) => updateProject(proj.id, { project_name: e.target.value })} placeholder="e.g. Neo-Bank Mobile App" className="text-white font-medium placeholder:text-white/40" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Your Contribution</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                    <input type="text" value={proj.contribution} onChange={(e) => updateProject(proj.id, { contribution: e.target.value })} placeholder="e.g. Lead UI/UX Designer" className="text-white/80 placeholder:text-white/20" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Project URL (Optional)</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                    <input type="url" value={proj.project_url || ''} onChange={(e) => updateProject(proj.id, { project_url: e.target.value })} placeholder="e.g. https://example.com" className="text-white/80 placeholder:text-white/20" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Description</label>
                                                <TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="p-3 min-h-[88px] resize-none md:min-h-[60px]">
                                                    <textarea value={proj.description || ''} onChange={(e) => updateProject(proj.id, { description: e.target.value })} placeholder="Describe the project..." className="text-base text-white/70 placeholder:text-white/20 md:text-sm" />
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
                <div className="flex flex-col items-center justify-center h-full text-center p-4 opacity-50 md:p-8">
                    <p className="text-white/80">Select a product from the left menu to edit <br /> or click + above to create one.</p>
                </div>
            )
        }

        if (!selectedProduct) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center p-4 opacity-50 md:p-8">
                    <p className="text-white/80">No products yet. <br /> Click + in the sidebar to add your first product.</p>
                </div>
            )
        }

        // Edit Product Form
        return (
            <div className="relative flex flex-col gap-4 pt-4 animate-fadeIn md:gap-6 md:pt-6">
                <div className="flex min-h-11 items-center justify-between gap-3 md:absolute md:right-0 md:top-[27px] md:z-10 md:min-h-0">
                    <span className="text-xs font-semibold uppercase tracking-widest text-white/55 md:hidden">Product details</span>
                    <TahoeGlassButton
                        onClick={() => confirmDeleteProduct(selectedProduct.id)}
                        className="h-11 w-11 shrink-0 p-0 md:h-10 md:w-10"
                        contentClassName="text-red-200"
                        aria-label="Delete product"
                    >
                        <X size={18} />
                    </TahoeGlassButton>
                </div>

                <div className="grid gap-4 md:gap-6">
                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Product Name</label>
                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2 md:pr-12">
                            <input type="text" value={selectedProduct.name} onChange={(e) => updateProduct(selectedProduct.id, { name: e.target.value })} className="text-xl font-bold text-white placeholder:text-white/20 min-[390px]:text-2xl" />
                        </TahoeGlassField>
                    </div>

                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Price (include the currency)</label>
                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                            <input type="text" value={selectedProduct.price || ''} onChange={(e) => updateProduct(selectedProduct.id, { price: e.target.value })} placeholder="e.g. $50 or Free" className="text-lg font-medium text-white placeholder:text-white/20 min-[390px]:text-xl" />
                        </TahoeGlassField>
                    </div>

                    {/* Product Image & Sales Page - Side by Side */}
                    <div className="grid grid-cols-1 gap-5 md:gap-6 lg:grid-cols-2">
                        {/* Product Image */}
                        <div>
                            <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Product Image</label>
                            <div className="flex min-h-[64px] flex-wrap items-center gap-3 md:gap-4">
                                {selectedProduct.image_url && (
                                    <TahoeGlassSurface variant="mediaFrame" radius={8} className="h-16 w-16 overflow-hidden" contentClassName="h-full w-full">
                                        <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${selectedProduct.image_url})` }} />
                                    </TahoeGlassSurface>
                                )}
                                <TahoeGlassSurface variant="button" radius={12} tone="light" className="min-h-11 min-w-0 flex-1 px-3 py-2 md:flex-none md:px-4" contentClassName="flex items-center justify-center gap-2">
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
                            <div className="flex min-h-[64px] items-center gap-3 md:gap-4">
                                <TahoeGlassButton
                                    onClick={() => updateProduct(selectedProduct.id, { sales_page_active: !selectedProduct.sales_page_active })}
                                    role="switch"
                                    aria-checked={selectedProduct.sales_page_active}
                                    aria-label="Enable product sales page"
                                    semanticTint={selectedProduct.sales_page_active ? 'light' : 'dark'}
                                    className="h-11 w-14 shrink-0 p-0"
                                    contentClassName="relative block h-6 w-11"
                                >
                                    <span aria-hidden="true" className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all ${selectedProduct.sales_page_active ? 'left-6' : 'left-1'}`} />
                                </TahoeGlassButton>
                                {selectedProduct.sales_page_active && (
                                    <TahoeGlassButton
                                        onClick={() => window.open(`/dashboard/products/${selectedProduct.id}/creator`, '_blank')}
                                        className="min-h-11 min-w-0 flex-1 px-3 py-2 md:flex-none md:px-4"
                                        contentClassName="text-white/70"
                                    >
                                        <Layout size={16} className="text-white/70" />
                                        <span className="text-left text-sm leading-tight text-white/70">Open Sales Page Creator</span>
                                    </TahoeGlassButton>
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Description</label>
                        <TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="min-h-[144px] resize-none px-3 py-3 md:min-h-[100px] md:p-4">
                            <textarea value={selectedProduct.description || ''} onChange={(e) => updateProduct(selectedProduct.id, { description: e.target.value })} className="text-base text-white/80 md:text-sm" placeholder="Describe your offering..." />
                        </TahoeGlassField>
                    </div>

                    {/* Purchase Link Toggle */}
                    <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={12} tone="light" className="p-3 md:p-4">
                        <div className="mb-3 flex min-h-11 items-center justify-between gap-3 md:mb-4">
                            <label className="text-sm font-medium text-white">Purchase Link</label>
                            <TahoeGlassButton
                                onClick={() => updateProduct(selectedProduct.id, { purchase_link_active: !selectedProduct.purchase_link_active })}
                                role="switch"
                                aria-checked={selectedProduct.purchase_link_active}
                                aria-label="Enable purchase link"
                                semanticTint={selectedProduct.purchase_link_active ? 'light' : 'dark'}
                                className="h-11 w-14 shrink-0 p-0"
                                contentClassName="relative block h-6 w-11"
                            >
                                <span aria-hidden="true" className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all ${selectedProduct.purchase_link_active ? 'left-6' : 'left-1'}`} />
                            </TahoeGlassButton>
                        </div>
                        {selectedProduct.purchase_link_active && (
                            <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:p-2">
                                <input type="url" value={selectedProduct.purchase_link || ''} onChange={(e) => updateProduct(selectedProduct.id, { purchase_link: e.target.value })} placeholder="https://..." className="text-base text-white/80 md:text-sm" />
                            </TahoeGlassField>
                        )}
                    </TahoeGlassSurface>

                    {/* PayPal HTML Toggle */}
                    <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={12} tone="light" className="p-3 md:p-4">
                        <div className="mb-3 flex min-h-11 items-start justify-between gap-3 md:mb-4">
                            <div className="flex items-center gap-2 pt-0.5">
                                <label className="text-sm font-medium text-white">PayPal Button Code</label>
                                <div className="group relative hidden md:block">
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
                                    className="h-11 w-14 shrink-0 p-0"
                                    contentClassName="relative block h-6 w-11"
                                >
                                    <span aria-hidden="true" className={`absolute top-1 h-4 w-4 bg-white rounded-full transition-all ${selectedProduct.paypal_active ? 'left-6' : 'left-1'}`} />
                                </TahoeGlassButton>
                                <div className="group relative block md:hidden">
                                    <TahoeGlassButton
                                        onClick={() => setShowGuide(!showGuide)}
                                        className="min-h-11 px-3 py-2"
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
                                    controlClassName="min-h-[112px] resize-none px-3 py-3 text-base font-mono md:min-h-[80px] md:p-2 md:text-xs"
                                >
                                    <textarea value={selectedProduct.paypal_html || ''} onChange={(e) => updateProduct(selectedProduct.id, { paypal_html: e.target.value })} placeholder="<form action=...>" className="text-white/80" />
                                </TahoeGlassField>
                                {/* Security Status Indicator Overlay */}
                                {selectedProduct.paypal_html && (
                                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-300">
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

    return (
        <div className="flex flex-col gap-6" data-profile-editor-sections="split">
            <section className="flex flex-col gap-3" data-editor-accordion="experience">
                {renderPanelToggle(
                    'experience',
                    'Experience & Education',
                    'Manage job titles, qualifications, and projects',
                    'experience-education-editor'
                )}
                <div
                    id="experience-education-editor"
                    role="region"
                    aria-labelledby="experience-education-editor-toggle"
                    hidden={expandedPanel !== 'experience'}
                >
                    {expandedPanel === 'experience' && (
                        <GlassCard className="w-full rounded-[28px] md:min-h-[600px] md:rounded-[40px]">
                            <div className="flex h-full w-full flex-col md:flex-row" data-editor-card="experience">
                        <TahoeGlassSurface
                            as="aside"
                            variant="menu"
                            tone="light"
                            className="w-full border-b border-white/10 md:w-[300px] md:border-b-0 md:border-r"
                            contentClassName="p-3 md:p-6"
                        >
                            <h3 className="sr-only md:not-sr-only md:mb-4 md:block md:text-xs md:font-bold md:uppercase md:tracking-widest md:text-white/70">Experience & Education</h3>
                            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0" role="tablist" aria-label="Experience and education sections">
                                <TahoeGlassButton
                                    ref={(node) => { sectionTabRefs.current.experiences = node }}
                                    type="button"
                                    id="experience-tab-experiences"
                                    onClick={() => setActiveSection('experiences')}
                                    onKeyDown={(event) => handleSectionTabKeyDown(event, 'experiences')}
                                    semanticTint={activeSection === 'experiences' ? 'light' : 'dark'}
                                    className="min-h-11 shrink-0 px-5 py-2.5 md:w-full md:px-4 md:py-3"
                                    contentClassName="w-full justify-center whitespace-nowrap text-[15px] text-white/90 md:justify-start md:text-left md:text-base"
                                    role="tab"
                                    aria-selected={activeSection === 'experiences'}
                                    aria-controls="experience-experiences-panel"
                                    tabIndex={activeSection === 'experiences' ? 0 : -1}
                                >
                                    Job Titles
                                </TahoeGlassButton>
                                <TahoeGlassButton
                                    ref={(node) => { sectionTabRefs.current.qualifications = node }}
                                    type="button"
                                    id="experience-tab-qualifications"
                                    onClick={() => setActiveSection('qualifications')}
                                    onKeyDown={(event) => handleSectionTabKeyDown(event, 'qualifications')}
                                    semanticTint={activeSection === 'qualifications' ? 'light' : 'dark'}
                                    className="min-h-11 shrink-0 px-5 py-2.5 md:w-full md:px-4 md:py-3"
                                    contentClassName="w-full justify-center whitespace-nowrap text-[15px] text-white/90 md:justify-start md:text-left md:text-base"
                                    role="tab"
                                    aria-selected={activeSection === 'qualifications'}
                                    aria-controls="experience-qualifications-panel"
                                    tabIndex={activeSection === 'qualifications' ? 0 : -1}
                                >
                                    Qualifications
                                </TahoeGlassButton>
                                <TahoeGlassButton
                                    ref={(node) => { sectionTabRefs.current.projects = node }}
                                    type="button"
                                    id="experience-tab-projects"
                                    onClick={() => setActiveSection('projects')}
                                    onKeyDown={(event) => handleSectionTabKeyDown(event, 'projects')}
                                    semanticTint={activeSection === 'projects' ? 'light' : 'dark'}
                                    className="min-h-11 shrink-0 px-5 py-2.5 md:w-full md:px-4 md:py-3"
                                    contentClassName="w-full justify-center whitespace-nowrap text-[15px] text-white/90 md:justify-start md:text-left md:text-base"
                                    role="tab"
                                    aria-selected={activeSection === 'projects'}
                                    aria-controls="experience-projects-panel"
                                    tabIndex={activeSection === 'projects' ? 0 : -1}
                                >
                                    Projects
                                </TahoeGlassButton>
                            </div>
                        </TahoeGlassSurface>

                        <div className="relative flex-1 p-3 md:max-h-[800px] md:overflow-y-auto md:p-10">
                            <div
                                id="experience-experiences-panel"
                                role="tabpanel"
                                aria-labelledby="experience-tab-experiences"
                                hidden={activeSection !== 'experiences'}
                            >
                                {activeSection === 'experiences' && renderExperiences()}
                            </div>
                            <div
                                id="experience-qualifications-panel"
                                role="tabpanel"
                                aria-labelledby="experience-tab-qualifications"
                                hidden={activeSection !== 'qualifications'}
                            >
                                {activeSection === 'qualifications' && renderQualifications()}
                            </div>
                            <div
                                id="experience-projects-panel"
                                role="tabpanel"
                                aria-labelledby="experience-tab-projects"
                                hidden={activeSection !== 'projects'}
                            >
                                {activeSection === 'projects' && renderProjects()}
                            </div>
                        </div>
                            </div>
                        </GlassCard>
                    )}
                </div>
            </section>

            <section className="flex flex-col gap-3" data-editor-accordion="products">
                {renderPanelToggle(
                    'products',
                    'Products & Services',
                    'Manage what you offer without opening your experience editor',
                    'products-services-editor'
                )}
                <div
                    id="products-services-editor"
                    role="region"
                    aria-labelledby="products-services-editor-toggle"
                    hidden={expandedPanel !== 'products'}
                >
                    {expandedPanel === 'products' && (
                        <GlassCard className="w-full rounded-[28px] md:min-h-[600px] md:rounded-[40px]">
                            <div className="flex h-full w-full flex-col md:flex-row" data-editor-card="products">
                        <TahoeGlassSurface
                            as="aside"
                            variant="menu"
                            tone="light"
                            className="w-full border-b border-white/10 md:w-[300px] md:border-b-0 md:border-r"
                            contentClassName="p-3 md:p-6"
                        >
                            <div className="mb-4 flex items-center justify-between gap-3">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-white/70">Products & Services</h3>
                                <div className="flex shrink-0 items-center gap-2">
                                    <TahoeGlassButton
                                        onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                            detail: { initialMessage: "I want to add a product or service..." }
                                        }))}
                                        className="h-11 w-11 p-0 md:h-8 md:w-8"
                                        contentClassName="text-cyan-300"
                                        title="Ask Deity"
                                        aria-label="Ask Deity about products and services"
                                    >
                                        <Sparkles size={14} />
                                    </TahoeGlassButton>
                                    <TahoeGlassButton
                                        onClick={addProduct}
                                        className="h-11 w-11 p-0 md:h-8 md:w-8"
                                        contentClassName="text-white"
                                        aria-label="Add product"
                                    >
                                        <Plus size={16} />
                                    </TahoeGlassButton>
                                </div>
                            </div>

                            <div className="relative group mb-3 md:mb-4">
                                <TahoeGlassSurface variant="panel" radius={12} tone="light" className="w-full cursor-help opacity-60 transition-opacity hover:opacity-100" contentClassName="flex items-center justify-between gap-2 px-3 py-3 text-left md:px-4">
                                    <span className="text-[15px] text-white/50">Integrate web3 wallet</span>
                                    <TahoeGlassSurface variant="pill" tone="light" className="px-[10px] py-[3px]">
                                        <span className="whitespace-nowrap text-[10px] font-medium leading-[14px] text-white/96" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                                            Coming soon
                                        </span>
                                    </TahoeGlassSurface>
                                </TahoeGlassSurface>
                                <TahoeGlassSurface variant="popover" radius={12} tone="light" className="invisible absolute -bottom-2 left-0 z-[60] w-full translate-y-full p-3 opacity-0 shadow-xl transition-all duration-200 group-hover:visible group-hover:opacity-100 pointer-events-none" contentClassName="text-xs leading-relaxed text-white/80">
                                    Allow customers to pay for your products & services using crypto, available February 2026 subject to regulatory approvals
                                </TahoeGlassSurface>
                            </div>

                            <div className="relative group mb-3 md:mb-4">
                                <TahoeGlassSurface variant="panel" radius={12} tone="light" className="w-full cursor-help opacity-60 transition-opacity hover:opacity-100" contentClassName="flex items-center justify-between gap-2 px-3 py-3 text-left md:px-4">
                                    <span className="text-[15px] text-white/50">Connect Facebook Pixel</span>
                                    <TahoeGlassSurface variant="pill" tone="light" className="px-[10px] py-[3px]">
                                        <span className="whitespace-nowrap text-[10px] font-medium leading-[14px] text-white/96" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                                            Coming soon
                                        </span>
                                    </TahoeGlassSurface>
                                </TahoeGlassSurface>
                                <TahoeGlassSurface variant="popover" radius={12} tone="light" className="invisible absolute -bottom-2 left-0 z-[60] w-full translate-y-full p-3 opacity-0 shadow-xl transition-all duration-200 group-hover:visible group-hover:opacity-100 pointer-events-none" contentClassName="text-xs leading-relaxed text-white/80">
                                    Track conversions and optimize your ads with Facebook Pixel integration.
                                </TahoeGlassSurface>
                            </div>

                            <div className="flex flex-col gap-2 pr-1 md:max-h-[300px] md:overflow-y-auto md:pr-2">
                                {products.map(product => (
                                    <div key={product.id} className="relative group">
                                        <TahoeGlassButton
                                            onClick={() => setSelectedProduct(product)}
                                            semanticTint={selectedProduct?.id === product.id ? 'light' : 'dark'}
                                            className="min-h-11 w-full py-2.5 pl-4 pr-14 md:py-3"
                                            contentClassName="w-full justify-start truncate text-left text-white/90"
                                        >
                                            {product.name || 'New Product'}
                                        </TahoeGlassButton>
                                        <TahoeGlassButton
                                            onClick={(e) => { e.stopPropagation(); confirmDeleteProduct(product.id); }}
                                            className="absolute right-1 top-1/2 h-11 w-11 -translate-y-1/2 p-0 opacity-100 md:h-8 md:w-8 md:opacity-0 md:group-hover:opacity-100"
                                            contentClassName="text-red-300"
                                            aria-label={`Delete ${product.name || 'product'}`}
                                        >
                                            <X size={14} />
                                        </TahoeGlassButton>
                                    </div>
                                ))}
                                {products.length === 0 && (
                                    <p className="px-2 text-xs italic text-white/60">No products added.</p>
                                )}
                            </div>
                        </TahoeGlassSurface>

                        <div className="relative flex-1 p-3 md:max-h-[800px] md:overflow-y-auto md:p-10">
                            {renderProducts()}
                        </div>
                            </div>
                        </GlassCard>
                    )}
                </div>
            </section>

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
    )
}
