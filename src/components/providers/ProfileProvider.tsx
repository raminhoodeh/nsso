'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from './UserProvider'
import type { Profile, Link, Contact, Experience, Qualification, Project, Product } from '@/lib/types'
import { ProfileMutationClient } from '@/lib/profile-mutation-client'
import { boundedClientRead } from '@/lib/client-read'
import { mutationMessage, rowCollections, type EditableValues, type MutationDelta, type MutationResult, type ProfileChange, type ProfileEntity, type ProfilePatch, type RowKind } from '@/lib/profile-mutations'
import { validateLinks as validateLinksUtil, type LinkValidation } from '@/lib/deity/linkValidator'

interface OwnerSnapshot { revision: number; profile: Profile | null; links: Link[]; contacts: Contact[]; experiences: Experience[]; qualifications: Qualification[]; projects: Project[]; products: Product[] }
type Draft = { entity: ProfileEntity; id: string; patch: Record<string, unknown>; sequence: number; timer?: ReturnType<typeof setTimeout>; operationId?: string; operationPatch?:Record<string,unknown>; failed?: boolean; failureStatus?: MutationResult['status']; inFlight?: boolean; waiters: ((value: boolean) => void)[] }
type PendingCreate = { operationId: string; changes: ProfileChange[]; status?: MutationResult['status']; pending?: Promise<MutationResult> }
const emptySnapshot = (): OwnerSnapshot => ({ revision: 0, profile: null, links: [], contacts: [], experiences: [], qualifications: [], projects: [], products: [] })
interface ProfileContextType extends OwnerSnapshot {
    loading: boolean
    loadError: string | null
    updateField: (field: keyof Profile, value: string, persist?: boolean) => Promise<boolean>
    patchProfile: (patch: ProfilePatch, immediate?: boolean) => Promise<boolean>
    addLink: (name: string, url: string) => Promise<boolean>
    updateLink: (id: string, field: 'link_name' | 'link_url', value: string) => Promise<boolean>
    removeLink: (id: string) => Promise<boolean>
    reorderLinks: (ids: string[]) => Promise<boolean>
    validateLinks: () => Promise<LinkValidation[]>
    addContact: () => Promise<boolean>
    updateContact: (id: string, field: 'method' | 'value' | 'custom_method_name', value: string) => Promise<boolean>
    removeContact: (id: string) => Promise<boolean>
    addExperience: (company: string, title: string, startYear: number | null, endYear: number | null, description?: string) => Promise<boolean>
    addProject: (name: string, description?: string, url?: string) => Promise<boolean>
    addQualification: (institution: string, degree: string, year: number | null) => Promise<boolean>
    addProduct: (name: string, description?: string, price?: string, url?: string) => Promise<boolean>
    createEntity: <K extends RowKind>(kind: K, values: EditableValues[K]) => Promise<MutationResult>
    patchEntity: <K extends RowKind>(kind: K, id: string, patch: EditableValues[K], immediate?: boolean) => Promise<boolean>
    removeEntity: (kind: RowKind, id: string) => Promise<boolean>
    reorderExperiences: (ids: string[]) => Promise<boolean>
    reorderQualifications: (ids: string[]) => Promise<boolean>
    reorderProjects: (ids: string[]) => Promise<boolean>
    reorderContacts: (ids: string[]) => Promise<boolean>
    applyOperation: (changes: ProfileChange[], operationId?: string, expectedRevision?: number) => Promise<MutationResult>
    undo: () => Promise<MutationResult & { originalOperationId?: string }>
    canUndo: boolean
    fastMode: boolean
    setFastMode: (enabled: boolean) => Promise<boolean>
    profileCompleteness: number
    refreshProfile: () => Promise<void>
    getRevision: () => number
    mutationState: { status: 'saved' | 'saving' | 'failed' | 'conflict' | 'outcomeUnknown'; message: string }
    retryPending: () => Promise<void>
}
const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

function mergeDeltas(snapshot: OwnerSnapshot, deltas: MutationDelta[]): OwnerSnapshot {
    const next = { ...snapshot }
    for (const delta of deltas) {
        if (delta.entity === 'profile') { next.profile = delta.row ? { ...next.profile, ...delta.row } as Profile : null; continue }
        if (!['links', 'contacts', 'experiences', 'qualifications', 'projects', 'products'].includes(delta.entity)) continue
        const rows = next[delta.entity] as unknown as Record<string, unknown>[]
        const found = rows.find(row => row.id === delta.id)
        const updated = delta.row === null ? rows.filter(row => row.id !== delta.id) : found ? rows.map(row => row.id === delta.id ? { ...row, ...delta.row } : row) : [...rows, delta.row]
        updated.sort((a,b)=>{
            const order=delta.entity==='products'?0:Number(a.display_order??0)-Number(b.display_order??0)
            if(order)return order
            if(delta.entity==='experiences'||delta.entity==='qualifications'){
                const field=delta.entity==='experiences'?'start_year':'end_year'
                const years=Number(b[field]??Number.MAX_SAFE_INTEGER)-Number(a[field]??Number.MAX_SAFE_INTEGER)
                if(years)return years
                return String(a.id).localeCompare(String(b.id))
            }
            const created=String(a.created_at??'').localeCompare(String(b.created_at??''))
            return (delta.entity==='projects'||delta.entity==='products'?-created:created)||String(a.id).localeCompare(String(b.id))
        })
        Object.assign(next, { [delta.entity]: updated })
    }
    return next
}

export function ProfileProvider({ children }: { children: ReactNode }) {
    const { user } = useUser()
    return <AccountProfileProvider key={user?.id ?? 'signed-out'}>{children}</AccountProfileProvider>
}

function AccountProfileProvider({ children }: { children: ReactNode }) {
    const { user } = useUser()
    const [supabase] = useState(() => createClient())
    const [snapshot, setSnapshot] = useState<OwnerSnapshot>(emptySnapshot)
    const canonical = useRef<OwnerSnapshot>(emptySnapshot())
    const drafts = useRef(new Map<string, Draft>())
    const pendingCreates = useRef(new Map<string, PendingCreate>())
    const pendingOrders = useRef(new Map<'links'|'contacts'|'experiences'|'qualifications'|'projects',{order:string[];operationId:string;status?:MutationResult['status']}>())
    const [client] = useState(() => new ProfileMutationClient(0,fetch,user?.id))
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [fastMode, setFastModeState] = useState(false)
    const [history, setHistory] = useState<string[]>([])
    const undoAttempt = useRef<{ original: string; operationId: string } | null>(null)
    const [mutationState, setMutationState] = useState<ProfileContextType['mutationState']>({ status: 'saved', message: '' })
    const mounted = useRef(true)
    const generation = useRef(0)
    const activeRead = useRef<AbortController | null>(null)
    const publish = useCallback(() => {
        const overlays: MutationDelta[] = Array.from(drafts.current.values()).map(draft => ({ entity: draft.entity, id: draft.id, row: { id: draft.id, ...draft.patch } }))
        for (const [entity,pending] of pendingOrders.current) pending.order.forEach((id,display_order) => overlays.push({entity,id,row:{id,display_order}}))
        setSnapshot(mergeDeltas(canonical.current, overlays))
    }, [])

    const refreshProfile = useCallback(async () => {
        if (!user?.id) { setLoading(false); return }
        const current = ++generation.current
        activeRead.current?.abort()
        const controller = new AbortController()
        activeRead.current = controller
        if (!canonical.current.profile) setLoading(true)
        try {
            const [result, account] = await boundedClientRead(signal => Promise.all([
                supabase.rpc('get_profile_snapshot').abortSignal(signal),
                supabase.rpc('get_current_account').abortSignal(signal),
            ]), { signal: controller.signal })
            if (!mounted.current || current !== generation.current) return
            if (result.error || !result.data || !Number.isSafeInteger(result.data.revision)) throw new Error('unavailable')
            if (result.data.revision >= canonical.current.revision) canonical.current = result.data as OwnerSnapshot
            client.setRevision(result.data.revision)
            setFastModeState(Boolean(account.data?.deity_fast_mode))
            setLoadError(null)
            publish()
        } catch { if (mounted.current && current === generation.current) setLoadError('Your profile could not be refreshed. Your draft has been kept.') }
        finally {
            if (activeRead.current === controller) activeRead.current = null
            if (mounted.current && current === generation.current) setLoading(false)
        }
    }, [user?.id, supabase, client, publish])

    useEffect(() => { mounted.current = true; client.activate(); void refreshProfile(); return () => {
        mounted.current = false; generation.current++; client.dispose()
        activeRead.current?.abort(); activeRead.current = null
        for (const draft of drafts.current.values()) { if (draft.timer) clearTimeout(draft.timer); draft.waiters.forEach(resolve => resolve(false)) }
        drafts.current.clear()
        pendingCreates.current.clear()
        pendingOrders.current.clear()
    } }, [refreshProfile, client])

    const record = useCallback((result: MutationResult, undoable = true) => {
        if (!mounted.current) return
        if (result.status === 'applied') {
            if (result.revision >= canonical.current.revision) canonical.current = { ...mergeDeltas(canonical.current, result.changes), revision: result.revision }
            if (undoable) setHistory(previous => previous.includes(result.operationId) ? previous : [...previous, result.operationId])
            setMutationState({ status: 'saved', message: '' })
            publish()
        } else setMutationState({ status: result.status === 'conflict' ? 'conflict' : result.status === 'outcomeUnknown' ? 'outcomeUnknown' : 'failed', message: mutationMessage(result) })
    }, [publish])

    const applyOperation = useCallback(async (changes: ProfileChange[], operationId?: string, expectedRevision?: number) => {
        setMutationState({ status: 'saving', message: 'Saving changes...' })
        const result = await client.apply(changes, operationId, expectedRevision)
        record(result)
        return result
    }, [client, record])

    const flushDraft = useCallback(async (key: string): Promise<boolean> => {
        const draft = drafts.current.get(key)
        if (!draft || !user?.id) return false
        if (draft.inFlight) return new Promise(resolve => draft.waiters.push(resolve))
        draft.inFlight = true
        if (draft.timer) clearTimeout(draft.timer)
        draft.timer = undefined
        const sequence = draft.sequence
        const patch = { ...draft.patch }
        const change = draft.entity === 'profile' ? { kind: 'profile.patch', patch } : { kind: `${Object.keys(rowCollections).find(key => rowCollections[key as RowKind] === draft.entity)}.patch`, id: draft.id, patch }
        const operationId = draft.operationId || crypto.randomUUID()
        draft.operationId = operationId
        draft.operationPatch=patch
        const result = await applyOperation([change as ProfileChange], operationId)
        if (!mounted.current) return false
        const latest = drafts.current.get(key)
        if (result.status === 'applied' && latest?.sequence === sequence) drafts.current.delete(key)
        else if (latest?.sequence === sequence) { latest.failed = true; latest.failureStatus = result.status; latest.inFlight = false }
        const waiters = draft.waiters.splice(0)
        waiters.forEach(resolve => resolve(result.status === 'applied'))
        publish()
        return result.status === 'applied'
    }, [user?.id, applyOperation, publish])

    const queuePatch = useCallback((entity: ProfileEntity, id: string, patch: Record<string, unknown>, immediate = false): Promise<boolean> => {
        if (!user?.id) return Promise.resolve(false)
        const key = `${entity}:${id}`
        const previous = drafts.current.get(key)
        if (previous?.timer) clearTimeout(previous.timer)
        const next: Draft = { entity, id, patch: { ...previous?.patch, ...patch }, sequence: (previous?.sequence || 0) + 1, waiters: previous?.inFlight ? [] : previous?.waiters || [] }
        if(previous?.failureStatus==='conflict'||previous?.failureStatus==='outcomeUnknown')Object.assign(next,{failed:true,failureStatus:previous.failureStatus,operationId:previous.operationId,operationPatch:previous.operationPatch})
        drafts.current.set(key, next)
        publish()
        if(next.failureStatus==='conflict'||next.failureStatus==='outcomeUnknown'){
            setMutationState({status:next.failureStatus,message:mutationMessage({status:next.failureStatus})})
            return Promise.resolve(false)
        }
        setMutationState({ status: 'saving', message: 'Unsaved changes...' })
        const promise = new Promise<boolean>(resolve => next.waiters.push(resolve))
        if (immediate) void flushDraft(key)
        else next.timer = setTimeout(() => { void flushDraft(key) }, 400)
        return promise
    }, [user?.id, publish, flushDraft])
    const patchProfile = useCallback((patch: ProfilePatch, immediate = false) => queuePatch('profile', user?.id || '', patch, immediate), [queuePatch, user?.id])
    const updateField = useCallback((field: keyof Profile, value: string, persist = true) => {
        if (!['full_name', 'headline', 'bio', 'profile_pic_url'].includes(field)) return Promise.resolve(false)
        if (!persist) return Promise.resolve(false)
        return patchProfile({ [field]: value })
    }, [patchProfile])
    const patchEntity = useCallback(<K extends RowKind>(kind: K, id: string, patch: EditableValues[K], immediate = false) => queuePatch(rowCollections[kind], id, patch as Record<string, unknown>, immediate), [queuePatch])
    const submitCreate = useCallback((key: string, entry: PendingCreate): Promise<MutationResult> => {
        if (entry.pending) return entry.pending
        const pending = applyOperation(entry.changes, entry.operationId).then(result => {
            if (pendingCreates.current.get(key) === entry) {
                if (result.status === 'applied') pendingCreates.current.delete(key)
                else entry.status = result.status
            }
            return result
        }).finally(() => { entry.pending = undefined })
        entry.pending = pending
        return pending
    }, [applyOperation])
    const createEntity = useCallback(<K extends RowKind>(kind: K, values: EditableValues[K]) => {
        const changes = [{ kind: `${kind}.add`, values } as ProfileChange]
        const key = JSON.stringify(changes)
        // Repeated clicks share one intent until the server acknowledges its result.
        // An uncertain add keeps its original ID even if a later snapshot advances.
        const entry = pendingCreates.current.get(key) || { changes, operationId: crypto.randomUUID() }
        pendingCreates.current.set(key, entry)
        return submitCreate(key, entry)
    }, [submitCreate])
    const removeEntity = useCallback(async (kind: RowKind, id: string) => {
        const result = await applyOperation([{ kind: `${kind}.remove`, id } as ProfileChange])
        if (result.status === 'applied') { const draft = drafts.current.get(`${rowCollections[kind]}:${id}`); if (draft?.timer) clearTimeout(draft.timer); draft?.waiters.forEach(resolve => resolve(false)); drafts.current.delete(`${rowCollections[kind]}:${id}`); publish() }
        return result.status === 'applied'
    }, [applyOperation, publish])
    const reorder = useCallback(async (collection: 'links' | 'contacts' | 'experiences' | 'qualifications' | 'projects', order: string[], reuseId?:string) => {
        const pending={order,operationId:reuseId || crypto.randomUUID()}
        pendingOrders.current.set(collection,pending);publish()
        const result=await applyOperation([{kind:'collection.reorder',collection,order}],pending.operationId)
        if(pendingOrders.current.get(collection)===pending){
            if(result.status==='applied')pendingOrders.current.delete(collection)
            else pendingOrders.current.set(collection,{...pending,status:result.status})
        }
        publish();return result.status==='applied'
    }, [applyOperation,publish])
    const retryPending = useCallback(async () => {
        await refreshProfile()
        for (const [key, entry] of pendingCreates.current) {
            if (entry.pending) { await entry.pending; continue }
            const previous = await client.status(entry.operationId)
            if (previous.status === 'applied') { record(previous); pendingCreates.current.delete(key); continue }
            if (previous.status === 'outcomeUnknown') { record(previous, false); continue }
            if (entry.status === 'outcomeUnknown') {
                if (previous.status !== 'not_found') { pendingCreates.current.set(key, { ...entry, status: previous.status }); record(previous, false); continue }
                await submitCreate(key, entry)
            } else {
                // A known rejection/conflict can be accepted again after this explicit
                // refresh/retry. Never replace an ID while its outcome is uncertain.
                const accepted = { changes: entry.changes, operationId: crypto.randomUUID() }
                pendingCreates.current.set(key, accepted)
                await submitCreate(key, accepted)
            }
        }
        for (const [key, draft] of drafts.current) {
            if (draft.failed) {
                const previous = draft.operationId ? await client.status(draft.operationId) : null
                if (previous?.status === 'applied') {
                    record(previous)
                    if(JSON.stringify(draft.patch)===JSON.stringify(draft.operationPatch)){drafts.current.delete(key);continue}
                    drafts.current.set(key,{...draft,operationId:undefined,failureStatus:undefined,inFlight:false})
                    await flushDraft(key);continue
                }
                if (previous?.status === 'outcomeUnknown') { record(previous, false); continue }
                if(draft.failureStatus==='outcomeUnknown'&&draft.operationId&&draft.operationPatch){
                    const original=draft.entity==='profile'?{kind:'profile.patch',patch:draft.operationPatch}:{kind:`${Object.keys(rowCollections).find(kind=>rowCollections[kind as RowKind]===draft.entity)}.patch`,id:draft.id,patch:draft.operationPatch}
                    const resolved=await client.apply([original as ProfileChange],draft.operationId)
                    record(resolved)
                    if(resolved.status!=='applied')continue
                    if(JSON.stringify(draft.patch)===JSON.stringify(draft.operationPatch)){drafts.current.delete(key);continue}
                    drafts.current.set(key,{...draft,operationId:undefined,failureStatus:undefined,inFlight:false})
                    await flushDraft(key);continue
                }
                if (draft.failureStatus !== 'outcomeUnknown') drafts.current.set(key,{...draft,operationId:undefined})
                await flushDraft(key)
            }
        }
        for(const [collection,pending] of pendingOrders.current){
            const previous=await client.status(pending.operationId)
            if(previous.status==='applied'){record(previous);pendingOrders.current.delete(collection);continue}
            if(previous.status==='outcomeUnknown'){record(previous,false);continue}
            await reorder(collection,pending.order,pending.status==='outcomeUnknown'?pending.operationId:undefined)
        }
        publish()
    }, [refreshProfile, client, record, flushDraft, publish,reorder,submitCreate])
    const undo = useCallback(async () => {
        const original = history.at(-1)
        if (!original) return { status: 'rejected', operationId: '', revision: client.revision, changes: [], code: 'NOTHING_TO_UNDO' } as MutationResult
        if (!undoAttempt.current || undoAttempt.current.original !== original) undoAttempt.current = { original, operationId: crypto.randomUUID() }
        setMutationState({ status: 'saving', message: 'Undoing change...' })
        const result = await client.undo(original, undoAttempt.current.operationId)
        record(result, false)
        if (result.status === 'applied') { setHistory(previous => previous.filter(id => id !== original)); undoAttempt.current = null }
        else if(result.status==='conflict'||result.status==='rejected')undoAttempt.current=null
        return { ...result, originalOperationId: original }
    }, [history, client, record])
    const setFastMode = useCallback(async (enabled: boolean) => {
        const { error } = await supabase.rpc('update_account_settings', { p_patch: { deity_fast_mode: enabled } })
        if (error) return false
        setFastModeState(enabled); return true
    }, [supabase])
    const has = (value: unknown) => !!(typeof value === 'string' ? value.trim() : value)
    const completenessFields=[has(snapshot.profile?.full_name),has(snapshot.profile?.headline),has(snapshot.profile?.bio),has(snapshot.profile?.profile_pic_url),snapshot.links.length>0,snapshot.contacts.length>0,snapshot.experiences.length>0,snapshot.qualifications.length>0,snapshot.projects.length>0,snapshot.products.length>0]
    const profileCompleteness=completenessFields.reduce((score,filled,index)=>score+(filled?[10,10,20,10,10,10,10,5,5,10][index]:0),0)

    return <ProfileContext.Provider value={{ ...snapshot, loading, loadError, mutationState, retryPending, patchProfile, updateField, patchEntity, createEntity, removeEntity, applyOperation, refreshProfile, getRevision: () => client.revision, undo, canUndo: history.length > 0, fastMode, setFastMode, profileCompleteness,
        addLink: async (link_name, link_url) => (await createEntity('link', { link_name, link_url })).status === 'applied',
        updateLink: (id, field, value) => patchEntity('link', id, { [field]: value }), removeLink: id => removeEntity('link', id), reorderLinks: ids => reorder('links', ids), validateLinks: () => validateLinksUtil(snapshot.links.map(link => ({ id: link.id, url: link.link_url }))),
        addContact: async () => (await createEntity('contact', { method: 'Email', value: '', custom_method_name: null })).status === 'applied', updateContact: (id, field, value) => patchEntity('contact', id, { [field]: value }), removeContact: id => removeEntity('contact', id), reorderContacts: ids => reorder('contacts', ids),
        addExperience: async (company_name, job_title, start_year, end_year, description) => (await createEntity('experience', { company_name, job_title, start_year, end_year, description: description || '' })).status === 'applied',
        addProject: async (project_name, description, project_url) => (await createEntity('project', { project_name, contribution: 'Creator', description: description || '', project_url: project_url || null })).status === 'applied',
        addQualification: async (institution, qualification_name, year) => (await createEntity('qualification', { institution, qualification_name, start_year: year, end_year: year })).status === 'applied',
        addProduct: async (name, description, price, purchase_link) => (await createEntity('product', { name, description: description || '', price: price || null, purchase_link: purchase_link || null })).status === 'applied',
        reorderExperiences: ids => reorder('experiences', ids), reorderQualifications: ids => reorder('qualifications', ids), reorderProjects: ids => reorder('projects', ids),
    }}>{children}</ProfileContext.Provider>
}

export function useProfile() {
    const context = useContext(ProfileContext)
    if (!context) throw new Error('useProfile must be used within a ProfileProvider')
    return context
}
