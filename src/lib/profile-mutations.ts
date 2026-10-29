import { safeWebUrl } from './urls'
import { CONTACT_METHODS } from './contact-methods'

export const PROFILE_OPERATION_VERSION = 1 as const
export type RowKind = 'link' | 'contact' | 'experience' | 'qualification' | 'project' | 'product'
export type InsertionPosition = 'top' | 'bottom'
export type ProfileEntity = 'profile' | 'links' | 'contacts' | 'experiences' | 'qualifications' | 'projects' | 'products'
export type OrderCollection = Exclude<ProfileEntity, 'profile' | 'products'>
export type ProfilePatch = { full_name?: string | null; headline?: string | null; bio?: string | null; profile_pic_url?: string | null }
export interface EditableValues {
    link: { link_name?: string; link_url?: string }
    contact: { method?: string; value?: string; custom_method_name?: string | null }
    experience: { company_name?: string; job_title?: string; start_year?: number | null; end_year?: number | null; description?: string | null }
    qualification: { institution?: string; qualification_name?: string; start_year?: number | null; end_year?: number | null }
    project: { project_name?: string; contribution?: string; description?: string | null; project_photo_url?: string | null; project_url?: string | null }
    product: { name?: string; price?: string | null; image_url?: string | null; description?: string | null; purchase_link?: string | null; secondary_purchase_link?: string | null; purchase_link_active?: boolean; paypal_active?: boolean; sales_page_active?: boolean; sales_page_published?: boolean; headline?: string | null; tagline?: string | null; intro_text?: string | null; value_proposition?: string | null; video_url?: string | null; benefits?: string[]; testimonials?: { name: string; text: string }[] }
}
type RowChange = { [K in RowKind]: { kind: `${K}.add`; values: EditableValues[K]; position?: InsertionPosition } | { kind: `${K}.patch`; id: string; patch: EditableValues[K] } | { kind: `${K}.remove`; id: string } }[RowKind]
export type ProfileChange = { kind: 'profile.patch'; patch: ProfilePatch } | RowChange | { kind: 'collection.reorder'; collection: OrderCollection; order: string[] }
export interface ProfileOperation { version: 1; operationId: string; expectedRevision: number; changes: ProfileChange[] }
export interface MutationDelta { entity: ProfileEntity; id: string; row: Record<string, unknown> | null }
export type MutationStatus = 'applied' | 'conflict' | 'rejected' | 'failed' | 'outcomeUnknown' | 'not_found'
export interface MutationResult { status: MutationStatus; operationId: string; revision: number; changes: MutationDelta[]; code?: string; message?: string }
export const rowCollections: Record<RowKind, Exclude<ProfileEntity, 'profile'>> = { link: 'links', contact: 'contacts', experience: 'experiences', qualification: 'qualifications', project: 'projects', product: 'products' }
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))
type Rule = (value: unknown) => boolean
const text = (maximum: number, nullable = false): Rule => value => (nullable && value === null) || (typeof value === 'string' && value.length <= maximum && !/[\u0000\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))
const web: Rule = value => value === null || value === '' || !!safeWebUrl(value)
const year: Rule = value => value === null || (Number.isInteger(value) && Number(value) >= 1000 && Number(value) <= 3000)
const boolean: Rule = value => typeof value === 'boolean'
const rules: Record<string, Record<string, Rule>> = {
    profile: { full_name: text(300, true), headline: text(120, true), bio: text(32768, true), profile_pic_url: web },
    link: { link_name: text(300), link_url: value => value === '' || !!safeWebUrl(value) },
    contact: { method: value => typeof value === 'string' && (CONTACT_METHODS as readonly string[]).includes(value), value: text(2000), custom_method_name: text(100, true) },
    experience: { company_name: text(300), job_title: text(300), start_year: year, end_year: year, description: text(32768, true) },
    qualification: { institution: text(300), qualification_name: text(300), start_year: year, end_year: year },
    project: { project_name: text(300), contribution: text(300), description: text(32768, true), project_photo_url: web, project_url: web },
    product: { name: text(300), price: text(200, true), image_url: web, description: text(32768, true), purchase_link: web, secondary_purchase_link: web, purchase_link_active: boolean, paypal_active: boolean, sales_page_active: boolean, sales_page_published: boolean, headline: text(120, true), tagline: text(500, true), intro_text: text(32768, true), value_proposition: text(32768, true), video_url: web, benefits: value => Array.isArray(value) && value.length <= 50 && value.every(text(2000)), testimonials: value => Array.isArray(value) && value.length <= 50 && value.every(item => object(item) && Object.keys(item).length === 2 && keys(item, ['name', 'text']) && text(300)(item.name) && text(4000)(item.text)) },
}
const required: Record<RowKind, string[]> = { link: ['link_name', 'link_url'], contact: ['method', 'value'], experience: ['company_name', 'job_title'], qualification: ['institution', 'qualification_name'], project: ['project_name', 'contribution'], product: ['name'] }

export function isProfileChange(value: unknown): value is ProfileChange {
    if (!object(value) || typeof value.kind !== 'string') return false
    if (value.kind === 'collection.reorder') return Object.keys(value).length === 3 && keys(value, ['kind', 'collection', 'order']) && ['links', 'contacts', 'experiences', 'qualifications', 'projects'].includes(String(value.collection)) && Array.isArray(value.order) && value.order.length <= 500 && value.order.every(isUuid) && new Set(value.order).size === value.order.length
    const [entity, operation, extra] = value.kind.split('.')
    if (extra || !Object.hasOwn(rules, entity) || !['add', 'patch', 'remove'].includes(operation) || (entity === 'profile' && operation !== 'patch')) return false
    if (operation === 'remove') return Object.keys(value).length === 2 && keys(value, ['kind', 'id']) && isUuid(value.id)
    const field = operation === 'add' ? 'values' : 'patch'
    if (!keys(value, operation === 'add' ? ['kind', field, 'position'] : entity === 'profile' ? ['kind', field] : ['kind', 'id', field]) || (entity !== 'profile' && operation === 'patch' && !isUuid(value.id))) return false
    if (operation === 'add' && Object.hasOwn(value, 'position') && value.position !== 'top' && value.position !== 'bottom') return false
    const values = value[field]
    if (!object(values) || !Object.keys(values).length || !keys(values, Object.keys(rules[entity])) || !Object.entries(values).every(([key, content]) => rules[entity][key](content))) return false
    if (operation === 'add' && !required[entity as RowKind].every(key => Object.hasOwn(values, key))) return false
    if (Object.hasOwn(values, 'start_year') && Object.hasOwn(values, 'end_year') && values.start_year !== null && values.end_year !== null && Number(values.start_year) > Number(values.end_year)) return false
    return true
}

export function isProfileOperation(value: unknown): value is ProfileOperation {
    return object(value) && Object.keys(value).length === 4 && keys(value, ['version', 'operationId', 'expectedRevision', 'changes']) && value.version === 1 && isUuid(value.operationId) && Number.isSafeInteger(value.expectedRevision) && Number(value.expectedRevision) >= 0 && Array.isArray(value.changes) && value.changes.length > 0 && value.changes.length <= 20 && value.changes.every(isProfileChange)
}

/** Normalize only validated URL fields at persistence; prose and intentional clearing retain their values. */
export function normalizeProfileChange(change: ProfileChange): ProfileChange {
    if (!('patch' in change) && !('values' in change)) return change
    const field = 'patch' in change ? 'patch' : 'values'
    const input = 'patch' in change ? change.patch : change.values
    const values = Object.fromEntries(Object.entries(input).map(([key,value]) => [key, ['profile_pic_url','link_url','project_url','project_photo_url','image_url','purchase_link','secondary_purchase_link','video_url'].includes(key) && value !== null && value !== '' ? safeWebUrl(value) : value]))
    return { ...change, [field]: values } as ProfileChange
}

export function mutationMessage(result: Pick<MutationResult, 'status' | 'code'>): string {
    switch (result.status) {
        case 'applied': return 'Saved.'
        case 'conflict': return 'A newer edit was found. Your draft has been kept. Refresh and review it before retrying.'
        case 'outcomeUnknown': return 'The save result is not confirmed. Check its status before retrying; your draft has been kept.'
        case 'rejected': return result.code === 'RATE_LIMITED' ? 'Too many changes were sent. Please wait before retrying; your draft has been kept.' : result.code === 'AUTHENTICATION_REQUIRED' ? 'Please sign in again. Your draft has been kept.' : result.code === 'ACCOUNT_CHANGED' ? 'The signed-in account changed. Reload this page before saving.' : 'This change could not be accepted. Check the fields and try again.'
        default: return 'This change was not saved. Your draft has been kept; please retry.'
    }
}
