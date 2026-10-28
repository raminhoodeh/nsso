'use client'

import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import { useState, useEffect, useLayoutEffect, useRef, type KeyboardEvent } from 'react'
import { Plus, ChevronDown, ChevronUp, Upload, Loader2, GripVertical } from 'lucide-react'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent, type DraggableAttributes, type DraggableSyntheticListeners } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import { Experience, Qualification, Project } from '@/lib/types'
import type { EditableValues } from '@/lib/profile-mutations'
import { useProfile } from '@/components/providers/ProfileProvider'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import { uploadProfileMedia, runProfileMediaAttempt } from '@/lib/profile-media-client'
import { useToast } from '@/components/ui/Toast'
import { TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { LightButton, LightIconButton, LightCloseButton, lightButtonClass } from '@/components/ui/LightButton'
import ProductsServicesEditor from './ProductsServicesEditor'
import AskDeityButton from '@/components/ui/AskDeityButton'

interface AdvancedModeCardProps {
    userId: string
    requestedOffering?: string | null
    requestedCreator?: boolean
}

type ActiveSection = 'experiences' | 'qualifications' | 'projects'
type ExpandedPanel = 'experience' | 'products' | null
type ExperienceKind = 'experience' | 'qualification' | 'project'
type InsertionPosition = 'top' | 'bottom'
const ACTIVE_SECTION_ORDER: ActiveSection[] = ['experiences', 'qualifications', 'projects']
const SECTION_FOR_KIND: Record<ExperienceKind, ActiveSection> = { experience: 'experiences', qualification: 'qualifications', project: 'projects' }

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

export default function AdvancedModeCard({ userId, requestedOffering = null, requestedCreator = false }: AdvancedModeCardProps) {
    const { showToast } = useToast()
    const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(requestedOffering ? 'products' : null)
    useEffect(() => {
        if (!requestedOffering) return
        const frame = requestAnimationFrame(() => setExpandedPanel('products'))
        return () => cancelAnimationFrame(frame)
    }, [requestedOffering, requestedCreator])
    const [activeSection, setActiveSection] = useState<ActiveSection>('experiences')
    // const [isLoading, setIsLoading] = useState(false) // Driven by provider now
    const [isUploading, setIsUploading] = useState(false)
    const [adding, setAdding] = useState<ExperienceKind | null>(null)
    const addingRef = useRef(false)
    const [newField, setNewField] = useState<{ section: ActiveSection; id: string; origin: Element | null; generation: number } | null>(null)
    const activeEditor = useRef({ expandedPanel, activeSection, generation: 0 })
    useLayoutEffect(() => {
        const previous = activeEditor.current
        activeEditor.current = { expandedPanel, activeSection, generation: previous.generation + Number(previous.expandedPanel !== expandedPanel || previous.activeSection !== activeSection) }
    }, [expandedPanel, activeSection])
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
        reorderExperiences,
        reorderQualifications,
        reorderProjects,
        createEntity, patchEntity, removeEntity
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

    useEffect(() => {
        if (!newField) return
        if (expandedPanel !== 'experience' || activeSection !== newField.section || activeEditor.current.generation !== newField.generation) {
            const frame = requestAnimationFrame(() => setNewField(null))
            return () => cancelAnimationFrame(frame)
        }
        const field = document.getElementById(`profile-${newField.section}-${newField.id}`)
        if (!(field instanceof HTMLInputElement)) return
        const frame = requestAnimationFrame(() => {
            const active = document.activeElement
            // The closed Deity shell stays mounted to preserve conversation
            // state. Only an active modal, or a user who moved away from the
            // originating Add control, should cancel this one-time focus.
            const modal = document.querySelector('dialog:modal') || Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(element => !element.closest('[hidden],[inert],[aria-hidden="true"]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
            if (field.isConnected && !field.closest('[hidden],[inert],[aria-hidden="true"]') && !modal && activeEditor.current.generation === newField.generation && (active === newField.origin || active === document.body)) {
                field.focus({ preventScroll: true })
                field.scrollIntoView({ block: 'nearest', behavior: 'instant' })
            }
            setNewField(null)
        })
        return () => cancelAnimationFrame(frame)
    }, [newField, expandedPanel, activeSection, experiences, qualifications, projects])

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

    // Confirmation State
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'experience' | 'qualification' | 'project'; id: string; name: string } | null>(null)

    // Cropper State

    // Cropper State
    const [cropperOpen, setCropperOpen] = useState(false)
    const [cropperImage, setCropperImage] = useState<string | null>(null)
    const [cropperAspect, setCropperAspect] = useState(1)
    const [cropperTarget, setCropperTarget] = useState<{ type: 'project', id?: string } | null>(null)


    // ... 

    // Modified Image Upload Handler (Now just prepares crop)
    const handleImageSelect = (file: File, type: 'project', id?: string) => {
        if (!file) return
        const reader = new FileReader()
        reader.addEventListener('load', () => {
            setCropperImage(reader.result as string)
            setCropperAspect(16 / 9)
            setCropperTarget({ type, id })
            setCropperOpen(true)
        })
        reader.readAsDataURL(file)
    }

    // Final Upload after Crop
    const handleCropComplete = async (croppedBlob: Blob, signal: AbortSignal) => {
        if (!cropperTarget) return
        setIsUploading(true)

        try {
            await runProfileMediaAttempt(async attemptSignal => {
                const {url:publicUrl}=await uploadProfileMedia(croppedBlob,cropperTarget.type,userId,attemptSignal)
                if (attemptSignal.aborted) return
                if (cropperTarget.type === 'project' && cropperTarget.id) {
                    if (!await updateProject(cropperTarget.id, { project_photo_url: publicUrl })) throw new Error('The image change was not saved. Your crop has been kept.')
                } else throw new Error('Reopen the image editor before uploading.')
                if (attemptSignal.aborted) return
                setCropperOpen(false)
                setCropperImage(null)
                setCropperTarget(null)
            }, { signal })
        } catch (error) {
            if (!signal.aborted) showToast(error instanceof Error ? error.message : 'The image save could not be confirmed. Your crop has been kept.', 'error')
        } finally {
            setIsUploading(false)
        }
    }

    // --- handlers ---

    // All editor writes share the authenticated, revisioned mutation gateway.
    const addItem = async <K extends ExperienceKind>(kind: K, values: EditableValues[K], position: InsertionPosition) => {
        // aria-disabled keeps keyboard focus in place; the guard blocks repeat activation.
        if (addingRef.current) return
        const origin = document.activeElement
        const generation = activeEditor.current.generation
        addingRef.current = true
        setAdding(kind)
        try {
            const result = await createEntity(kind, values, position)
            const section = SECTION_FOR_KIND[kind]
            const row = result.changes.find(change => change.entity === section && change.row)?.row
            if (result.status === 'applied' && typeof row?.id === 'string' && activeEditor.current.expandedPanel === 'experience' && activeEditor.current.activeSection === section && activeEditor.current.generation === generation) {
                setNewField({ section, id: row.id, origin, generation })
            }
        } catch {
            showToast('Adding this item could not be confirmed. Check the save status before trying again.', 'error')
        } finally {
            addingRef.current = false
            setAdding(null)
        }
    }
    const addExperience = (position: InsertionPosition) => addItem('experience',{company_name:'',job_title:'',start_year:new Date().getFullYear(),end_year:null,description:''},position)
    const updateExperience = async (id: string, updates: Partial<Experience>) => {
        setExperiences(current => current.map(row => row.id === id ? {...row,...updates} : row))
        return patchEntity('experience',id,updates)
    }
    const deleteExperience = (id: string) => { const row = experiences.find(item => item.id === id); setDeleteTarget({ type: 'experience', id, name: row?.company_name ? `experience at ${row.company_name}` : 'experience' }) }
    const addQualification = (position: InsertionPosition) => addItem('qualification',{institution:'',qualification_name:'',start_year:new Date().getFullYear(),end_year:new Date().getFullYear()},position)
    const updateQualification = async (id: string, updates: Partial<Qualification>) => {
        setQualifications(current => current.map(row => row.id === id ? {...row,...updates} : row))
        return patchEntity('qualification',id,updates)
    }
    const deleteQualification = (id: string) => { const row = qualifications.find(item => item.id === id); setDeleteTarget({ type: 'qualification', id, name: row?.qualification_name || 'qualification' }) }
    const addProject = (position: InsertionPosition) => addItem('project',{project_name:'',contribution:'',description:'',project_url:null},position)
    const updateProject = async (id: string, updates: Partial<Project>) => {
        setProjects(current => current.map(row => row.id === id ? {...row,...updates} : row))
        return patchEntity('project',id,updates)
    }
    const deleteProject = (id: string) => { const row = projects.find(item => item.id === id); setDeleteTarget({ type: 'project', id, name: row?.project_name || 'project' }) }
    const executeDelete = async () => {
        if (!deleteTarget) return false
        const { type, id } = deleteTarget
        if (!await removeEntity(type, id)) return false
        if (type === 'experience') setExperiences(current => current.filter(row => row.id !== id))
        if (type === 'qualification') setQualifications(current => current.filter(row => row.id !== id))
        if (type === 'project') setProjects(current => current.filter(row => row.id !== id))
        return true
    }

    // --- Render Helpers ---

    const renderPanelToggle = (
        panel: Exclude<ExpandedPanel, null>,
        title: string,
        controls: string
    ) => {
        const expanded = expandedPanel === panel

        return (
            <LightButton
                type="button"
                id={`${controls}-toggle`}
                radius={24}
                onClick={() => setExpandedPanel(current => current === panel ? null : panel)}
                className="group w-full overflow-hidden p-0 text-left"
                contentClassName="p-4 sm:p-6 flex items-center justify-between gap-4 w-full h-full"
                aria-expanded={expanded}
                aria-controls={controls}
            >
                <span className="min-w-0">
                    <span className="block text-xl font-bold sm:text-2xl">{title}</span>
                </span>
                {expanded ? (
                    <ChevronUp className="shrink-0" />
                ) : (
                    <ChevronDown className="shrink-0" />
                )}
            </LightButton>
        )
    }

    // Render Experiences Editor
    const renderExperiences = () => (
        <div className="flex flex-col gap-4 md:gap-6 md:pt-6">
            {/* Header */}
            <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="text-white font-semibold text-lg">Job titles</h4>
                    <AskDeityButton onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add my work experience..." }
                        }))} aria-label="Ask Deity about job titles" />
                </div>
                <LightIconButton type="button" onClick={() => { void addExperience('top') }} aria-disabled={adding !== null} aria-busy={adding === 'experience'} aria-label="Add experience">
                    <Plus size={18} aria-hidden="true" />
                </LightIconButton>
            </div>

            {/* List */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'experiences')}>
                <SortableContext items={experiences.map(e => e.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3 md:gap-4">
                        {experiences.map((exp) => (
                            <SortableItem key={exp.id} id={exp.id} className="relative group p-3 md:p-4">
                                {({ attributes, listeners, setActivatorNodeRef }) => (
                                    <>
                                        <div className="grid min-w-0 gap-3 md:gap-4">
                                            <div data-editor-primary-row className="grid min-w-0 grid-cols-[minmax(0,7fr)_minmax(44px,3fr)] items-end gap-3">
                                                <div data-editor-primary-field className="min-w-0">
                                                    <div>
                                                        <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Company</label>
                                                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                            <input id={`profile-experiences-${exp.id}`} type="text" aria-label="Company" value={exp.company_name} onChange={(e) => updateExperience(exp.id, { company_name: e.target.value })} placeholder="e.g. Google" className="scroll-mt-40 text-white font-medium placeholder:text-white/60" />
                                                        </TahoeGlassField>
                                                    </div>
                                                </div>
                                                <LightCloseButton type="button" onClick={() => deleteExperience(exp.id)} className="justify-self-end" aria-label="Delete experience" />
                                            </div>
                                            <div data-editor-detail-row className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-end gap-2">
                                                <LightIconButton ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing" aria-label="Drag to reorder experience">
                                                    <GripVertical size={18} aria-hidden="true" />
                                                </LightIconButton>
                                                <div className="min-w-0">
                                                    <div>
                                                        <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Role</label>
                                                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                            <input type="text" aria-label="Role" value={exp.job_title} onChange={(e) => updateExperience(exp.id, { job_title: e.target.value })} placeholder="e.g. Senior Product Designer" className="text-white font-medium placeholder:text-white/60" />
                                                        </TahoeGlassField>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:gap-4">
                                                <div className="min-w-0">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Start Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                        <input type="number" aria-label="Experience start year" value={exp.start_year} onChange={(e) => updateExperience(exp.id, { start_year: parseInt(e.target.value) })} className="text-white/80" />
                                                    </TahoeGlassField>
                                                </div>
                                                <div className="min-w-0">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">End Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                        <input type="number" aria-label="Experience end year" value={exp.end_year || ''} placeholder="Present" onChange={(e) => updateExperience(exp.id, { end_year: e.target.value ? parseInt(e.target.value) : null })} className="text-white/80" />
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
            {experiences.length > 0 && <LightButton type="button" onClick={() => { void addExperience('bottom') }} aria-disabled={adding !== null} aria-busy={adding === 'experience'} aria-label="Add experience at bottom" className="w-full px-4 py-3"><Plus size={18} aria-hidden="true" />Add experience</LightButton>}
        </div>
    )

    // Render Qualifications Editor
    const renderQualifications = () => (
        <div className="flex flex-col gap-4 md:gap-6 md:pt-6">
            <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="text-white font-semibold text-lg">Qualifications</h4>
                    <AskDeityButton onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add my qualifications..." }
                        }))} aria-label="Ask Deity about qualifications" />
                </div>
                <LightIconButton type="button" onClick={() => { void addQualification('top') }} aria-disabled={adding !== null} aria-busy={adding === 'qualification'} aria-label="Add qualification">
                    <Plus size={18} aria-hidden="true" />
                </LightIconButton>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'qualifications')}>
                <SortableContext items={qualifications.map(q => q.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3 md:gap-4">
                        {qualifications.map((qual) => (
                            <SortableItem key={qual.id} id={qual.id} className="relative group p-3 md:p-4">
                                {({ attributes, listeners, setActivatorNodeRef }) => (
                                    <>
                                        <div className="grid min-w-0 gap-3 md:gap-4">
                                            <div data-editor-primary-row className="grid min-w-0 grid-cols-[minmax(0,7fr)_minmax(44px,3fr)] items-end gap-3">
                                                <div data-editor-primary-field className="min-w-0">
                                                    <div>
                                                        <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Institution</label>
                                                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                            <input id={`profile-qualifications-${qual.id}`} type="text" aria-label="Institution" value={qual.institution} onChange={(e) => updateQualification(qual.id, { institution: e.target.value })} placeholder="e.g. Stanford University" className="scroll-mt-40 text-white font-medium placeholder:text-white/60" />
                                                        </TahoeGlassField>
                                                    </div>
                                                </div>
                                                <LightCloseButton type="button" onClick={() => deleteQualification(qual.id)} className="justify-self-end" aria-label="Delete qualification" />
                                            </div>
                                            <div data-editor-detail-row className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-end gap-2">
                                                <LightIconButton ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing" aria-label="Drag to reorder qualification">
                                                    <GripVertical size={18} aria-hidden="true" />
                                                </LightIconButton>
                                                <div className="min-w-0">
                                                    <div>
                                                        <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Qualification</label>
                                                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                            <input type="text" aria-label="Qualification" value={qual.qualification_name} onChange={(e) => updateQualification(qual.id, { qualification_name: e.target.value })} placeholder="e.g. MSc Computer Science" className="text-white font-medium placeholder:text-white/60" />
                                                        </TahoeGlassField>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:gap-4">
                                                <div className="min-w-0">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Start Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                        <input type="number" aria-label="Qualification start year" value={qual.start_year} onChange={(e) => updateQualification(qual.id, { start_year: parseInt(e.target.value) })} className="text-white/80" />
                                                    </TahoeGlassField>
                                                </div>
                                                <div className="min-w-0">
                                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">End Year</label>
                                                    <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                        <input type="number" aria-label="Qualification end year" value={qual.end_year} onChange={(e) => updateQualification(qual.id, { end_year: parseInt(e.target.value) })} className="text-white/80" />
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
            {qualifications.length > 0 && <LightButton type="button" onClick={() => { void addQualification('bottom') }} aria-disabled={adding !== null} aria-busy={adding === 'qualification'} aria-label="Add qualification at bottom" className="w-full px-4 py-3"><Plus size={18} aria-hidden="true" />Add qualification</LightButton>}
        </div>
    )

    // Render Projects Editor
    const renderProjects = () => (
        <div className="flex flex-col gap-4 md:gap-6 md:pt-6">
            <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h4 className="text-white font-semibold text-lg">Projects</h4>
                    <AskDeityButton onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "I want to add a project..." }
                        }))} aria-label="Ask Deity about projects" />
                </div>
                <LightIconButton type="button" onClick={() => { void addProject('top') }} aria-disabled={adding !== null} aria-busy={adding === 'project'} aria-label="Add project">
                    <Plus size={18} aria-hidden="true" />
                </LightIconButton>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(e, 'projects')}>
                <SortableContext items={projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3 md:gap-4">
                        {projects.map((proj) => (
                            <SortableItem key={proj.id} id={proj.id} className="relative group p-3 md:p-4">
                                {({ attributes, listeners, setActivatorNodeRef }) => (
                                    <>
                                        <div className="grid min-w-0 gap-3 md:gap-4">
                                            <div data-editor-primary-row className="grid min-w-0 grid-cols-[minmax(0,7fr)_minmax(44px,3fr)] items-end gap-3">
                                                <div data-editor-primary-field className="min-w-0">
                                                    <div>
                                                        <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Project Name</label>
                                                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                            <input id={`profile-projects-${proj.id}`} type="text" aria-label="Project name" value={proj.project_name} onChange={(e) => updateProject(proj.id, { project_name: e.target.value })} placeholder="e.g. Neo-Bank Mobile App" className="scroll-mt-40 text-white font-medium placeholder:text-white/60" />
                                                        </TahoeGlassField>
                                                    </div>
                                                </div>
                                                <LightCloseButton type="button" onClick={() => deleteProject(proj.id)} className="justify-self-end" aria-label="Delete project" />
                                            </div>
                                            <div data-editor-detail-row className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)] items-end gap-2">
                                                <LightIconButton ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} className="touch-none cursor-grab active:cursor-grabbing" aria-label="Drag to reorder project">
                                                    <GripVertical size={18} aria-hidden="true" />
                                                </LightIconButton>
                                                <div className="min-w-0">
                                                    <div>
                                                        <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Your Contribution</label>
                                                        <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                            <input type="text" aria-label="Your contribution" value={proj.contribution} onChange={(e) => updateProject(proj.id, { contribution: e.target.value })} placeholder="e.g. Lead UI/UX Designer" className="text-white/80 placeholder:text-white/60" />
                                                        </TahoeGlassField>
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Project URL (Optional)</label>
                                                <TahoeGlassField tone="light" surfaceClassName="px-3 py-2.5 md:py-2">
                                                    <input type="url" aria-label="Project URL (optional)" value={proj.project_url || ''} onChange={(e) => updateProject(proj.id, { project_url: e.target.value })} placeholder="e.g. https://example.com" className="text-white/80 placeholder:text-white/60" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Description</label>
                                                <TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="p-3 min-h-[88px] resize-none md:min-h-[60px]">
                                                    <textarea aria-label="Project description" value={proj.description || ''} onChange={(e) => updateProject(proj.id, { description: e.target.value })} placeholder="Describe the project..." className="text-base text-white/70 placeholder:text-white/60 md:text-sm" />
                                                </TahoeGlassField>
                                            </div>
                                            <div>
                                                <label className="text-xs text-white/75 uppercase tracking-widest mb-2 block">Project Photo</label>
                                                <div className="flex items-center gap-4">
                                                    {proj.project_photo_url && (
                                                        <TahoeGlassSurface variant="mediaFrame" radius={8} className="h-16 w-16 overflow-hidden" contentClassName="h-full w-full">
                                                            <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${proj.project_photo_url})` }} />
                                                        </TahoeGlassSurface>
                                                    )}
                                                    <label className={`${lightButtonClass} cursor-pointer has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-slate-950`}>
                                                        {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} aria-hidden="true" />}
                                                        <span>{proj.project_photo_url ? 'Change Photo' : 'Upload Photo'}</span>
                                                        <input type="file" aria-label={`Upload photo for ${proj.project_name || 'project'}`} accept="image/*" className="sr-only" onChange={(e) => {
                                                            const file = e.target.files?.[0]
                                                            if (file) handleImageSelect(file, 'project', proj.id)
                                                            e.target.value = ''
                                                        }} />
                                                    </label>
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
            {projects.length > 0 && <LightButton type="button" onClick={() => { void addProject('bottom') }} aria-disabled={adding !== null} aria-busy={adding === 'project'} aria-label="Add project at bottom" className="w-full px-4 py-3"><Plus size={18} aria-hidden="true" />Add project</LightButton>}
        </div>
    )

    return (
        <div className="flex flex-col gap-6" data-profile-editor-sections="split">
            <section className="flex flex-col gap-3" data-editor-accordion="experience">
                {renderPanelToggle(
                    'experience',
                    'Experience & Education',
                    'experience-education-editor'
                )}
                <div
                    id="experience-education-editor"
                    role="region"
                    aria-labelledby="experience-education-editor-toggle"
                    hidden={expandedPanel !== 'experience'}
                >
                    {expandedPanel === 'experience' && (
                        <GlassCard
                            radius="var(--editor-card-radius)"
                            className="w-full [--editor-card-radius:28px] md:min-h-[600px] md:[--editor-card-radius:40px]"
                        >
                            <div className="flex h-full w-full flex-col md:flex-row" data-editor-card="experience">
                        <TahoeGlassSurface
                            as="aside"
                            variant="menu"
                            radius="var(--editor-aside-radius)"
                            tone="light"
                            className="w-full [--editor-aside-radius:28px_28px_0px_0px] border-b border-white/10 md:w-[300px] md:[--editor-aside-radius:40px_0px_0px_40px] md:border-b-0 md:border-r"
                            contentClassName="p-3 md:p-6"
                        >
                            <h3 className="sr-only md:not-sr-only md:mb-4 md:block md:text-xs md:font-bold md:uppercase md:tracking-widest md:text-white/70">Experience & Education</h3>
                            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0" role="tablist" aria-label="Experience and education sections">
                                <LightButton
                                    ref={(node) => { sectionTabRefs.current.experiences = node }}
                                    type="button"
                                    id="experience-tab-experiences"
                                    onClick={() => setActiveSection('experiences')}
                                    onKeyDown={(event) => handleSectionTabKeyDown(event, 'experiences')}
                                    className="shrink-0 px-5 py-2.5 aria-selected:ring-2 aria-selected:ring-slate-600/50 md:w-full md:px-4 md:py-3"
                                    contentClassName="w-full justify-center whitespace-nowrap text-[15px] md:justify-start md:text-left md:text-base"
                                    role="tab"
                                    aria-selected={activeSection === 'experiences'}
                                    aria-controls="experience-experiences-panel"
                                    tabIndex={activeSection === 'experiences' ? 0 : -1}
                                >
                                    Job Titles
                                </LightButton>
                                <LightButton
                                    ref={(node) => { sectionTabRefs.current.qualifications = node }}
                                    type="button"
                                    id="experience-tab-qualifications"
                                    onClick={() => setActiveSection('qualifications')}
                                    onKeyDown={(event) => handleSectionTabKeyDown(event, 'qualifications')}
                                    className="shrink-0 px-5 py-2.5 aria-selected:ring-2 aria-selected:ring-slate-600/50 md:w-full md:px-4 md:py-3"
                                    contentClassName="w-full justify-center whitespace-nowrap text-[15px] md:justify-start md:text-left md:text-base"
                                    role="tab"
                                    aria-selected={activeSection === 'qualifications'}
                                    aria-controls="experience-qualifications-panel"
                                    tabIndex={activeSection === 'qualifications' ? 0 : -1}
                                >
                                    Qualifications
                                </LightButton>
                                <LightButton
                                    ref={(node) => { sectionTabRefs.current.projects = node }}
                                    type="button"
                                    id="experience-tab-projects"
                                    onClick={() => setActiveSection('projects')}
                                    onKeyDown={(event) => handleSectionTabKeyDown(event, 'projects')}
                                    className="shrink-0 px-5 py-2.5 aria-selected:ring-2 aria-selected:ring-slate-600/50 md:w-full md:px-4 md:py-3"
                                    contentClassName="w-full justify-center whitespace-nowrap text-[15px] md:justify-start md:text-left md:text-base"
                                    role="tab"
                                    aria-selected={activeSection === 'projects'}
                                    aria-controls="experience-projects-panel"
                                    tabIndex={activeSection === 'projects' ? 0 : -1}
                                >
                                    Projects
                                </LightButton>
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
                <h2>
                {renderPanelToggle(
                    'products',
                    'Products & Services',
                    'products-services-editor'
                )}
                </h2>
                <div
                    id="products-services-editor"
                    role="region"
                    aria-labelledby="products-services-editor-toggle"
                    hidden={expandedPanel !== 'products'}
                >
                    <ProductsServicesEditor userId={userId} expanded={expandedPanel === 'products'} requestedOffering={requestedOffering} requestedCreator={requestedCreator} />
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
            <ConfirmDeleteDialog open={Boolean(deleteTarget)} name={deleteTarget?.name || 'item'} onClose={() => setDeleteTarget(null)} onConfirm={executeDelete} />
        </div>
    )
}
