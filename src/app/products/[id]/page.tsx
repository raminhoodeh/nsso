'use client'

import { NativeGlassLens } from '@/components/ui/tahoe-glass/NativeGlassLens'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createPublicReadClient } from '@/lib/supabase/public'
import { useUser } from '@/components/providers/UserProvider'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import PreviewCheckoutButton from '@/components/ui/PreviewCheckoutButton'
import { isCourseMarketplaceUrl, productCheckoutVisibility, productPageIsPublic, productPurchaseButtonLabel } from '@/lib/payments/product-presentation'
import { safeWebUrl } from '@/lib/urls'
import { offeringEditorHref } from '@/lib/offering-navigation'
import {
    TahoeGlassSurface,
} from '@/components/ui/tahoe-glass'
import { LightButton, LightIconButton, lightButtonClass } from '@/components/ui/LightButton'
import { cn } from '@/lib/utils'

function ProductRouteContent({ children }: { children: ReactNode }) {
    return <>{children}</>
}

function PurchaseLink({ href, label }: { href: string; label: string }) {
    const destination = safeWebUrl(href)
    if (!destination) return <p className="text-xs text-slate-950">Purchase link unavailable. Please contact the seller.</p>
    return (
        <NativeGlassLens as="a"
            href={destination}
            target="_blank"
            rel="noopener noreferrer"
            data-nsso-control="white"
            className={cn(lightButtonClass, 'min-h-11 w-full whitespace-normal [overflow-wrap:anywhere] rounded-xl px-4 py-2 text-center text-base font-semibold tracking-wide')}
        >
            <span data-light-button-content="true">{label}</span>
        </NativeGlassLens>
    )
}

interface Product {
    id: string
    user_id: string
    name: string
    price: string
    description: string
    headline: string
    tagline: string
    intro_text: string
    value_proposition: string
    benefits: string[]
    testimonials: { name: string; text: string }[]
    video_url: string
    image_url: string
    purchase_link: string
    secondary_purchase_link?: string | null
    purchase_button_label?: string | null
    secondary_purchase_button_label?: string | null
    payment_config: unknown
    paypal_active: boolean
    purchase_link_active: boolean
    sales_page_published?: boolean | null
}

interface Contact {
    method: string
    value: string
    custom_method_name?: string
}

const CONTACT_DETAILS_HIDDEN_PRODUCT_IDS = new Set([
    '50a34188-30dc-4fc0-82c4-721250250536',
])

export default function ProductSalesPage() {
    const params = useParams()
    const productId = typeof params.id === 'string' ? params.id : ''
    return <ProductSalesContent key={productId} productId={productId} />
}

function readProduct(value: unknown, productId: string): Product | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const row = value as Record<string, unknown>
    if (row.id !== productId || typeof row.user_id !== 'string' || typeof row.name !== 'string') return null
    return {
        ...row,
        benefits: Array.isArray(row.benefits) ? row.benefits.filter((item): item is string => typeof item === 'string') : [],
        testimonials: Array.isArray(row.testimonials) ? row.testimonials.filter((item): item is { name: string; text: string } => item && typeof item.name === 'string' && typeof item.text === 'string') : [],
    } as Product
}

function ProductSalesContent({ productId }: { productId: string }) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const publicClient = useMemo(() => createPublicReadClient(), [])
    const { user, loading: accountLoading, error: accountError } = useUser()
    const verifiedAccountId = !accountLoading && !accountError ? user?.id ?? null : null
    const [publicProduct, setPublicProduct] = useState<Product | null>(null)
    const [publicLoading, setPublicLoading] = useState(true)
    const [publicError, setPublicError] = useState(false)
    const [ownerPreview, setOwnerPreview] = useState<{ accountId: string; product: Product | null; loading: boolean; error: boolean } | null>(null)
    const [creator, setCreator] = useState<{ userId: string; contacts: Contact[]; username: string } | null>(null)
    const [retry, setRetry] = useState(0)
    const [currentTestimonial, setCurrentTestimonial] = useState(0)
    const currentOwnerPreview = ownerPreview?.accountId === verifiedAccountId ? ownerPreview : null
    const product = publicProduct ?? currentOwnerPreview?.product ?? null
    const productOwnerId = product?.user_id
    const isOwner = Boolean(product && verifiedAccountId === product.user_id)
    const loading = publicLoading || (!publicProduct && currentOwnerPreview?.loading === true)
    const loadError = !product && (publicError || currentOwnerPreview?.error)
    const userContacts = creator?.userId === product?.user_id ? creator?.contacts ?? [] : []
    const ownerUsername = creator?.userId === product?.user_id ? creator?.username ?? '' : ''

    useEffect(() => {
        let active = true
        const controller = new AbortController()
        const fetchData = async () => {
            setPublicLoading(true); setPublicError(false); setPublicProduct(null)
            try {
                const { data, error } = await publicClient.rpc('get_product_details', { p_product_id: productId }).abortSignal(controller.signal)
                if (error) throw error
                const product = readProduct(data, productId)
                if (active) setPublicProduct(product && productPageIsPublic(product) ? product : null)
            } catch {
                if (active) setPublicError(true)
            } finally {
                if (active) setPublicLoading(false)
            }
        }
        void fetchData()
        return () => { active = false; controller.abort() }
    }, [productId, publicClient, retry])

    useEffect(() => {
        // Public rendering never waits for persisted Auth. Only a verified
        // current account may attempt the owner-only draft fallback.
        if (publicLoading || publicProduct || !verifiedAccountId) return
        let active = true
        const controller = new AbortController()
        const accountId = verifiedAccountId
        const timer = setTimeout(() => {
            controller.abort()
            if (active) setOwnerPreview({ accountId, product: null, loading: false, error: true })
        }, 5_000)
        const fetchOwnerPreview = async () => {
            setOwnerPreview({ accountId, product: null, loading: true, error: false })
            try {
                const { data, error } = await createClient().rpc('get_product_details', { p_product_id: productId }).abortSignal(controller.signal)
                if (error) throw error
                const product = readProduct(data, productId)
                if (active && !controller.signal.aborted) setOwnerPreview({ accountId, product: product?.user_id === accountId ? product : null, loading: false, error: false })
            } catch {
                if (active && !controller.signal.aborted) setOwnerPreview({ accountId, product: null, loading: false, error: true })
            } finally { clearTimeout(timer) }
        }
        void fetchOwnerPreview()
        return () => { active = false; clearTimeout(timer); controller.abort() }
    }, [productId, publicLoading, publicProduct, verifiedAccountId, retry])

    useEffect(() => {
        if (!productOwnerId) return
        let active = true
        const controller = new AbortController(), userId = productOwnerId
        void (async () => {
            try {
                const [contacts, owner] = await Promise.all([
                    CONTACT_DETAILS_HIDDEN_PRODUCT_IDS.has(productId) ? Promise.resolve({ data: [] }) : publicClient.from('contacts').select('method,value,custom_method_name').eq('user_id', userId).abortSignal(controller.signal),
                    publicClient.from('users').select('username').eq('id', userId).abortSignal(controller.signal).single(),
                ])
                if (active) setCreator({ userId, contacts: contacts.data ?? [], username: owner.data?.username ?? '' })
            } catch { /* Public product remains usable if optional creator details fail. */ }
        })()
        return () => { active = false; controller.abort() }
    }, [productOwnerId, productId, publicClient])

    // Auto-rotate testimonials
    useEffect(() => {
        if (!product?.testimonials || product.testimonials.length <= 1) return

        const interval = setInterval(() => {
            setCurrentTestimonial((prev) =>
                (prev + 1) % product.testimonials.length
            )
        }, 10000) // Rotate every 10 seconds

        return () => clearInterval(interval)
    }, [product?.testimonials])

    const nextTestimonial = () => {
        if (!product?.testimonials) return
        setCurrentTestimonial((prev) => (prev + 1) % product.testimonials.length)
    }

    const prevTestimonial = () => {
        if (!product?.testimonials) return
        setCurrentTestimonial((prev) =>
            prev === 0 ? product.testimonials.length - 1 : prev - 1
        )
    }

    const extractYouTubeId = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/
        const match = url.match(regExp)
        return match && match[2].length === 11 ? match[2] : null
    }

    // The standalone product route has no account bottom bar. A failed or
    // pending product read must still leave an explicit, safe way out without
    // trusting a creator id, return URL, or unverified session from the query.
    const recoveryNavigation = <LightButton
        onClick={() => router.push(verifiedAccountId ? '/dashboard' : '/')}
        className="min-h-11 px-4 py-2"
        contentClassName="gap-2 text-[15px] font-semibold"
    >
        <ChevronLeft size={16} />
        {verifiedAccountId ? 'Back to profile editor' : 'Back to nsso'}
    </LightButton>

    if (loading) {
        return (
            <ProductRouteContent>
                <div className="relative z-[1] flex min-h-screen flex-col items-center justify-center gap-5 p-5">
                    {recoveryNavigation}
                    <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="pill" className="nsso-crystal-panel" tone="dark" semanticTint="light" semanticTintOpacity={0.18} contentClassName="px-6 py-3 text-slate-950">
                        Loading...
                    </TahoeGlassSurface>
                </div>
            </ProductRouteContent>
        )
    }

    if (!product || (!productPageIsPublic(product) && !isOwner)) {
        return (
            <ProductRouteContent>
                <div className="relative z-[1] flex min-h-screen flex-col items-center justify-center gap-5 p-5">
                    {recoveryNavigation}
                    <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="card" className="nsso-crystal-panel" tone="dark" contentClassName="px-8 py-6 text-slate-950">
                        {loadError ? <div role="status" className="space-y-3 text-center"><p>This product could not be loaded. Please retry.</p><LightButton type="button" onClick={() => setRetry(value => value + 1)} className="min-h-11 px-4 py-2" contentClassName="text-sm">Retry product</LightButton></div> : 'Product not found'}
                    </TahoeGlassSurface>
                </div>
            </ProductRouteContent>
        )
    }

    const youtubeId = product.video_url ? extractYouTubeId(product.video_url) : null
    const checkout = productCheckoutVisibility(product)
    const courseMarketplaceProduct = [product.purchase_link, product.secondary_purchase_link].some(isCourseMarketplaceUrl)
    // An explicit preview must be inert before optional account verification
    // finishes; it never grants access to an unpublished product.
    const preview = searchParams.get('preview') === 'true' || (isOwner && product.sales_page_published === false)

    return (
        <ProductRouteContent>
        <main className="relative z-[1] min-h-screen p-4 text-slate-950 [text-shadow:none] md:p-8">
            <div className="max-w-[1400px] mx-auto">
                {/* Golden Ratio Grid: 1.618fr 1fr */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.618fr_1fr] gap-8">

                    {/* LEFT COLUMN - Primary Content */}
                    <div className="space-y-8 px-3 md:px-16">
                        {/* Back Button */}
                        <div className="mb-8">
                            <LightButton
                                onClick={() => {
                                    if (isOwner) {
                                        if (searchParams.get('source') === 'creator') {
                                            router.push(offeringEditorHref(product.id, 'creator'))
                                        } else {
                                            router.push('/preview')
                                        }
                                    } else if (ownerUsername) {
                                        router.push(`/${ownerUsername}`)
                                    } else {
                                        router.back()
                                    }
                                }}
                                className="px-4 py-2"
                                contentClassName="gap-2 text-[15px] font-semibold"
                            >
                                <ChevronLeft size={16} />
                                {isOwner && searchParams.get('source') === 'creator'
                                    ? 'Back to Sales Page Creator'
                                    : 'Back to Profile'}
                            </LightButton>
                        </div>

                        <TahoeGlassSurface
                            chromiumAppearance="light" materialFinish="satin"
                            variant="card" radius={20} tone="dark"
                            semanticTint="light" semanticTintOpacity={0.18}
                            className="nsso-crystal-panel"
                            contentClassName="space-y-8 p-4 md:p-8"
                        >
                        {/* Headline Hook */}
                        <h1 className="text-[29px] font-bold text-slate-950 uppercase tracking-wide leading-[38px]" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            {product.headline}
                        </h1>

                        {/* Tagline */}
                        <h2 className="text-[29px] font-bold text-slate-950 leading-[38px]" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            {product.tagline}
                        </h2>

                        {/* Intro */}
                        <p className="text-[17px] text-slate-950 leading-[22px] whitespace-pre-wrap" style={{ fontFamily: "'SF Pro', -apple-system, sans-serif", fontWeight: 510 }}>
                            {product.intro_text}
                        </p>

                        {/* Mobile-only Product Card — shown early so users see the product before the bullet list */}
                        <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin"
                            variant="panel"
                            radius={20}
                            tone="dark"
                            semanticTint="light"
                            semanticTintOpacity={0.18}
                            className="nsso-crystal-panel w-full lg:hidden"
                            contentClassName="flex w-full flex-col items-center p-6"
                        >
                            {/* Product Image */}
                            {product.image_url && (
                                <div className="relative w-full aspect-square rounded-[12px] overflow-hidden mb-4">
                                    <Image
                                        src={product.image_url}
                                        alt={product.name}
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            )}

                            {/* Product Name */}
                            <h3 className="text-[17px] font-bold text-slate-950 mb-2 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.name}
                            </h3>

                            {/* Price */}
                            <p className="text-[29px] font-bold text-slate-950 mb-4 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.price}
                            </p>

                            {/* Purchase Link Button */}
                            {checkout.purchaseUrls.map(purchaseUrl => (
                                <div key={purchaseUrl} className="w-full max-w-[15rem] mb-3">
                                    {preview ? <PreviewCheckoutButton className="w-full [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:[overflow-wrap:anywhere] [&>button]:px-4 [&>button]:py-2 [&>button]:text-center">{productPurchaseButtonLabel(product, purchaseUrl)}</PreviewCheckoutButton> : <PurchaseLink href={purchaseUrl} label={productPurchaseButtonLabel(product, purchaseUrl)} />}
                                </div>
                            ))}

                            {/* PayPal Button */}
                            {checkout.paypal && !!product.payment_config && (
                                <div className="w-full max-w-[15rem] flex justify-center mt-2">
                                    <PayPalSmartButton 
                                        config={product.payment_config}
                                        preview={preview}
                                        price={product.price}
                                        productName={product.name}
                                    />
                                </div>
                            )}
                            {product.value_proposition && (
                                <p data-product-purchase-support className="mt-4 text-center text-[15px] font-medium leading-[22px] text-slate-950">
                                    {product.value_proposition}
                                </p>
                            )}
                        </TahoeGlassSurface>

                        {/* Benefits */}
                        {product.benefits && product.benefits.length > 0 && (
                            <ul className="space-y-3">
                                {product.benefits.map((benefit, index) => {
                                    const isIncludes = benefit.trim().startsWith('Includes:') || benefit.includes('Includes:');
                                    // Strip any markdown bold asterisks
                                    const cleanBenefit = benefit.replace(/\*\*/g, '').replace(/\*/g, '');
                                    return (
                                        <li key={index} className="flex items-start gap-3 text-[17px] text-slate-950 leading-[22px]" style={{ fontFamily: "'SF Pro', -apple-system, sans-serif" }}>
                                            <span className="text-slate-950 mt-1" style={{ fontStyle: 'normal', fontWeight: 400 }}>•</span>
                                            <span style={{
                                                fontWeight: isIncludes ? 400 : 510,
                                                fontStyle: isIncludes ? 'italic' : 'normal',
                                            }}>{cleanBenefit}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        </TahoeGlassSurface>

                        {/* Guarantee Card */}
                        <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="card" radius={20} className="nsso-crystal-panel" tone="dark" contentClassName="p-6">
                            {courseMarketplaceProduct ? <p className="text-[17px] text-slate-950 leading-[22px]">
                                Enrolment, pricing and refunds are handled by the course platform. Review its terms before enrolling.
                            </p> : <div className="grid grid-cols-[17.5%_82.5%] items-center gap-6">
                                <div className="relative w-full aspect-square">
                                    <Image
                                        src="/guaranteed-logo.png"
                                        alt="Guarantee"
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                                <p className="text-[17px] font-bold text-slate-950 leading-[22px] px-4" style={{ fontFamily: "'SF Pro', -apple-system, sans-serif", fontWeight: 700 }}>
                                    100% Guaranteed Satisfaction! If the {product.name} is not for you, I'll refund you – no questions asked.
                                </p>
                            </div>}
                        </TahoeGlassSurface>

                        {/* Testimonial Carousel */}
                        {product.testimonials && product.testimonials.length > 0 && (
                            <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="card" radius={20} className="nsso-crystal-panel" tone="dark" contentClassName="p-3 md:p-8">
                                <div className="flex items-center gap-2 md:gap-4">
                                    {product.testimonials.length > 1 && (
                                        <LightIconButton
                                            onClick={prevTestimonial}
                                            aria-label="Previous testimonial"
                                        >
                                            <ChevronLeft size={18} />
                                        </LightIconButton>
                                    )}

                                    <div className="flex-1 space-y-4">
                                        <p className="text-[17px] font-bold text-slate-950 leading-[22px]" style={{ fontFamily: "'SF Pro', -apple-system, sans-serif", fontWeight: 700 }}>
                                            "{product.testimonials[currentTestimonial].text}"
                                        </p>
                                        <p className="text-[15px] text-slate-950">
                                            {product.testimonials[currentTestimonial].name}
                                        </p>
                                    </div>

                                    {product.testimonials.length > 1 && (
                                        <LightIconButton
                                            onClick={nextTestimonial}
                                            aria-label="Next testimonial"
                                        >
                                            <ChevronRight size={18} />
                                        </LightIconButton>
                                    )}
                                </div>
                            </TahoeGlassSurface>
                        )}

                        {/* Footer Attribution */}
                        <div className="mt-12 pt-8 border-t border-slate-400/40">
                            <Link
                                href="/"
                                className="nsso-crystal-reading inline-flex min-h-11 items-center rounded-full px-4 py-2 text-slate-950 hover:text-slate-950 transition-colors text-sm font-medium focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950"
                            >
                                Sales page created with nsso →
                            </Link>
                        </div>
                    </div>

                    {/* RIGHT COLUMN - Conversion & Context */}
                    <div className="space-y-6">
                        {/* Product Card */}
                        <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin"
                            variant="panel"
                            radius={20}
                            tone="dark"
                            semanticTint="light"
                            semanticTintOpacity={0.18}
                            className="nsso-crystal-panel hidden w-full lg:block"
                            contentClassName="flex w-full flex-col items-center p-6"
                        >
                            {/* Product Image */}
                            {product.image_url && (
                                <div className="relative w-full aspect-square rounded-[12px] overflow-hidden mb-4">
                                    <Image
                                        src={product.image_url}
                                        alt={product.name}
                                        fill
                                        className="object-cover"
                                    />
                                </div>
                            )}

                            {/* Product Name */}
                            <h3 className="text-[17px] font-bold text-slate-950 mb-2 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.name}
                            </h3>

                            {/* Price */}
                            <p className="text-[29px] font-bold text-slate-950 mb-4 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.price}
                            </p>

                            {/* Purchase Link Button */}
                            {checkout.purchaseUrls.map(purchaseUrl => (
                                <div key={purchaseUrl} className="w-full max-w-[15rem] mb-3">
                                    {preview ? <PreviewCheckoutButton className="w-full [&>button]:min-h-11 [&>button]:whitespace-normal [&>button]:[overflow-wrap:anywhere] [&>button]:px-4 [&>button]:py-2 [&>button]:text-center">{productPurchaseButtonLabel(product, purchaseUrl)}</PreviewCheckoutButton> : <PurchaseLink href={purchaseUrl} label={productPurchaseButtonLabel(product, purchaseUrl)} />}
                                </div>
                            ))}

                            {/* PayPal / Apple Pay */}
                            {checkout.paypal && !!product.payment_config && (
                                <div className="w-full max-w-[15rem] flex justify-center mt-2">
                                        <PayPalSmartButton 
                                            config={product.payment_config}
                                            preview={preview}
                                            price={product.price}
                                            productName={product.name}
                                            />
                                </div>
                            )}

                            {/* Value Proposition */}
                            {product.value_proposition && (
                                <p data-product-purchase-support className="mt-4 text-center text-[15px] font-medium leading-[22px] text-slate-950">
                                    {product.value_proposition}
                                </p>
                            )}
                        </TahoeGlassSurface>

                        {/* YouTube Video Embed */}
                        {youtubeId && (
                            <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="mediaFrame" radius={20} tone="dark" contentClassName="p-4">
                                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                                    <iframe
                                        className="absolute inset-0 w-full h-full rounded-[12px]"
                                        src={`https://www.youtube.com/embed/${youtubeId}`}
                                        title="Product Video"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                </div>
                            </TahoeGlassSurface>
                        )}

                        {/* Contact Details */}
                        {!CONTACT_DETAILS_HIDDEN_PRODUCT_IDS.has(product.id) && (ownerUsername || userContacts.length > 0) && (
                            <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin" variant="card" radius={20} className="nsso-crystal-panel" tone="dark" contentClassName="p-6">
                                <h4 className="text-[15px] font-bold text-slate-950 mb-4 uppercase tracking-wider">
                                    Contact
                                </h4>
                                <div className="space-y-2">
                                    {/* Website link - always first */}
                                    {ownerUsername && (
                                        <p className="text-[15px] text-slate-950">
                                            Website: <a href={`/${ownerUsername}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-slate-950 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950">nsso.me/{ownerUsername}</a>
                                        </p>
                                    )}
                                    {/* Other contacts */}
                                    {userContacts.map((contact, index) => (
                                        <p key={index} className="text-[15px] text-slate-950">
                                            {contact.method === 'Other' ? contact.custom_method_name : contact.method}: {contact.value}
                                        </p>
                                    ))}
                                </div>
                            </TahoeGlassSurface>
                        )}
                    </div>
                </div>
            </div>
        </main>
        </ProductRouteContent>
    )
}
