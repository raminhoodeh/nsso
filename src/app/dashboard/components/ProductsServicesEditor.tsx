'use client'

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, ImagePlus, Layout, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useProfile } from '@/components/providers/ProfileProvider'
import PayPalCodeEditor from '@/components/payments/PayPalCodeEditor'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import { useToast } from '@/components/ui/Toast'
import { TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { LightButton, LightCloseButton, lightButtonClass } from '@/components/ui/LightButton'
import { GlassSwitch } from '@/components/ui/GlassSwitch'
import { TahoeGlassDirectBackdropBoundaryContext } from '@/components/ui/tahoe-glass/TahoeGlassBoundaryContext'
import { runProfileMediaAttempt, uploadProfileMedia } from '@/lib/profile-media-client'
import type { EditableValues } from '@/lib/profile-mutations'
import GlassCard from './DashboardGlassCard'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import SectionHelp from './SectionHelp'
import AskDeityButton from '@/components/ui/AskDeityButton'
import SalesPageCreator from '@/components/products/SalesPageCreator'
import { offeringEditorHref, offeringEditorId, readOfferingPosition, rememberOfferingPosition } from '@/lib/offering-navigation'
import { LIGHT_PANEL } from '@/components/ui/light-panel'
import { cn } from '@/lib/utils'
import { purchaseButtonLabel } from '@/lib/payments/product-presentation'
import { safeWebUrl } from '@/lib/urls'

type View = 'list' | 'editor' | 'create'
type InsertionPosition = 'top' | 'bottom'
type FocusRequest = ({ kind: 'editor' | 'create' } | { kind: 'list'; productId: string | null; addPosition?: InsertionPosition }) & { origin?: Element | null }

/** The section stays mounted while collapsed so payment drafts and receipts keep their owner. */
export default function ProductsServicesEditor({ userId, expanded, requestedOffering, requestedCreator = false }: { userId: string; expanded: boolean; requestedOffering?: string | null; requestedCreator?: boolean }) {
    const router = useRouter()
    const { products, loading, createEntity, patchEntity, removeEntity, mutationState, productMutationState, productCreationResults, retryPending, refreshProfile, getRevision } = useProfile()
    const { showToast } = useToast()
    const requestedId = offeringEditorId(requestedOffering)
    const requestedRoute = `${requestedId || ''}|${requestedCreator ? 'creator' : 'editor'}`
    const observedRoute = useRef(requestedRoute)
    const pendingRoute = useRef(true)
    const localRouteEcho = useRef<string | null>(null)
    const [view, setView] = useState<View>(requestedId ? 'editor' : 'list')
    const [selectedId, setSelectedId] = useState<string | null>(requestedId)
    const [creatorId, setCreatorId] = useState<string | null>(requestedCreator ? requestedId : null)
    const selected = products.find(product => product.id === selectedId) || null
    const purchaseUrl = safeWebUrl(selected?.purchase_link)
    const secondaryPurchaseUrl = safeWebUrl(selected?.secondary_purchase_link)
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
    const [dirtyPayments, setDirtyPayments] = useState<Record<string, boolean>>({})
    const [crop, setCrop] = useState<{ productId: string; image: string } | null>(null)
    const [uploading, setUploading] = useState(false)
    const listRef = useRef<HTMLDivElement>(null)
    const creatorRef = useRef<HTMLDivElement>(null)
    const creatorWasOpen = useRef(Boolean(creatorId))
    const restoreInitialPosition = useRef(Boolean(requestedId && !requestedCreator))
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
            const active = document.activeElement
            const modal = document.querySelector('dialog:modal') || Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(element => !element.closest('[hidden],[inert],[aria-hidden="true"]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
            // Navigation focus is deferred until the editor/list is mounted.
            // A newer field focus wins over its initiating control. Recovery
            // without a known origin can focus only when nothing else has it.
            const movedFocus = request.origin === undefined ? active !== document.body : active !== request.origin && active !== document.body
            if (modal || movedFocus) return
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
        if (loading || !selectedId || selected) return
        focusRequest.current = { kind: 'list', productId: null }
        setSelectedId(null)
        setView('list')
    }, [loading, selectedId, selected])

    const availableIds = products.map(product => product.id).join(',')
    useEffect(() => {
        if (requestedOffering === undefined) return
        if (observedRoute.current !== requestedRoute) {
            observedRoute.current = requestedRoute
            pendingRoute.current = localRouteEcho.current !== requestedRoute
            localRouteEcho.current = null
        }
        // A provider receipt may add/remove rows without being navigation.
        // Reapply URL context only for a new route or its initial pending load.
        if (loading || !pendingRoute.current) return
        if (!requestedId) { pendingRoute.current = false; setCreatorId(null); setView('list'); return }
        if (!productsRef.current.some(product => product.id === requestedId)) return
        pendingRoute.current = false
        setSelectedId(requestedId)
        setView('editor')
        setCreatorId(requestedCreator ? requestedId : null)
    }, [requestedOffering, requestedId, requestedCreator, requestedRoute, loading, availableIds])

    const creatorVisible = Boolean(creatorId && selectedId === creatorId && selected)
    useEffect(() => {
        if (!expanded) return
        const returning = creatorWasOpen.current && !creatorVisible
        creatorWasOpen.current = creatorVisible
        if (creatorVisible) {
            const frame = requestAnimationFrame(() => creatorRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }))
            return () => cancelAnimationFrame(frame)
        }
        if (!selectedId || (!returning && !restoreInitialPosition.current)) return
        restoreInitialPosition.current = false
        const position = readOfferingPosition(userId, selectedId)
        if (!position) return
        const origin = document.activeElement
        let second = 0
        const frame = requestAnimationFrame(() => {
            second = requestAnimationFrame(() => {
                const active = document.activeElement
                const modal = document.querySelector('dialog:modal') || Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(element => !element.closest('[hidden],[inert],[aria-hidden="true"]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
                if (modal || (active !== origin && active !== document.body)) return
                if (listRef.current) listRef.current.scrollTop = position.listY
                headingRef.current?.focus({ preventScroll: true })
                window.scrollTo({ top: position.windowY, behavior: 'instant' })
            })
        })
        return () => { cancelAnimationFrame(frame); cancelAnimationFrame(second) }
    }, [creatorVisible, expanded, requestedId, selectedId, userId])

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
            router.replace(offeringEditorHref(row.id), { scroll: false })
        } else if (navigation.current.view === 'create') setView('list')
    }, [creationLocked, productCreationResults, router])

    function rememberListPosition() {
        listPosition.current = { windowY: window.scrollY, scrollTop: listRef.current?.scrollTop || 0 }
    }

    function openOffering(productId: string) {
        rememberListPosition()
        focusRequest.current = { kind: 'editor', origin: document.activeElement }
        setSelectedId(productId)
        setView('editor')
        setShowGuide(false)
        setCreatorId(null)
        router.replace(offeringEditorHref(productId), { scroll: false })
    }

    function backToOfferings() {
        focusRequest.current = { kind: 'list', productId: view === 'create' ? null : selectedId, addPosition: creationPosition.current, origin: document.activeElement }
        setView('list')
        clearOfferingRoute()
    }

    function clearOfferingRoute() {
        pendingRoute.current = false
        localRouteEcho.current = '|editor'
        router.replace('/dashboard?view=profile', { scroll: false })
    }

    function openCreator() {
        if (!selected) return
        rememberOfferingPosition(userId, selected.id, window.scrollY, listRef.current?.scrollTop || 0)
        setCreatorId(selected.id)
        router.push(offeringEditorHref(selected.id, 'creator'), { scroll: false })
    }

    function backFromCreator() {
        if (!selectedId) return
        setCreatorId(null)
        router.replace(offeringEditorHref(selectedId), { scroll: false })
    }

    function startCreation(position: InsertionPosition) {
        rememberListPosition()
        // An unresolved create keeps its original placement, name and receipt.
        if (!creationLocked) creationPosition.current = position
        focusRequest.current = { kind: 'create', origin: document.activeElement }
        clearOfferingRoute()
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
                    router.replace(offeringEditorHref(row.id), { scroll: false })
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
    const saveStatus = (saving || failed) && <div role="status" aria-live="polite" data-offering-save-status className={`${view === 'editor' ? 'mb-6 gap-x-3 gap-y-2' : 'gap-x-3 gap-y-2 border-t border-white/15 px-4 py-3 md:px-6'} flex flex-wrap items-center text-sm text-white/85`}><span>{saving ? 'Saving profile changes…' : failureState?.message || 'Your changes could not be saved.'}</span><SectionHelp title="Saving offerings">Confirmed offerings appear on your public nsso profile. Ordinary fields save automatically. This status covers profile changes, not unsaved PayPal code; PayPal has its own explicit save button and status. An optional nsso sales page has its own publication setting.</SectionHelp>{failed && <LightButton type="button" disabled={retrying} onClick={() => { void retrySaves() }} className="min-h-11 px-4 py-2" contentClassName="text-sm">{retrying ? 'Checking save status…' : 'Check status and retry'}</LightButton>}</div>

    return <>
        <GlassCard radius="var(--editor-card-radius)" className="w-full [--editor-card-radius:28px] md:[--editor-card-radius:40px]">
            <div hidden={creatorVisible} className={creatorVisible ? 'hidden' : 'grid min-w-0 md:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]'} data-editor-card="products" data-offerings-view={view}>
                <aside className={`${view === 'list' ? 'block' : 'hidden'} min-w-0 border-white/15 p-4 md:block md:border-r md:p-6`} aria-label="Your offerings">
                    <LightButton ref={addRef} type="button" onClick={() => startCreation('top')} disabled={creating} className="min-h-11 w-full px-4 py-3" contentClassName="gap-2 text-left font-semibold">
                        <Plus size={18} aria-hidden="true" /> Add product or service
                    </LightButton>
                    <div className="mb-3 mt-5 flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white/90">{products.length ? 'Choose an offering to edit.' : 'Your offerings'}</p>
                        <AskDeityButton onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', { detail: { initialMessage: 'I want to add a product or service...' } }))} aria-label="Ask Deity about products and services" />
                    </div>
                    <div ref={listRef} data-offerings-list className="space-y-3 md:max-h-[640px] md:overflow-y-auto md:pr-1">
                        {products.map(product => <LightButton key={product.id} ref={node => { if (node) listButtons.current.set(product.id, node); else listButtons.current.delete(product.id) }} type="button" onClick={() => openOffering(product.id)} aria-label={`Edit ${product.name || 'Untitled offering'}`} aria-current={selectedId === product.id ? 'true' : undefined} className="min-h-16 w-full rounded-2xl px-3 py-3 aria-[current=true]:ring-2 aria-[current=true]:ring-slate-500/70" contentClassName="w-full min-w-0 justify-start gap-3 text-left">
                            {product.image_url ? <img src={product.image_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-200"><ImagePlus size={19} aria-hidden="true" /></span>}
                            <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug">{product.name || 'Untitled offering'}</span>
                            <Pencil className="shrink-0" size={16} aria-hidden="true" />
                        </LightButton>)}
                        {!products.length && <div className="rounded-2xl border border-dashed border-white/25 px-4 py-7 text-center"><ImagePlus className="mx-auto mb-3 text-white/60" size={27} aria-hidden="true" /><p className="font-semibold text-white">Share what you offer</p><p className="mt-2 text-sm leading-relaxed text-white/80">Add your first product or service to your profile.</p></div>}
                    </div>
                    {products.length > 0 && <LightButton ref={bottomAddRef} type="button" onClick={() => startCreation('bottom')} disabled={creating} aria-label="Add product or service at bottom" className="mt-4 min-h-11 w-full px-4 py-3" contentClassName="gap-2 text-left font-semibold"><Plus size={18} aria-hidden="true" />Add product or service</LightButton>}
                    <div className="mt-5 border-t border-white/15 pt-3">
                        <button type="button" aria-expanded={futureOpen} aria-controls="offerings-coming-soon" onClick={() => setFutureOpen(value => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-white/70 underline decoration-white/35 underline-offset-4 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white">Coming soon <ChevronDown size={14} aria-hidden="true" className={futureOpen ? 'rotate-180' : ''} /></button>
                        <div id="offerings-coming-soon" hidden={!futureOpen} className="space-y-2 pt-2 text-sm text-white/80"><div className="flex items-center justify-between gap-2"><span>Web3 wallet</span><SectionHelp title="Web3 wallet">Wallet sign-in and crypto payments are planned for a future release. This integration is not active.</SectionHelp></div><div className="flex items-center justify-between gap-2"><span>Facebook Pixel</span><SectionHelp title="Facebook Pixel">Conversion tracking is planned for a future release. This integration is not active.</SectionHelp></div></div>
                    </div>
                </aside>

                <div className={`${view === 'list' ? 'hidden' : 'block'} min-w-0 p-4 md:block md:p-7 lg:p-9`}>
                    <div hidden={view !== 'create'}>
                        <LightButton type="button" onClick={backToOfferings} disabled={creating} className="mb-5 min-h-11 px-3 py-2" contentClassName="gap-2 text-sm"><ArrowLeft size={17} aria-hidden="true" />Back to your offerings</LightButton>
                        <h3 ref={creationHeadingRef} tabIndex={-1} className="mb-5 scroll-mt-40 text-xl font-bold text-white outline-none">Add product or service</h3>
                        <form onSubmit={event => { void createOffering(event) }} className="space-y-5">
                            <div><label htmlFor="new-offering-name" className="mb-2 block text-sm font-medium text-white">Offering name</label><TahoeGlassField tone="light" surfaceClassName="px-3 py-3"><input ref={nameRef} id="new-offering-name" type="text" value={creationName} onChange={event => setCreationName(event.target.value)} maxLength={300} required minLength={2} disabled={creating || creationLocked} aria-invalid={Boolean(creationError)} aria-describedby={creationError ? 'offering-create-error' : undefined} placeholder="e.g. Career coaching session" className="scroll-mt-40 text-base text-white" /></TahoeGlassField></div>
                            <div className="flex items-center gap-1"><span className="text-sm font-medium text-white/85">Added to your public profile</span><SectionHelp title="Adding an offering">Choose a meaningful name before adding an offering. Its product card becomes public when creation is confirmed; ordinary fields then save automatically.</SectionHelp></div>
                            {creationError && <p id="offering-create-error" role="alert" className="text-sm leading-relaxed text-rose-100">{creationError}</p>}
                            <div className="flex flex-wrap gap-3"><LightButton type="submit" disabled={creating || creationLocked} className="min-h-11 px-4 py-3" contentClassName="gap-2 font-semibold">{creating && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}{creating ? 'Adding offering…' : 'Add to public profile'}</LightButton>{!creationLocked && <LightButton type="button" disabled={creating} onClick={backToOfferings} className="min-h-11 px-4 py-3">Cancel</LightButton>}</div>
                        </form>
                    </div>

                    <div hidden={view === 'create' || !selected} data-offering-editor>
                        {selected && <>
                            <LightButton type="button" onClick={backToOfferings} className="mb-4 min-h-11 px-3 py-2 md:hidden" contentClassName="gap-2 text-sm"><ArrowLeft size={17} aria-hidden="true" />Back to your offerings</LightButton>
                            <h3 ref={headingRef} tabIndex={-1} className="scroll-mt-40 break-words text-xl font-bold text-white outline-none md:text-2xl">{selected.name || 'Untitled offering'}</h3>
                            <p className="mb-2 mt-2 text-xs font-medium text-white/75">Public profile offering</p>
                            {view === 'editor' && saveStatus}
                            <fieldset className="min-w-0 space-y-4"><legend className="mb-3 text-base font-bold text-white">Offering details</legend>
                                <div><label className="mb-2 block text-xs uppercase tracking-widest text-white/75" htmlFor="offering-name">Name</label><TahoeGlassField tone="light" surfaceClassName="px-3 py-3"><input id="offering-name" type="text" aria-label="Product name" maxLength={300} value={selected.name} onChange={event => { void updateOffering(selected.id, { name: event.target.value }) }} className="text-base font-semibold text-white" /></TahoeGlassField></div>
                                <div><label className="mb-2 block text-xs uppercase tracking-widest text-white/75" htmlFor="offering-price">Price (include the currency)</label><TahoeGlassField tone="light" surfaceClassName="px-3 py-3"><input id="offering-price" type="text" aria-label="Price (include the currency)" maxLength={200} value={selected.price || ''} onChange={event => { void updateOffering(selected.id, { price: event.target.value }) }} placeholder="e.g. $50 or Free" className="text-base text-white" /></TahoeGlassField></div>
                                <div><label className="mb-2 block text-xs uppercase tracking-widest text-white/75" htmlFor="offering-description">Description</label><TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="min-h-[160px] resize-y px-3 py-3"><textarea id="offering-description" aria-label="Product description" maxLength={32768} value={selected.description || ''} onChange={event => { void updateOffering(selected.id, { description: event.target.value }) }} placeholder="Describe your offering…" className="text-base leading-relaxed text-white" /></TahoeGlassField></div>
                            </fieldset>
                            <section className="my-7 border-t border-white/15 pt-6" aria-labelledby="offering-image-heading"><h4 id="offering-image-heading" className="mb-4 text-base font-bold text-white">Image</h4><div className="flex flex-wrap items-center gap-4">{selected.image_url && <img src={selected.image_url} alt={`Image for ${selected.name}`} className="h-24 w-24 shrink-0 rounded-2xl border border-white/20 object-cover" />}<label className={cn(lightButtonClass, 'cursor-pointer px-4 py-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40')}>{uploading ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <Upload size={17} aria-hidden="true" />}{selected.image_url ? 'Change image' : 'Upload image'}<input type="file" aria-label={`Upload image for ${selected.name || 'product'}`} accept="image/*" className="sr-only" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) selectImage(file, selected.id); event.target.value = '' }} /></label></div></section>
                        </>}

                        {/* These slots never unmount on list/back, selection, toggles or section collapse. */}
                        <section className="border-t border-white/15 pt-4" aria-labelledby="offering-purchase-heading">
                            <h4 id="offering-purchase-heading" className="mb-2 text-base font-bold text-white">Purchase options</h4>
                            {selected && <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" className="mb-3" contentClassName="p-3">
                                <div className="flex min-h-11 items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-1"><span className="text-sm font-semibold text-white">Purchase URL</span><SectionHelp title="Purchase URL">Send buyers to an existing shop, booking page or checkout. That provider handles payment and delivery; the displayed price here does not change its checkout.</SectionHelp></div>
                                    <GlassSwitch checked={selected.purchase_link_active} aria-label="Enable purchase link" onClick={() => { void updateOffering(selected.id, { purchase_link_active: !selected.purchase_link_active }) }} />
                                </div>
                                {selected.purchase_link_active && <>
                                    <TahoeGlassField tone="light" surfaceClassName="mt-3 px-3 py-3"><input type="url" aria-label="Purchase link" value={selected.purchase_link || ''} onChange={event => { void updateOffering(selected.id, { purchase_link: event.target.value }) }} placeholder="https://…" className="text-base text-white" /></TahoeGlassField>
                                    {purchaseUrl && <p className="mt-2 text-xs text-white/75">Button preview: {purchaseButtonLabel(purchaseUrl)}</p>}
                                    <label htmlFor="offering-secondary-purchase-link" className="mt-3 block text-xs font-medium text-white/75">Second purchase link (optional)</label>
                                    <TahoeGlassField tone="light" surfaceClassName="mt-2 px-3 py-3"><input id="offering-secondary-purchase-link" type="url" value={selected.secondary_purchase_link || ''} onChange={event => { void updateOffering(selected.id, { secondary_purchase_link: event.target.value }) }} placeholder="https://…" className="text-base text-white" /></TahoeGlassField>
                                    {secondaryPurchaseUrl && <p className="mt-2 text-xs text-white/75">Button preview: {purchaseButtonLabel(secondaryPurchaseUrl)}</p>}
                                </>}
                            </TahoeGlassSurface>}
                            <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" contentClassName="p-3">
                                {selected && <div className={cn('flex min-h-11 items-center justify-between gap-3', selected.paypal_active && 'mb-2')}><div className="flex min-w-0 flex-wrap items-center gap-1"><span className="text-sm font-semibold text-white">PayPal checkout</span><SectionHelp title="PayPal checkout">Paste PayPal button code, validate it, then choose Save payment button. PayPal controls the recipient, price and checkout; delivery remains your responsibility or your provider’s.</SectionHelp></div><GlassSwitch checked={selected.paypal_active} aria-label="Enable PayPal button code" onClick={() => { void updateOffering(selected.id, { paypal_active: !selected.paypal_active }) }} /></div>}
                                {selected?.paypal_active && <button type="button" aria-expanded={showGuide} aria-controls="paypal-guide" onClick={() => setShowGuide(value => !value)} className="mb-3 min-h-11 rounded-lg text-sm text-white/80 underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-white">Where do I find the code?</button>}
                                {selected?.paypal_active && showGuide && <TahoeGlassDirectBackdropBoundaryContext.Provider value={true}><TahoeGlassSurface id="paypal-guide" variant="popover" radius={12} tone="dark" data-tahoe-readable-overlay="true" className="mb-4 overflow-hidden" contentClassName={cn(LIGHT_PANEL.surface, 'rounded-[inherit]')}><div className="flex items-center justify-between gap-3 border-b border-slate-500/20 p-3"><span className="text-xs font-medium text-slate-700">PayPal Dashboard &gt; Copy Code</span><LightCloseButton type="button" onClick={() => setShowGuide(false)} aria-label="Close PayPal guide" /></div><a href="https://youtu.be/9KihkWujsaI?si=hwAHbrQDLvOog6U8&t=28" target="_blank" rel="noopener noreferrer" className={cn(LIGHT_PANEL.focus, 'block rounded-xl p-4')}><img src="/guide-paypal.png" alt="Guide: Copy the Button HTML Code. Open video tutorial." className="max-w-full rounded-lg border border-white/80" /></a></TahoeGlassSurface></TahoeGlassDirectBackdropBoundaryContext.Provider>}
                                {products.map(product => <div key={`${userId}:${product.id}`} hidden={selectedId !== product.id || !product.paypal_active}>
                                    <PayPalCodeEditor productId={product.id} accountId={userId} active={expanded && !creatorVisible && view === 'editor' && selectedId === product.id && product.paypal_active} getRevision={getRevision} refreshRevision={refreshProfile} initialHtml={product.paypal_html} onDirtyChange={value => setDirtyPayments(current => current[product.id] === value ? current : { ...current, [product.id]: value })} onSavingChange={value => setPendingPayments(current => current[product.id] === value ? current : { ...current, [product.id]: value })} onSaved={async () => { if (productsRef.current.some(row => row.id === product.id) && !await refreshProfile()) throw new Error('The latest product details could not be refreshed.') }} />
                                </div>)}
                            </TahoeGlassSurface>
                        </section>

                        {selected && <>
                            <section className="mt-5 border-t border-white/15 pt-4" aria-labelledby="offering-sales-page-heading"><div className="mb-3 flex items-center gap-1"><h4 id="offering-sales-page-heading" className="text-base font-bold text-white">Optional sales page</h4><SectionHelp title="nsso sales page">Build a separate nsso page with more detail about this offering. It does not process payments or deliver products. Buyers use your enabled purchase URL or PayPal checkout.</SectionHelp></div><TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={16} tone="light" contentClassName="p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-white">Publish nsso sales page</span><GlassSwitch checked={selected.sales_page_published ?? selected.sales_page_active} aria-label="Enable product sales page" onClick={() => { const publish = !(selected.sales_page_published ?? selected.sales_page_active); void updateOffering(selected.id, { sales_page_active: publish, sales_page_published: publish }) }} /></div><div className="mt-1 flex items-center gap-1"><span className="text-xs text-white/80">{selected.sales_page_published == null ? 'Legacy public URL' : selected.sales_page_published ? 'Sales page is public' : 'Sales page is not published'}</span>{selected.sales_page_published == null && <SectionHelp title="Legacy sales page">This existing sales-page URL may already be public. Choose a publication setting to explicitly change its visibility. Your profile offering stays public.</SectionHelp>}</div><div className="mt-3 flex flex-wrap gap-3"><LightButton type="button" onClick={openCreator} className="min-h-11 px-4 py-3" contentClassName="gap-2 text-sm"><Layout size={16} aria-hidden="true" />Open Sales Page Creator</LightButton>{selected.sales_page_published == null && !selected.sales_page_active && <LightButton intent="danger" type="button" onClick={() => { void updateOffering(selected.id, { sales_page_published: false, sales_page_active: false }) }} className="min-h-11 px-3 py-3" contentClassName="text-sm">Unpublish legacy page</LightButton>}</div></TahoeGlassSurface></section>
                            <div className="mt-8 border-t border-white/15 pt-5"><LightButton intent="danger" type="button" disabled={selectedBusy} onClick={() => setDeleteId(selected.id)} className="min-h-11 px-3 py-2" contentClassName="gap-2 text-sm"><Trash2 size={16} aria-hidden="true" />Delete offering</LightButton>{selectedBusy && <span className="ml-3 text-xs text-white/70">Wait for saving to finish.</span>}</div>
                        </>}
                    </div>
                    {!selected && view !== 'create' && <div className="hidden min-h-[240px] items-center justify-center md:flex"><p className="text-center text-sm text-white/80">{products.length ? 'Choose an offering to edit, or select “Add product or service”.' : 'Select “Add product or service” to get started.'}</p></div>}
                </div>
            </div>
            {creatorVisible && creatorId && <div ref={creatorRef} className="scroll-mt-28"><SalesPageCreator key={`${userId}:${creatorId}`} productId={creatorId} embedded onBack={backFromCreator} externalPaymentDraft={Object.values(dirtyPayments).some(Boolean) || Object.values(pendingPayments).some(Boolean)} /></div>}
            {view !== 'editor' && saveStatus}
        </GlassCard>
        {crop && <ImageCropperModal isOpen={true} onClose={() => { if (!uploading) setCrop(null) }} imageSrc={crop.image} aspectRatio={1} onCropComplete={uploadCrop} loading={uploading} />}
        <ConfirmDeleteDialog open={Boolean(deleteId)} name={selectedDelete?.name || 'offering'} onClose={() => setDeleteId(null)} onConfirm={async () => {
            if (!deleteId || pendingFields[deleteId] || pendingPayments[deleteId]) return false
            if (!await removeEntity('product', deleteId)) return false
            focusRequest.current = { kind: 'list', productId: null }
            setSelectedId(null)
            setView('list')
            clearOfferingRoute()
            return true
        }} />
    </>
}
