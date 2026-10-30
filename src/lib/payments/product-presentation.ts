import { safeWebUrl } from '../urls'

export const PRODUCT_CARD_SELECT = 'id,user_id,name,price,image_url,description,purchase_link,secondary_purchase_link,purchase_button_label,secondary_purchase_button_label,purchase_link_active,paypal_active,payment_config,created_at,display_order,sales_page_active,sales_page_published'

const isHostname = (hostname: string, domain: string) => hostname === domain || hostname.endsWith(`.${domain}`)

export function isCourseMarketplaceUrl(value: unknown): boolean {
    const destination = safeWebUrl(value)
    if (!destination) return false
    const hostname = new URL(destination).hostname.toLowerCase()
    return isHostname(hostname, 'udemy.com') || isHostname(hostname, 'coursera.org')
}

/** Plain display text only; a label must never make an unsafe URL actionable. */
function customButtonLabel(value: unknown): string | null {
    if (typeof value !== 'string' || value.length > 60 || /[\u0000-\u001f\u007f]/.test(value)) return null
    return value.trim() || null
}

function isBookingDestination(url: URL): boolean {
    if (url.hostname === 'calendar.app.google') return /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    if (url.hostname === 'calendar.google.com') return /^\/calendar\/appointments\/schedules\/[^/]+\/?$/.test(url.pathname)
    if (url.hostname !== 'calendly.com' && url.hostname !== 'www.calendly.com') return false
    const segments = url.pathname.split('/').filter(Boolean)
    const sitePages = new Set(['about', 'app', 'apps', 'blog', 'contact', 'customers', 'features', 'help', 'integrations', 'legal', 'login', 'pricing', 'privacy', 'resources', 'security', 'signup', 'solutions', 'terms'])
    return segments.length >= 1 && segments.length <= 2 && !sitePages.has(segments[0].toLowerCase()) && segments.every(segment => /^[A-Za-z0-9_-]+$/.test(segment))
}

/** Derive display copy from the validated destination, without fetching it. */
export function purchaseButtonLabel(value: unknown, override?: unknown): string {
    const destination = safeWebUrl(value)
    if (!destination) return 'View purchase page'
    const custom = customButtonLabel(override)
    if (custom) return custom
    const url = new URL(destination)
    const hostname = url.hostname.toLowerCase()
    if (url.protocol === 'https:' && !url.port) {
        if (hostname === 'apps.apple.com' && /^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id\d+\/?$/i.test(url.pathname)) return 'Download on the App Store'
        if ((hostname === 'nsso.me' || hostname === 'www.nsso.me') && /^\/sign-up\/?$/.test(url.pathname)) return 'Sign up to nsso'
        if (isBookingDestination(url)) return 'Book a call'
    }
    if (isHostname(hostname, 'etsy.com')) return 'Buy on Etsy'
    if (hostname.endsWith('.myshopify.com')) return 'Buy on Shopify'
    if (isHostname(hostname, 'udemy.com')) return 'Buy on Udemy'
    if (isHostname(hostname, 'coursera.org')) return 'Buy on Coursera'
    return 'View purchase page'
}

/** Match normalized URLs, retaining primary-label precedence for duplicates. */
export function productPurchaseButtonLabel(product: { purchase_link?: unknown; secondary_purchase_link?: unknown; purchase_button_label?: unknown; secondary_purchase_button_label?: unknown }, value: unknown): string {
    const destination = safeWebUrl(value)
    if (!destination) return purchaseButtonLabel(value)
    const override = destination === safeWebUrl(product.purchase_link) ? product.purchase_button_label
        : destination === safeWebUrl(product.secondary_purchase_link) ? product.secondary_purchase_button_label : undefined
    return purchaseButtonLabel(destination, override)
}

export function productCheckoutVisibility(product: { purchase_link?: unknown; secondary_purchase_link?: unknown; purchase_link_active?: unknown; paypal_active?: unknown }) {
    const purchaseUrls = product.purchase_link_active === true
        ? [...new Set([product.purchase_link, product.secondary_purchase_link].map(value => safeWebUrl(value)).filter((url): url is string => url !== null))]
        : []
    return {
        purchaseUrl: purchaseUrls[0] ?? null,
        purchaseUrls,
        paypal: product.paypal_active === true,
    }
}

/** NULL preserves legacy direct URLs until their owner makes an explicit choice. */
export function productPageIsPublic(product: { sales_page_published?: boolean | null }) {
    return product.sales_page_published !== false
}
