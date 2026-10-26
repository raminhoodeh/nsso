import { isProfileChange, type ProfileChange } from '../profile-mutations'

/** Model output is a proposal. Actor, revision and operation IDs are supplied by trusted application code. */
export interface DeityAction { version: 1; change: ProfileChange; label: string; reasoning?: string }
export interface ParsedResponse { message: string; actions: DeityAction[] }
const plain = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const string = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const exact = (value: Record<string, unknown>, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))

export function isValidAction(value: unknown): value is DeityAction {
    if (!plain(value) || value.version !== 1 || !exact(value, ['version', 'change', 'label', 'reasoning']) || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 300 || (value.reasoning !== undefined && (typeof value.reasoning !== 'string' || value.reasoning.length > 1000))) return false
    if (!isProfileChange(value.change)) return false
    const change = value.change
    if (change.kind === 'profile.patch') return Object.keys(change.patch).every(key => ['full_name', 'headline', 'bio'].includes(key))
    if (change.kind === 'link.add') return string(change.values.link_name) && string(change.values.link_url)
    if (change.kind === 'link.patch') return Object.keys(change.patch).every(key => ['link_name', 'link_url'].includes(key))
    if (change.kind === 'link.remove' || (change.kind === 'collection.reorder' && change.collection === 'links')) return true
    if (change.kind === 'experience.add') return string(change.values.company_name) && string(change.values.job_title)
    if (change.kind === 'qualification.add') return string(change.values.institution) && string(change.values.qualification_name)
    if (change.kind === 'project.add') return string(change.values.project_name) && string(change.values.description)
    if (change.kind === 'product.add') return Object.keys(change.values).every(key => ['name', 'description', 'price', 'purchase_link'].includes(key)) && string(change.values.name) && string(change.values.description)
    return false
}

/** Explicit compatibility mapping from the declared Gemini tools to one persisted schema. */
export function normalizeToolCall(name: string, args: unknown): DeityAction | null {
    if (!plain(args)) return null
    let change: ProfileChange
    let label: string
    switch (name) {
        case 'update_profile_field':
        case 'suggest_wording': {
            const wording = name === 'suggest_wording'
            if (!exact(args, wording ? ['target', 'original', 'improved', 'reasoning'] : ['target', 'value', 'reasoning']) || !['full_name', 'headline', 'bio'].includes(String(args.target))) return null
            const value = wording ? args.improved : args.value
            if (typeof value !== 'string') return null
            change = { kind: 'profile.patch', patch: { [String(args.target)]: value } }
            label = `Update ${String(args.target).replace('_', ' ')}`
            break
        }
        case 'add_link':
            if (!exact(args, ['name', 'url']) || !string(args.name) || !string(args.url)) return null
            change = { kind: 'link.add', values: { link_name: args.name, link_url: args.url } }; label = `Add link: ${args.name}`; break
        case 'update_link': {
            if (!exact(args, ['linkId', 'name', 'url']) || typeof args.linkId !== 'string') return null
            const patch = { ...(typeof args.name === 'string' ? { link_name: args.name } : {}), ...(typeof args.url === 'string' ? { link_url: args.url } : {}) }
            change = { kind: 'link.patch', id: args.linkId, patch }; label = 'Update link'; break
        }
        case 'remove_link':
            if (!exact(args, ['id']) || typeof args.id !== 'string') return null
            change = { kind: 'link.remove', id: args.id }; label = 'Remove link'; break
        case 'reorder_links':
            if (!exact(args, ['order']) || !Array.isArray(args.order)) return null
            change = { kind: 'collection.reorder', collection: 'links', order: args.order as string[] }; label = 'Reorder links'; break
        case 'add_experience':
            if (!exact(args, ['company', 'title', 'startYear', 'endYear', 'description']) || !string(args.company) || !string(args.title)) return null
            change = { kind: 'experience.add', values: { company_name: args.company, job_title: args.title, start_year: args.startYear as number | null, end_year: args.endYear === undefined ? null : args.endYear as number | null, ...(args.description !== undefined ? { description: args.description as string } : {}) } }; label = `Add experience: ${args.title}`; break
        case 'add_project':
            if (!exact(args, ['project_name', 'project_description', 'project_url']) || !string(args.project_name) || !string(args.project_description)) return null
            change = { kind: 'project.add', values: { project_name: args.project_name, contribution: 'Creator', description: args.project_description, project_url: args.project_url === undefined ? null : args.project_url as string | null } }; label = `Add project: ${args.project_name}`; break
        case 'add_qualification':
            if (!exact(args, ['institution', 'degree', 'year']) || !string(args.institution) || !string(args.degree)) return null
            change = { kind: 'qualification.add', values: { institution: args.institution, qualification_name: args.degree, start_year: args.year as number | null, end_year: args.year as number | null } }; label = `Add qualification: ${args.degree}`; break
        case 'add_product':
            if (!exact(args, ['product_name', 'product_description', 'price', 'purchase_url']) || !string(args.product_name) || !string(args.product_description)) return null
            change = { kind: 'product.add', values: { name: args.product_name, description: args.product_description, price: args.price === undefined ? null : args.price as string | null, purchase_link: args.purchase_url === undefined ? null : args.purchase_url as string | null } }; label = `Add product: ${args.product_name}`; break
        default: return null
    }
    const proposal = { version: 1, change, label, ...(typeof args.reasoning === 'string' ? { reasoning: args.reasoning } : {}) }
    return isValidAction(proposal) ? proposal : null
}

export function parseActionList(value: unknown): DeityAction[] | null {
    return Array.isArray(value) && value.length <= 20 && value.every(isValidAction) ? value : null
}
export function extractActions(fullResponse: string): DeityAction[] {
    const actions: DeityAction[] = []
    for (const match of fullResponse.matchAll(/```json\s*\n([\s\S]*?)\s*\n```/g)) {
        try { const value: unknown = JSON.parse(match[1]); if (isValidAction(value)) actions.push(value) } catch { /* Invalid text is never an instruction. */ }
    }
    return actions.slice(0, 20)
}
export function parseResponse(fullResponse: string): ParsedResponse { return { message: fullResponse.replace(/```json\s*\n[\s\S]*?\s*\n```/g, '').trim(), actions: extractActions(fullResponse) } }
export function createActionPayload(actions: DeityAction[]): string { return actions.length && parseActionList(actions) ? `\n__DEITY_ACTIONS__\n${JSON.stringify(actions)}\n` : '' }
export function containsActionDelimiter(text: string): boolean { return text.includes('__DEITY_ACTIONS__') }
export function splitActionPayload(text: string): { message: string; actionsJson: string | null } {
    const position = text.indexOf('__DEITY_ACTIONS__')
    return position < 0 ? { message: text, actionsJson: null } : { message: text.slice(0, position), actionsJson: text.slice(position + '__DEITY_ACTIONS__'.length).trim() || null }
}
