import { safeWebUrl } from '../urls'

export const PRODUCT_CARD_SELECT = 'id,user_id,name,price,image_url,description,purchase_link,secondary_purchase_link,purchase_link_active,paypal_active,payment_config,created_at,display_order,sales_page_active,sales_page_published'

const isHostname = (hostname: string, domain: string) => hostname === domain || hostname.endsWith(`.${domain}`)

export function isCourseMarketplaceUrl(value: unknown): boolean {
    const destination = safeWebUrl(value)
    if (!destination) return false
    const hostname = new URL(destination).hostname.toLowerCase()
    return isHostname(hostname, 'udemy.com') || isHostname(hostname, 'coursera.org')
}

/** Derive display copy from the validated destination, without fetching the shop. */
export function purchaseButtonLabel(value: unknown): string {
    const destination = safeWebUrl(value)
    if (!destination) return 'View purchase page'
    const hostname = new URL(destination).hostname.toLowerCase()
    if (isHostname(hostname, 'etsy.com')) return 'Buy on Etsy'
    if (hostname.endsWith('.myshopify.com')) return 'Buy on Shopify'
    if (isHostname(hostname, 'udemy.com')) return 'View on Udemy'
    if (isHostname(hostname, 'coursera.org')) return 'View on Coursera'
    return 'View purchase page'
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
