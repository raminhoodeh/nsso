export const META_PIXEL_CONSENT_COOKIE = 'nsso_meta_marketing_consent'
export const META_PIXEL_CONSENT_MAX_AGE = 60 * 60 * 24 * 180

export type MetaPixelConsentState = 'granted' | 'denied' | 'unset'

export function parseMetaPixelConsent(value: string | null | undefined): MetaPixelConsentState {
    if (value === 'granted' || value === 'denied') return value
    return 'unset'
}

