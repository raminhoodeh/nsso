import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { safeWebUrl } from '../urls'

export const PAYPAL_INPUT_LIMIT = 32768
export const PAYPAL_CURRENCIES = ['AUD', 'BRL', 'CAD', 'CZK', 'DKK', 'EUR', 'HKD', 'HUF', 'ILS', 'JPY', 'MYR', 'MXN', 'TWD', 'NZD', 'NOK', 'PHP', 'PLN', 'GBP', 'RUB', 'SGD', 'SEK', 'CHF', 'THB', 'USD'] as const
export type PayPalCurrency = typeof PAYPAL_CURRENCIES[number]
export type PayPalConfig =
    | { version: 1; kind: 'hosted-button'; hostedButtonId: string; currency: PayPalCurrency }
    | { version: 1; kind: 'payment-form'; action: string; fields: { name: string; value: string }[]; label: string }
export type PayPalParseResult = { ok: true; config: PayPalConfig | null; message: string } | { ok: false; message: string }

const BUTTON_ID = /^[A-Z0-9]{1,64}$/
const FIELD_NAMES = new Set(['cmd', 'business', 'hosted_button_id', 'item_name', 'item_number', 'amount', 'currency_code', 'quantity', 'no_shipping', 'no_note', 'return', 'cancel_return', 'notify_url', 'rm', 'charset', 'custom', 'invoice', 'lc', 'bn'])
const RETURN_FIELDS = new Set(['return', 'cancel_return', 'notify_url'])
const currencyIsValid = (value: unknown): value is PayPalCurrency => typeof value === 'string' && (PAYPAL_CURRENCIES as readonly string[]).includes(value)
const plainObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const exactly = (value: Record<string, unknown>, fields: string[]) => Object.keys(value).every(key => fields.includes(key)) && fields.every(key => Object.hasOwn(value, key))

function paymentAction(value: unknown): string | null {
    const safe = safeWebUrl(value, { httpsOnly: true })
    if (!safe) return null
    const url = new URL(safe)
    if (!['www.paypal.com', 'paypal.com'].includes(url.hostname) || url.port || url.search || url.hash) return null
    if (!/^\/ncp\/payment\/[A-Z0-9]{1,64}$/.test(url.pathname) && url.pathname !== '/cgi-bin/webscr') return null
    return `https://www.paypal.com${url.pathname}`
}

function validFields(fields: unknown): fields is { name: string; value: string }[] {
    if (!Array.isArray(fields) || fields.length > 32) return false
    const names = new Set<string>()
    for (const field of fields) {
        if (!plainObject(field) || !exactly(field, ['name', 'value']) || typeof field.name !== 'string' || !FIELD_NAMES.has(field.name) || names.has(field.name)) return false
        if (typeof field.value !== 'string' || field.value.length > 2048 || /[\u0000-\u001f\u007f]/.test(field.value)) return false
        names.add(field.name)
        if (field.name === 'cmd' && !['_xclick', '_s-xclick', '_cart'].includes(field.value)) return false
        if (field.name === 'hosted_button_id' && !BUTTON_ID.test(field.value)) return false
        if (field.name === 'currency_code' && !currencyIsValid(field.value)) return false
        if (field.name === 'amount' && (!/^\d{1,10}(?:\.\d{1,2})?$/.test(field.value) || Number(field.value) > 1_000_000_000)) return false
        if (field.name === 'quantity' && (!/^[1-9]\d{0,3}$/.test(field.value))) return false
        if (RETURN_FIELDS.has(field.name) && !safeWebUrl(field.value, { httpsOnly: true })) return false
    }
    return true
}

export function validatePayPalConfig(value: unknown): value is PayPalConfig {
    if (!plainObject(value) || value.version !== 1) return false
    if (value.kind === 'hosted-button') {
        return exactly(value, ['version', 'kind', 'hostedButtonId', 'currency']) && typeof value.hostedButtonId === 'string' && BUTTON_ID.test(value.hostedButtonId) && currencyIsValid(value.currency)
    }
    if (value.kind !== 'payment-form' || !exactly(value, ['version', 'kind', 'action', 'fields', 'label'])) return false
    if (paymentAction(value.action) !== value.action || !validFields(value.fields) || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 80 || /[\u0000-\u001f\u007f]/.test(value.label)) return false
    if (value.action === 'https://www.paypal.com/cgi-bin/webscr') {
        const fields = Object.fromEntries(value.fields.map(field => [field.name, field.value]))
        if (!fields.hosted_button_id && (!fields.business || !fields.amount || !fields.currency_code)) return false
        if (!fields.cmd) return false
    }
    return true
}

type InertNode = DefaultTreeAdapterTypes.Node
function descendants(root: InertNode): InertNode[] {
    const nodes: InertNode[] = [], pending = [root]
    while (pending.length) {
        const node = pending.pop()!
        nodes.push(node)
        if ('childNodes' in node) pending.push(...[...node.childNodes].reverse())
    }
    return nodes
}
function tag(node: InertNode): string { return 'tagName' in node ? node.tagName : '' }
function attribute(node: InertNode, name: string): string | null { return 'attrs' in node ? node.attrs.find(value => value.name === name)?.value ?? null : null }
function text(node: InertNode): string { return descendants(node).filter(value => value.nodeName === '#text').map(value => (value as DefaultTreeAdapterTypes.TextNode).value).join('') }

/** Inert syntax tree only: no browser DOM, script execution, resource loading or HTML output. */
export function parsePayPalInput(value: unknown): PayPalParseResult {
    if (typeof value !== 'string' || value.length > PAYPAL_INPUT_LIMIT) return { ok: false, message: 'PayPal code must be text shorter than 32 KB.' }
    if (!value.trim()) return { ok: true, config: null, message: 'No PayPal button configured.' }
    const nodes = descendants(parse(value))
    const allowed = new Set(['html', 'head', 'body', 'script', 'style', 'form', 'input', 'button', 'div', 'section', 'span', 'p', 'img', 'br', 'a'])
    if (nodes.some(node => (tag(node) && !allowed.has(tag(node))) || ('attrs' in node && node.attrs.some(attr => /^(on|srcdoc|formaction)/i.test(attr.name))))) {
        return { ok: false, message: 'Executable attributes or embedded content are not supported. Paste a standard PayPal button.' }
    }
    let currency: PayPalCurrency = 'GBP'
    const hostedIds: string[] = []
    for (const script of nodes.filter(node => tag(node) === 'script')) {
        const src = attribute(script, 'src')
        if (src) {
            const safe = safeWebUrl(src, { httpsOnly: true })
            if (!safe) return { ok: false, message: 'Only the standard PayPal SDK snippet is supported.' }
            const url = new URL(safe)
            if (url.hostname !== 'www.paypal.com' || url.pathname !== '/sdk/js' || url.port || url.hash || text(script).trim()) return { ok: false, message: 'Only the standard PayPal SDK snippet is supported.' }
            const requestedCurrency = url.searchParams.get('currency')
            if (requestedCurrency && !currencyIsValid(requestedCurrency)) return { ok: false, message: 'Unsupported PayPal currency.' }
            if (requestedCurrency) currency = requestedCurrency as PayPalCurrency
        } else {
            const match = text(script).match(/^\s*(?:window\.)?paypal\.HostedButtons\(\s*\{\s*hostedButtonId\s*:\s*(["'])([A-Z0-9]{1,64})\1\s*,?\s*\}\s*\)\.render\(\s*(["'])#[A-Za-z][\w:-]{0,100}\3\s*\)\s*;?\s*$/)
            if (!match) return { ok: false, message: 'Custom JavaScript is not supported. Paste the standard PayPal button snippet.' }
            hostedIds.push(match[2])
        }
    }
    const forms = nodes.filter(node => tag(node) === 'form')
    if (hostedIds.length) {
        if (hostedIds.length !== 1 || forms.length) return { ok: false, message: 'Paste one PayPal button at a time.' }
        return { ok: true, config: { version: 1, kind: 'hosted-button', hostedButtonId: hostedIds[0], currency }, message: 'Recognized PayPal Hosted Button. Checkout is handled by PayPal.' }
    }
    if (forms.length !== 1) return { ok: false, message: 'Paste a supported PayPal payment form or Hosted Button snippet.' }
    const form = forms[0]
    const action = paymentAction(attribute(form, 'action'))
    if (!action || (attribute(form, 'method') || 'get').toLowerCase() !== 'post') return { ok: false, message: 'Use a standard HTTPS PayPal payment form with method="post".' }
    const fields: { name: string; value: string }[] = []
    let label = 'Pay with PayPal'
    for (const input of descendants(form).filter(node => ['input', 'button'].includes(tag(node)))) {
        const type = (attribute(input, 'type') || (tag(input) === 'button' ? 'submit' : 'text')).toLowerCase()
        if (type === 'submit' || type === 'image') {
            label = (attribute(input, 'value') || attribute(input, 'alt') || text(input) || label).trim().slice(0, 80) || label
        } else if (type === 'hidden') {
            fields.push({ name: attribute(input, 'name') || '', value: attribute(input, 'value') || '' })
        } else return { ok: false, message: 'Custom form controls are not supported. Use a fixed PayPal payment button.' }
    }
    const config: PayPalConfig = { version: 1, kind: 'payment-form', action, fields, label }
    return validatePayPalConfig(config)
        ? { ok: true, config, message: 'Recognized PayPal payment form. Checkout and settlement are handled by PayPal.' }
        : { ok: false, message: 'Some PayPal form fields are unsupported or invalid. Your last saved button has been kept.' }
}

export function resolvePayPalConfig(config: unknown, legacyHtml: unknown): PayPalConfig | null {
    if (config !== undefined && config !== null) return validatePayPalConfig(config) ? config : null
    const parsed = parsePayPalInput(legacyHtml)
    return parsed.ok ? parsed.config : null
}
