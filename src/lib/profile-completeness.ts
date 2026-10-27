import { safeContactUrl, safeWebUrl } from './urls'

type Row = Record<string, unknown>
type CompletenessInput = {
    profile?: unknown
    links?: unknown
    contacts?: unknown
    experiences?: unknown
    qualifications?: unknown
    projects?: unknown
    products?: unknown
}

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const row = (value: unknown): Row => value && typeof value === 'object' ? value as Row : {}
const anyRow = (value: unknown, valid: (item: Row) => boolean) => Array.isArray(value) && value.some(item => valid(row(item)))

/** A shared content score: empty editor rows never count as a completed section. */
export function calculateProfileCompleteness(input: CompletenessInput | null | undefined): number {
    if (!input) return 0
    const profile = row(input.profile)
    const sections: [boolean, number][] = [
        [text(profile.full_name), 10],
        [text(profile.headline), 10],
        [text(profile.bio), 20],
        [Boolean(safeWebUrl(profile.profile_pic_url)), 10],
        [anyRow(input.links, item => text(item.link_name) && Boolean(safeWebUrl(item.link_url))), 10],
        [anyRow(input.contacts, item => text(item.method) && text(item.value) && (
            ['email', 'phone', 'whatsapp', 'telegram'].includes(String(item.method).toLowerCase())
                ? Boolean(safeContactUrl(item.method, item.value)) : true
        )), 10],
        [anyRow(input.experiences, item => text(item.company_name) && text(item.job_title)), 10],
        [anyRow(input.qualifications, item => text(item.institution) && text(item.qualification_name)), 5],
        [anyRow(input.projects, item => text(item.project_name) && (
            text(item.description) || Boolean(safeWebUrl(item.project_url)) || text(item.contribution)
        )), 5],
        [anyRow(input.products, item => text(item.name) && (
            text(item.description) || (text(item.price) && String(item.name).trim().toLowerCase() !== 'new product') || Boolean(safeWebUrl(item.image_url)) || Boolean(safeWebUrl(item.purchase_link))
        )), 10],
    ]
    return sections.reduce((score, [complete, weight]) => score + (complete ? weight : 0), 0)
}
