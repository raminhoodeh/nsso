'use client'

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, ChevronDown, ImagePlus, Layout, Loader2, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { useProfile } from '@/components/providers/ProfileProvider'
import PayPalCodeEditor from '@/components/payments/PayPalCodeEditor'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import { useToast } from '@/components/ui/Toast'
import { TahoeGlassButton, TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { TahoeGlassDirectBackdropBoundaryContext } from '@/components/ui/tahoe-glass/TahoeGlassBoundaryContext'
import { runProfileMediaAttempt, uploadProfileMedia } from '@/lib/profile-media-client'
import type { EditableValues } from '@/lib/profile-mutations'
import GlassCard from './DashboardGlassCard'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import SectionHelp from './SectionHelp'

type View = 'list' | 'editor' | 'create'
type InsertionPosition = 'top' | 'bottom'
type FocusRequest = ({ kind: 'editor' | 'create' } | { kind: 'list'; productId: string | null; addPosition?: InsertionPosition }) & { origin?: Element | null }

function Toggle({ checked, label, onClick }: { checked: boolean; label: string; onClick: () => void }) {
    return <TahoeGlassButton type="button" onClick={onClick} role="switch" aria-checked={checked} aria-label={label} semanticTint={checked ? 'light' : 'dark'} className="h-11 w-14 shrink-0 p-0" contentClassName="relative block h-6 w-11">
        <span aria-hidden="true" className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </TahoeGlassButton>
}

/** The section stays mounted while collapsed so payment drafts and receipts keep their owner. */
export default function ProductsServicesEditor({ userId, expanded }: { userId: string; expanded: boolean }) {
    const { products, createEntity, patchEntity, removeEntity, mutationState, productMutationState, productCreationResults, retryPending, refreshProfile, getRevision } = useProfile()
    const { showToast } = useToast()
    const [view, setView] = useState<View>('list')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const selected = products.find(product => product.id === selectedId) || null
    const productsRef = useRef(products)
    useEffect(() => { productsRef.current = products }, [products])
    const [creationName, setCreationName] = useState('')
    const [creating, setCreating] = useState(false)
    const creatingRef = useRef(false)
    const [creationError, setCreationError] = useState('')
    const [creationLocked, setCreationLocked] = useState(false)
    const creationIntent = useRef<{ operationId: string | null; origin: Element | null } | null>(null)
    const creationPosition = useRef<InsertionPosition>('top')
    const [retrying, setRetrying] = useState(false)
    const retryingRef = useRef(false)
    const [futureOpen, setFutureOpen] = useState(false)
    const [showGuide, setShowGuide] = useState(false)
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [pendingFields, setPendingFields] = useState<Record<string, number>>({})
    const [pendingPayments, setPendingPayments] = useState<Record<string, boolean>>({})
    const [crop, setCrop] = useState<{ productId: string; image: string } | null>(null)
    const [uploading, setUploading] = useState(false)
    const listRef = useRef<HTMLDivElement>(null)
    const listButtons = useRef(new Map<string, HTMLButtonElement>())
    const addRef = useRef<HTMLButtonElement>(null)
    const bottomAddRef = useRef<HTMLButtonElement>(null)
    const headingRef = useRef<HTMLHeadingElement>(null)
    const creationHeadingRef = useRef<HTMLHeadingElement>(null)
    const nameRef = useRef<HTMLInputElement>(null)
    const focusRequest = useRef<FocusRequest | null>(null)
    const listPosition = useRef({ windowY: 0, scrollTop: 0 })
    const imageSelection = useRef(0)
    const mounted = useRef(true)
    const navigation = useRef({ expanded, view, selectedId, generation: 0 })
    useLayoutEffect(() => {
        const previous = navigation.current
        navigation.current = { expanded, view, selectedId, generation: previous.generation + Number(previous.expanded !== expanded || previous.view !== view || previous.selectedId !== selectedId) }
    }, [expanded, view, selectedId])

    useEffect(() => {
        mounted.current = true
        return () => { mounted.current = false; imageSelection.current += 1 }
    }, [])

    useEffect(() => {
        if (!expanded || !focusRequest.current) return
        const request = focusRequest.current
        focusRequest.current = null
        const frame = requestAnimationFrame(() => {
            if (request.origin !== undefined) {
                const active = document.activeElement
                const modal = document.querySelector('dialog:modal') || Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(element => !element.closest('[hidden],[inert],[aria-hidden="true"]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
                if (modal || (active !== request.origin && active !== document.body)) return
            }
            if (request.kind === 'list') {
                if (listRef.current) listRef.current.scrollTop = listPosition.current.scrollTop
                const target = request.productId ? listButtons.current.get(request.productId) : request.addPosition === 'bottom' ? bottomAddRef.current : addRef.current
                ;(target || addRef.current)?.focus({ preventScroll: true })
                if (window.matchMedia('(max-width: 767px)').matches) window.scrollTo({ top: listPosition.current.windowY, behavior: 'instant' })
            } else {
                const target = request.kind === 'create' ? nameRef.current?.disabled ? creationHeadingRef.current : nameRef.current : headingRef.current
                target?.focus({ preventScroll: true })
                const scrollTarget = request.kind === 'create' ? creationHeadingRef.current : target
                if (window.matchMedia('(max-width: 767px)').matches) scrollTarget?.scrollIntoView({ block: 'start', behavior: 'instant' })
            }
        })
        return () => cancelAnimationFrame(frame)
    }, [view, selectedId, expanded])

    useEffect(() => {
        if (!selectedId || selected) return
        focusRequest.current = { kind: 'list', productId: null }
        setSelectedId(null)
        setView('list')
    }, [selectedId, selected])

    // The mutation provider reports verified receipts even when retry was triggered elsewhere.
    useEffect(() => {
        const intent = creationIntent.current
        const operationId = intent?.operationId
        const result = operationId ? productCreationResults?.[operationId] : null
        if (!creationLocked || result?.status !== 'applied') return
        const row = result.changes.find(change => change.entity === 'products' && change.row)?.row
        if (!row || typeof row.id !== 'string') return
        creationIntent.current = null
        setCreationLocked(false)
        setCreationName('')
        setCreationError('')
        if (navigation.current.view === 'create' && navigation.current.expanded) {
            focusRequest.current = { kind: 'editor', origin: intent?.origin }
            setSelectedId(row.id)
            setView('editor')
        } else if (navigation.current.view === 'create') setView('list')
    }, [creationLocked, productCreationResults])

    function rememberListPosition() {
        listPosition.current = { windowY: window.scrollY, scrollTop: listRef.current?.scrollTop || 0 }
    }

    function openOffering(productId: string) {
        rememberListPosition()
        focusRequest.current = { kind: 'editor' }
        setSelectedId(productId)
        setView('editor')
        setShowGuide(false)
    }

    function backToOfferings() {
        focusRequest.current = { kind: 'list', productId: view === 'create' ? null : selectedId, addPosition: creationPosition.current }
        setView('list')
    }

    function startCreation(position: InsertionPosition) {
        rememberListPosition()
        // An unresolved create keeps its original placement, name and receipt.
        if (!creationLocked) creationPosition.current = position
        focusRequest.current = { kind: 'create' }
        setView('create')
    }

    async function createOffering(event: FormEvent) {
        event.preventDefault()
        if (creatingRef.current || creationLocked) return
        const name = creationName.trim()
        if (name.length < 2 || !/[\p{L}\p{N}]/u.test(name)) {
            setCreationError('Give your product or service a name of at least two characters.')
            nameRef.current?.focus()
            return
        }
        creatingRef.current = true
        const generation = navigation.current.generation
        const origin = document.activeElement
        setCreating(true)
        setCreationError('')
        creationIntent.current = { operationId: null, origin }
        try {
            const result = await createEntity('product', { name, price: null }, creationPosition.current)
            if (!mounted.current) return
            const row = result.changes.find(change => change.entity === 'products' && change.row)?.row
            if (result.status === 'applied' && row && typeof row.id === 'string') {
                creationIntent.current = null
                setCreationName('')
                if (navigation.current.generation === generation && navigation.current.view === 'create') {
                    focusRequest.current = { kind: 'editor', origin }
                    setSelectedId(row.id)
                    setView('editor')
                } else if (navigation.current.view === 'create' && !navigation.current.expanded) {
                    // A completed creation must not reopen or scroll a section
                    // the user collapsed, or replace another offering's editor.
                    setView('list')
                }
            } else {
                creationIntent.current = { operationId: result.operationId, origin }
                setCreationLocked(true)
                setCreationError('Adding this offering was not confirmed. Your name has been kept. Check the save status before trying again.')
            }
        } catch {
            if (mounted.current) {
                setCreationLocked(true)
                setCreationError('The result could not be checked. Your name is still here. Reload and check your offerings before adding it again.')
            }
        } finally {
            creatingRef.current = false
            if (mounted.current) setCreating(false)
        }
    }

    async function retrySaves() {
        if (retryingRef.current) return
        if (creationIntent.current && navigation.current.view === 'create') creationIntent.current.origin = document.activeElement
        retryingRef.current = true
        setRetrying(true)
        try {
            await retryPending()
        } catch {
            if (mounted.current) showToast('Save status could not be checked. Your changes have been kept.', 'error')
        } finally {
            retryingRef.current = false
            if (mounted.current) setRetrying(false)
        }
    }

    async function updateOffering(id: string, patch: EditableValues['product']) {
        setPendingFields(current => ({ ...current, [id]: (current[id] || 0) + 1 }))
        try { return await patchEntity('product', id, patch) }
        finally {
            if (mounted.current) setPendingFields(current => ({ ...current, [id]: Math.max(0, (current[id] || 1) - 1) }))
        }
    }

    function selectImage(file: File, productId: string) {
        const selection = ++imageSelection.current
        const reader = new FileReader()
        reader.addEventListener('load', () => {
            if (mounted.current && selection === imageSelection.current && productsRef.current.some(product => product.id === productId)) setCrop({ productId, image: String(reader.result) })
        })
        reader.addEventListener('error', () => {
            if (mounted.current && selection === imageSelection.current) showToast('The image could not be opened. Choose another image.', 'error')
        })
        reader.readAsDataURL(file)
    }

    async function uploadCrop(blob: Blob, signal: AbortSignal) {
        if (!crop) return
        const productId = crop.productId
        setUploading(true)
        try {
            await runProfileMediaAttempt(async attemptSignal => {
                const { url } = await uploadProfileMedia(blob, 'product', userId, attemptSignal)
                if (attemptSignal.aborted) return
                if (!productsRef.current.some(product => product.id === productId)) throw new Error('This offering is no longer available. The image was not attached.')
                if (!await updateOffering(productId, { image_url: url })) throw new Error('The image change was not saved. Your crop has been kept.')
                if (!attemptSignal.aborted && mounted.current) setCrop(null)
            }, { signal })
        } catch (error) {
            if (!signal.aborted) showToast(error instanceof Error ? error.message : 'The image save could not be confirmed. Your crop has been kept.', 'error')
            throw error
        } finally {
            if (mounted.current) setUploading(false)
        }
    }

    const hasPendingFields = Object.values(pendingFields).some(count => count > 0)
    const productState = productMutationState || mutationState
    const failureState = [productState, mutationState].find(state => state.status !== 'saved' && state.status !== 'saving')
    const saving = hasPendingFields || productState.status === 'saving' || mutationState.status === 'saving'
    const failed = !saving && Boolean(failureState)
    const selectedBusy = selected ? Boolean(pendingFields[selected.id] || pendingPayments[selected.id] || uploading) : false
    const selectedDelete = products.find(product => product.id === deleteId)
    const saveStatus = <div role="status" aria-live="polite" data-offering-save-status className={`${view === 'editor' ? 'mb-6 gap-x-3 gap-y-2' : 'gap-x-3 gap-y-2 border-t border-white/15 px-4 py-3 md:px-6'} flex flex-wrap items-center text-sm text-white/85`}><span>{saving ? 'Saving profile changes…' : failed ? failureState?.message || 'Your changes could not be saved.' : 'Profile changes saved.'}</span><SectionHelp title="Saving offerings">Confirmed offerings appear on your public nsso profile. Ordinary fields save automatically. This status covers profile changes, not unsaved PayPal code; PayPal has its own explicit save button and status. An optional nsso sales page has its own publication setting.</SectionHelp>{failed && <button type="button" disabled={retrying} onClick={() => { void retrySaves() }} className="min-h-11 rounded-lg underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-white">{retrying ? 'Checking save status…' : 'Check status and retry'}</button>}</div>

    return <>
        <GlassCard radius="var(--editor-card-radius)" className="w-full [--editor-card-radius:28px] md:[--editor-card-radius:40px]">
            <div className="grid min-w-0 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]" data-editor-card="products" data-offerings-view={view}>
                <aside className={`${view === 'list' ? 'block' : 'hidden'} min-w-0 border-white/15 p-4 md:block md:border-r md:p-6`} aria-label="Your offerings">
                    <TahoeGlassButton ref={addRef} type="button" onClick={() => startCreation('top')} disabled={creating} semanticTint="light" className="min-h-11 w-full px-4 py-3" contentClassName="gap-2 text-left font-semibold text-white">
                        <Plus size={18} aria-hidden="true" /> Add product or service
                    </TahoeGlassButton>
                    <div className="mb-3 mt-5 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white/90">{products.length ? 'Choose an offering to edit.' : 'Your offerings'}</p>
                        <TahoeGlassButton type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', { detail: { initialMessage: 'I want to add a product or service...' } }))} className="h-11 w-11 shrink-0 p-0" contentClassName="text-cyan-300" aria-label="Ask Deity about products and services"><Sparkles size={16} aria-hidden="true" /></TahoeGlassButton>
                    </div>
                    <div ref={listRef} data-offerings-list className="space-y-3 md:max-h-[640px] md:overflow-y-auto md:pr-1">
                        {products.map(product => <TahoeGlassButton key={product.id} ref={node => { if (node) listButtons.current.set(product.id, node); else listButtons.current.delete(product.id) }} type="button" onClick={() => openOffering(product.id)} aria-label={`Edit ${product.name || 'Untitled offering'}`} aria-current={selectedId === product.id ? 'true' : undefined} semanticTint={selectedId === product.id ? 'light' : 'dark'} className="min-h-16 w-full rounded-2xl px-3 py-3" contentClassName="w-full min-w-0 justify-start gap-3 text-left text-white">
                            {product.image_url ? <img src={product.image_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><ImagePlus size={19} aria-hidden="true" /></span>}
                            <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">{product.name || 'Untitled offering'}</span>
                            <span className="flex shrink-0 items-center gap-1 text-xs text-white/85">Edit <ArrowRight size={14} aria-hidden="true" /></span>
                        </TahoeGlassButton>)}
                        {!products.length && <div className="rounded-2xl border border-dashed border-white/25 px-4 py-7 text-center"><ImagePlus className="mx-auto mb-3 text-white/60" size={27} aria-hidden="true" /><p className="font-semibold text-white">Share what you offer</p><p className="mt-2 text-sm leading-relaxed text-white/80">Add your first product or service to your profile.</p></div>}
                    </div>
                    {products.length > 0 && <TahoeGlassButton ref={bottomAddRef} type="button" onClick={() => startCreation('bottom')} disabled={creating} aria-label="Add product or service at bottom" className="mt-4 min-h-11 w-full px-4 py-3" contentClassName="gap-2 text-left font-semibold text-white"><Plus size={18} aria-hidden="true" />Add product or service</TahoeGlassButton>}
                    <div className="mt-5 border-t border-white/15 pt-3">
                        <button type="button" aria-expanded={futureOpen} aria-controls="offerings-coming-soon" onClick={() => setFutureOpen(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-white/70 underline decoration-white/35 underline-offset-4 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white">Coming soon <ChevronDown size={14} aria-hidden="true" className={futureOpen ? 'rotate-180' : ''} /></button>
                        <div id="offerings-coming-soon" hidden={!futureOpen} className="space-y-2 pt-2 text-sm text-white/80"><div className="flex items-center justify-between gap-2"><span>Web3 wallet</span><SectionHelp title="Web3 wallet">Wallet sign-in and crypto payments are planned for a future release. This integration is not active.</SectionHelp></div><div className="flex items-center justify-between gap-2"><span>Facebook Pixel</span><SectionHelp title="Facebook Pixel">Conversion tracking is planned for a future release. This integration is not active.</SectionHelp></div></div>
                    </div>
                </aside>

                <div className={`${view === 'list' ? 'hidden' : 'block'} min-w-0 p-4 md:block md:p-7 lg:p-9`}>
                    <div hidden={view !== 'create'}>
                        <TahoeGlassButton type="button" onClick={backToOfferings} disabled={creating} className="mb-5 min-h-11 px-3 py-2" contentClassName="gap-2 text-sm text-white"><ArrowLeft size={17} aria-hidden="true" />Back to your offerings</TahoeGlassButton>
                        <h3 ref={creationHeadingRef} tabIndex={-1} className="mb-5 scroll-mt-40 text-xl font-bold text-white outline-none">Add product or service</h3>
                        <form onSubmit={event => { void createOffering(event) }} className="space-y-5">
                            <div><label htmlFor="new-offering-name" className="mb-2 block text-sm font-medium text-white">Offering name</label><TahoeGlassField tone="light" surfaceClassName="px-3 py-3"><input ref={nameRef} id="new-offering-name" type="text" value={creationName} onChange={event => setCreationName(event.target.value)} maxLength={300} required minLength={2} disabled={creating || creationLocked} aria-invalid={Boolean(creationError)} aria-describedby={creationError ? 'offering-create-error' : undefined} placeholder="e.g. Career coaching session" className="scroll-mt-40 text-base text-white" /></TahoeGlassField></div>
                            <div className="flex items-center gap-1"><span className="text-sm font-medium text-white/85">Added to your public profile</span><SectionHelp title="Adding an offering">Choose a meaningful name before adding an offering. Its product card becomes public when creation is confirmed; ordinary fields then save automatically.</SectionHelp></div>
                            {creationError && <p id="offering-create-error" role="alert" className="text-sm leading-relaxed text-rose-100">{creationError}</p>}
                            <div className="flex flex-wrap gap-3"><TahoeGlassButton type="submit" disabled={creating || creationLocked} semanticTint="light" className="min-h-11 px-4 py-3" contentClassName="gap-2 font-semibold text-white">{creating && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}{creating ? 'Adding offering…' : 'Add to public profile'}</TahoeGlassButton>{!creationLocked && <TahoeGlassButton type="button" disabled={creating} onClick={backToOfferings} className="min-h-11 px-4 py-3" contentClassName="text-white/85">Cancel</TahoeGlassButton>}</div>
                        </form>
                    </div>

                    <div hidden={view === 'create' || !selected} data-offering-editor>
                        {selected && <>
                            <TahoeGlassButton type="button" onClick={backToOfferings} className="mb-4 min-h-11 px-3 py-2 md:hidden" contentClassName="gap-2 text-sm text-white"><ArrowLeft size={17} aria-hidden="true" />Back to your offerings</TahoeGlassButton>
                            <h3 ref={headingRef} tabIndex={-1} className="scroll-mt-40 break-words text-xl font-bold text-white outline-none md:text-2xl">{selected.name || 'Untitled offering'}</h3>
                            <p className="mb-2 mt-2 text-xs font-medium text-white/75">Public profile offering</p>
                            {view === 'editor' && saveStatus}
                            <fieldset className="min-w-0 space-y-4"><legend className="mb-3 text-base font-bold text-white">Offering details</legend>
                                <div><label className="mb-2 block text-xs uppercase tracking-widest text-white/75" htmlFor="offering-name">Name</label><TahoeGlassField tone="light" surfaceClassName="px-3 py-3"><input id="offering-name" type="text" aria-label="Product name" maxLength={300} value={selected.name} onChange={event => { void updateOffering(selected.id, { name: event.target.value }) }} className="text-base font-semibold text-white" /></TahoeGlassField></div>
                                <div><label className="mb-2 block text-xs uppercase tracking-widest text-white/75" htmlFor="offering-price">Price (include the currency)</label><TahoeGlassField tone="light" surfaceClassName="px-3 py-3"><input id="offering-price" type="text" aria-label="Price (include the currency)" maxLength={200} value={selected.price || ''} onChange={event => { void updateOffering(selected.id, { price: event.target.value }) }} placeholder="e.g. $50 or Free" className="text-base text-white" /></TahoeGlassField></div>
                                <div><label className="mb-2 block text-xs uppercase tracking-widest text-white/75" htmlFor="offering-description">Description</label><TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="min-h-[160px] resize-y px-3 py-3"><textarea id="offering-description" aria-label="Product description" maxLength={32768} value={selected.description || ''} onChange={event => { void updateOffering(selected.id, { description: event.target.value }) }} placeholder="Describe your offering…" className="text-base leading-relaxed text-white" /></TahoeGlassField></div>
                            </fieldset>
                            <section className="my-7 border-t border-white/15 pt-6" aria-labelledby="offering-image-heading"><h4 id="offering-image-heading" className="mb-4 text-base font-bold text-white">Image</h4><div className="flex flex-wrap items-center gap-4">{selected.image_url && <img src={selected.image_url} alt={`Image for ${selected.name}`} className="h-24 w-24 shrink-0 rounded-2xl border border-white/20 object-cover" />}<TahoeGlassSurface variant="button" radius={12} tone="light" className="min-h-11 focus-within:outline-2 focus-within:outline-white" contentClassName="flex items-center justify-center"><label className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm text-white">{uploading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Upload size={17} aria-hidden="true" />}{selected.image_url ? 'Change image' : 'Upload image'}<input type="file" aria-label={`Upload image for ${selected.name || 'product'}`} accept="image/*" className="sr-only" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) selectImage(file, selected.id); event.target.value = '' }} /></label></TahoeGlassSurface></div></section>
                        </>}

                        {/* These slots never unmount on list/back, selection, toggles or section collapse. */}
                        <section className="border-t border-white/15 pt-6" aria-labelledby="offering-purchase-heading">
                            <h4 id="offering-purchase-heading" className="mb-4 text-base font-bold text-white">Purchase options</h4>
                            {selected && <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" className="mb-4" contentClassName="p-4"><div className="flex min-h-11 items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-1"><span className="text-sm font-semibold text-white">Purchase URL</span><SectionHelp title="Purchase URL">Send buyers to an existing shop, booking page or checkout. That provider handles payment and delivery; the displayed price here does not change its checkout.</SectionHelp></div><Toggle checked={selected.purchase_link_active} label="Enable purchase link" onClick={() => { void updateOffering(selected.id, { purchase_link_active: !selected.purchase_link_active }) }} /></div>{selected.purchase_link_active && <TahoeGlassField tone="light" surfaceClassName="mt-3 px-3 py-3"><input type="url" aria-label="Purchase link" value={selected.purchase_link || ''} onChange={event => { void updateOffering(selected.id, { purchase_link: event.target.value }) }} placeholder="https://…" className="text-base text-white" /></TahoeGlassField>}</TahoeGlassSurface>}
                            <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" contentClassName="p-4">
                                {selected && <div className="mb-3 flex min-h-11 items-center justify-between gap-3"><div className="flex min-w-0 flex-wrap items-center gap-1"><span className="text-sm font-semibold text-white">PayPal checkout</span><SectionHelp title="PayPal checkout">Paste PayPal button code, validate it, then choose Save payment button. PayPal controls the recipient, price and checkout; delivery remains your responsibility or your provider’s.</SectionHelp></div><Toggle checked={selected.paypal_active} label="Enable PayPal button code" onClick={() => { void updateOffering(selected.id, { paypal_active: !selected.paypal_active }) }} /></div>}
                                {selected?.paypal_active && <button type="button" aria-expanded={showGuide} aria-controls="paypal-guide" onClick={() => setShowGuide(value => !value)} className="mb-3 min-h-11 rounded-lg text-sm text-white/80 underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-white">Where do I find the code?</button>}
                                {selected?.paypal_active && showGuide && <TahoeGlassDirectBackdropBoundaryContext.Provider value={true}><TahoeGlassSurface id="paypal-guide" variant="popover" radius={12} tone="light" data-tahoe-readable-overlay="true" className="mb-4 overflow-hidden" contentClassName="rounded-[inherit] bg-[#202126]"><div className="flex items-center justify-between gap-3 border-b border-white/10 p-3"><span className="text-xs font-medium text-white/85">PayPal Dashboard &gt; Copy Code</span><TahoeGlassButton type="button" onClick={() => setShowGuide(false)} aria-label="Close PayPal guide" className="h-11 w-11 p-0" contentClassName="text-white"><X size={16} /></TahoeGlassButton></div><a href="https://youtu.be/9KihkWujsaI?si=hwAHbrQDLvOog6U8&t=28" target="_blank" rel="noopener noreferrer" className="block p-4"><img src="/guide-paypal.png" alt="Guide: Copy the Button HTML Code. Open video tutorial." className="max-w-full rounded-lg border border-white/15" /></a></TahoeGlassSurface></TahoeGlassDirectBackdropBoundaryContext.Provider>}
                                {products.map(product => <div key={`${userId}:${product.id}`} hidden={selectedId !== product.id || !product.paypal_active}>
                                    <PayPalCodeEditor productId={product.id} accountId={userId} active={expanded && view === 'editor' && selectedId === product.id && product.paypal_active} getRevision={getRevision} refreshRevision={refreshProfile} initialHtml={product.paypal_html} onSavingChange={value => setPendingPayments(current => current[product.id] === value ? current : { ...current, [product.id]: value })} onSaved={async () => { if (productsRef.current.some(row => row.id === product.id) && !await refreshProfile()) throw new Error('The latest product details could not be refreshed.') }} />
                                </div>)}
                            </TahoeGlassSurface>
                        </section>

                        {selected && <>
                            <section className="mt-7 border-t border-white/15 pt-6" aria-labelledby="offering-sales-page-heading"><div className="mb-3 flex items-center gap-1"><h4 id="offering-sales-page-heading" className="text-base font-bold text-white">Optional sales page</h4><SectionHelp title="nsso sales page">Build a separate nsso page with more detail about this offering. It does not process payments or deliver products. Buyers use your enabled purchase URL or PayPal checkout.</SectionHelp></div><TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" contentClassName="p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-white">Publish nsso sales page</span><Toggle checked={selected.sales_page_published ?? selected.sales_page_active} label="Enable product sales page" onClick={() => { const publish = !(selected.sales_page_published ?? selected.sales_page_active); void updateOffering(selected.id, { sales_page_active: publish, sales_page_published: publish }) }} /></div><div className="mt-2 flex items-center gap-1"><span className="text-xs text-white/80">{selected.sales_page_published == null ? 'Legacy public URL' : selected.sales_page_published ? 'Sales page is public' : 'Sales page is not published'}</span>{selected.sales_page_published == null && <SectionHelp title="Legacy sales page">This existing sales-page URL may already be public. Choose a publication setting to explicitly change its visibility. Your profile offering stays public.</SectionHelp>}</div><div className="mt-4 flex flex-wrap gap-3"><TahoeGlassButton type="button" onClick={() => window.open(`/dashboard/products/${selected.id}/creator`, '_blank', 'noopener,noreferrer')} className="min-h-11 px-4 py-3" contentClassName="gap-2 text-sm text-white"><Layout size={16} aria-hidden="true" />Open Sales Page Creator</TahoeGlassButton>{selected.sales_page_published == null && !selected.sales_page_active && <TahoeGlassButton type="button" onClick={() => { void updateOffering(selected.id, { sales_page_published: false, sales_page_active: false }) }} className="min-h-11 px-3 py-3" contentClassName="text-sm text-white/85">Unpublish legacy page</TahoeGlassButton>}</div></TahoeGlassSurface></section>
                            <div className="mt-8 border-t border-white/15 pt-5"><TahoeGlassButton type="button" disabled={selectedBusy} onClick={() => setDeleteId(selected.id)} className="min-h-11 px-3 py-2" contentClassName="gap-2 text-sm text-rose-200"><Trash2 size={16} aria-hidden="true" />Delete offering</TahoeGlassButton>{selectedBusy && <span className="ml-3 text-xs text-white/70">Wait for saving to finish.</span>}</div>
                        </>}
                    </div>
                    {!selected && view !== 'create' && <div className="hidden min-h-[240px] items-center justify-center md:flex"><p className="text-center text-sm text-white/80">{products.length ? 'Choose an offering to edit, or select “Add product or service”.' : 'Select “Add product or service” to get started.'}</p></div>}
                </div>
            </div>
            {view !== 'editor' && saveStatus}
        </GlassCard>
        {crop && <ImageCropperModal isOpen={true} onClose={() => { if (!uploading) setCrop(null) }} imageSrc={crop.image} aspectRatio={1} onCropComplete={uploadCrop} loading={uploading} />}
        <ConfirmDeleteDialog open={Boolean(deleteId)} name={selectedDelete?.name || 'offering'} onClose={() => setDeleteId(null)} onConfirm={async () => {
            if (!deleteId || pendingFields[deleteId] || pendingPayments[deleteId]) return false
            if (!await removeEntity('product', deleteId)) return false
            focusRequest.current = { kind: 'list', productId: null }
            setSelectedId(null)
            setView('list')
            return true
        }} />
    </>
}
