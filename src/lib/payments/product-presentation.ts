import { safeWebUrl } from '../urls'

export const PRODUCT_CARD_SELECT = 'id,user_id,name,price,image_url,description,purchase_link,purchase_link_active,paypal_active,payment_config,created_at,display_order,sales_page_active,sales_page_published'

/** Derive display copy from the validated destination, without fetching the shop. */
export function purchaseButtonLabel(value: unknown): string {
    const destination = safeWebUrl(value)
    if (!destination) return 'View purchase page'
    const hostname = new URL(destination).hostname.toLowerCase()
    if (hostname === 'etsy.com' || hostname.endsWith('.etsy.com')) return 'Buy on Etsy'
    if (hostname.endsWith('.myshopify.com')) return 'Buy on Shopify'
    return 'View purchase page'
}

export function productCheckoutVisibility(product: { purchase_link?: unknown; purchase_link_active?: unknown; paypal_active?: unknown }) {
    return {
        purchaseUrl: product.purchase_link_active === true ? safeWebUrl(product.purchase_link) : null,
        paypal: product.paypal_active === true,
    }
}

/** NULL preserves legacy direct URLs until their owner makes an explicit choice. */
export function productPageIsPublic(product: { sales_page_published?: boolean | null }) {
    return product.sales_page_published !== false
}
