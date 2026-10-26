import { safeWebUrl } from '../urls'

export const PRODUCT_CARD_SELECT = 'id,user_id,name,price,image_url,description,purchase_link,purchase_link_active,paypal_active,payment_config,created_at,sales_page_active,sales_page_published'

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
