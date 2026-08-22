'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import {
    TahoeGlassButton,
    TahoeGlassSurface,
} from '@/components/ui/tahoe-glass'

function ProductRouteContent({ children }: { children: ReactNode }) {
    return <>{children}</>
}

function PurchaseLink({ href }: { href: string }) {
    return (
        <TahoeGlassSurface
            as="a"
            variant="button"
            radius={12}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            tone="light"
            className="h-[44px] w-full transition-transform hover:scale-[1.02] active:scale-[0.98]"
            contentClassName="flex h-full w-full items-center justify-center px-4 text-[16px] font-semibold tracking-wide"
        >
            Link to Purchase
        </TahoeGlassSurface>
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
    paypal_html: string
    success_url?: string
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
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const [product, setProduct] = useState<Product | null>(null)
    const [userContacts, setUserContacts] = useState<Contact[]>([])
    const [ownerUsername, setOwnerUsername] = useState<string>('')
    const [isOwner, setIsOwner] = useState(false)
    const [isPlatformOwner, setIsPlatformOwner] = useState(false)
    const [currentTestimonial, setCurrentTestimonial] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            const productId = params.id as string

            // Fetch product
            const { data: productData } = await supabase
                .from('products')
                .select('*')
                .eq('id', productId)
                .single()

            if (productData) {
                setProduct(productData)

                if (CONTACT_DETAILS_HIDDEN_PRODUCT_IDS.has(productId)) {
                    setUserContacts([])
                } else {
                    // Fetch user contacts for contact details
                    const { data: contactsData } = await supabase
                        .from('contacts')
                        .select('method, value, custom_method_name')
                        .eq('user_id', productData.user_id)

                    if (contactsData) {
                        setUserContacts(contactsData)
                    }
                }

                // Fetch owner's username and email to check platform ownership
                const { data: userData } = await supabase
                    .from('users')
                    .select('username, email')
                    .eq('id', productData.user_id)
                    .single()

                if (userData?.username) {
                    setOwnerUsername(userData.username)
                }

                if (userData?.email === 'raminhoodeh@gmail.com') {
                    setIsPlatformOwner(true)
                }

                // Check if current user is owner
                const { data: { session } } = await supabase.auth.getSession()
                setIsOwner(session?.user?.id === productData.user_id)
            }

            setLoading(false)
        }

        fetchData()
    }, [params.id, supabase])

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

    if (loading) {
        return (
            <ProductRouteContent>
                <div className="relative z-[1] flex min-h-screen items-center justify-center">
                    <TahoeGlassSurface variant="pill" tone="light" contentClassName="px-6 py-3 text-white/80">
                        Loading...
                    </TahoeGlassSurface>
                </div>
            </ProductRouteContent>
        )
    }

    if (!product) {
        return (
            <ProductRouteContent>
                <div className="relative z-[1] flex min-h-screen items-center justify-center">
                    <TahoeGlassSurface variant="card" tone="light" contentClassName="px-8 py-6 text-white/80">
                        Product not found
                    </TahoeGlassSurface>
                </div>
            </ProductRouteContent>
        )
    }

    const youtubeId = product.video_url ? extractYouTubeId(product.video_url) : null

    return (
        <ProductRouteContent>
        <main className="relative z-[1] min-h-screen p-4 md:p-8">
            <div className="max-w-[1400px] mx-auto">
                {/* Golden Ratio Grid: 1.618fr 1fr */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.618fr_1fr] gap-8">

                    {/* LEFT COLUMN - Primary Content */}
                    <div className="space-y-8 px-3 md:px-16">
                        {/* Back Button */}
                        <div className="mb-8">
                            <TahoeGlassButton
                                onClick={() => {
                                    if (isOwner) {
                                        if (searchParams.get('source') === 'creator') {
                                            router.push(`/dashboard/products/${product.id}/creator`)
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
                                contentClassName="gap-2 text-[15px] font-semibold !text-white"
                            >
                                <ChevronLeft size={16} />
                                {isOwner && searchParams.get('source') === 'creator'
                                    ? 'Back to Sales Page Creator'
                                    : 'Back to Profile'}
                            </TahoeGlassButton>
                        </div>

                        {/* Headline Hook */}
                        <h1 className="text-[29px] font-bold text-white uppercase tracking-wide leading-[38px]" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            {product.headline}
                        </h1>

                        {/* Tagline */}
                        <h2 className="text-[29px] font-bold text-white leading-[38px]" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            {product.tagline}
                        </h2>

                        {/* Intro */}
                        <p className="text-[17px] text-white/80 leading-[22px] whitespace-pre-wrap" style={{ fontFamily: "'SF Pro', -apple-system, sans-serif", fontWeight: 510 }}>
                            {product.intro_text}
                        </p>

                        {/* Mobile-only Product Card — shown early so users see the product before the bullet list */}
                        <TahoeGlassSurface
                            variant="panel"
                            radius={20}
                            tone="dark"
                            semanticTint="light"
                            semanticTintOpacity={0.16}
                            className="w-full lg:hidden"
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
                            <h3 className="text-[17px] font-bold text-slate-900 mb-2 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.name}
                            </h3>

                            {/* Price */}
                            <p className="text-[29px] font-bold text-slate-800 mb-4 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.price}
                            </p>

                            {/* Purchase Link Button */}
                            {product.purchase_link && (
                                <div className="w-full max-w-[280px] mb-3">
                                    <PurchaseLink href={product.purchase_link} />
                                </div>
                            )}

                            {/* PayPal Button */}
                            {product.paypal_html && (
                                <div className="w-full max-w-[280px] flex justify-center mt-2">
                                    <PayPalSmartButton 
                                        html={product.paypal_html} 
                                        isPlatformOwner={isPlatformOwner} 
                                        price={product.price}
                                        productName={product.name}
                                        successUrl={product.success_url}
                                    />
                                </div>
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
                                        <li key={index} className="flex items-start gap-3 text-[17px] text-white/80 leading-[22px]" style={{ fontFamily: "'SF Pro', -apple-system, sans-serif" }}>
                                            <span className="text-white/40 mt-1" style={{ fontStyle: 'normal', fontWeight: 400 }}>•</span>
                                            <span style={{
                                                fontWeight: isIncludes ? 400 : 510,
                                                fontStyle: isIncludes ? 'italic' : 'normal',
                                            }}>{cleanBenefit}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {/* Guarantee Card */}
                        <TahoeGlassSurface variant="card" radius={20} tone="light" contentClassName="p-6">
                            <div className="grid grid-cols-[17.5%_82.5%] items-center gap-6">
                                <div className="relative w-full aspect-square">
                                    <Image
                                        src="/guaranteed-logo.png"
                                        alt="Guarantee"
                                        fill
                                        className="object-contain"
                                    />
                                </div>
                                <p className="text-[17px] font-bold text-white leading-[22px] px-4" style={{ fontFamily: "'SF Pro', -apple-system, sans-serif", fontWeight: 700 }}>
                                    100% Guaranteed Satisfaction! If the {product.name} is not for you, I'll refund you – no questions asked.
                                </p>
                            </div>
                        </TahoeGlassSurface>

                        {/* Testimonial Carousel */}
                        {product.testimonials && product.testimonials.length > 0 && (
                            <TahoeGlassSurface variant="card" radius={20} tone="light" contentClassName="p-3 md:p-8">
                                <div className="flex items-center gap-2 md:gap-4">
                                    {product.testimonials.length > 1 && (
                                        <TahoeGlassButton
                                            onClick={prevTestimonial}
                                            aria-label="Previous testimonial"
                                            className="h-8 w-8 shrink-0 px-0 py-0 md:h-10 md:w-10"
                                            contentClassName="!text-white"
                                        >
                                            <ChevronLeft size={18} />
                                        </TahoeGlassButton>
                                    )}

                                    <div className="flex-1 space-y-4">
                                        <p className="text-[17px] font-bold text-white leading-[22px]" style={{ fontFamily: "'SF Pro', -apple-system, sans-serif", fontWeight: 700 }}>
                                            "{product.testimonials[currentTestimonial].text}"
                                        </p>
                                        <p className="text-[15px] text-white/60">
                                            — {product.testimonials[currentTestimonial].name}
                                        </p>
                                    </div>

                                    {product.testimonials.length > 1 && (
                                        <TahoeGlassButton
                                            onClick={nextTestimonial}
                                            aria-label="Next testimonial"
                                            className="h-8 w-8 shrink-0 px-0 py-0 md:h-10 md:w-10"
                                            contentClassName="!text-white"
                                        >
                                            <ChevronRight size={18} />
                                        </TahoeGlassButton>
                                    )}
                                </div>
                            </TahoeGlassSurface>
                        )}

                        {/* Footer Attribution */}
                        <div className="mt-12 pt-8 border-t border-white/10">
                            <Link
                                href="/"
                                className="text-white/60 hover:text-white/80 transition-colors text-sm font-medium"
                            >
                                Sales page created with nsso →
                            </Link>
                        </div>
                    </div>

                    {/* RIGHT COLUMN - Conversion & Context */}
                    <div className="space-y-6">
                        {/* Product Card */}
                        <TahoeGlassSurface
                            variant="panel"
                            radius={20}
                            tone="dark"
                            semanticTint="light"
                            semanticTintOpacity={0.16}
                            className="w-full"
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
                            <h3 className="text-[17px] font-bold text-slate-900 mb-2 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.name}
                            </h3>

                            {/* Price */}
                            <p className="text-[29px] font-bold text-slate-800 mb-4 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.price}
                            </p>

                            {/* Purchase Link Button */}
                            {product.purchase_link && (
                                <div className="w-full max-w-[280px] mb-3">
                                    <PurchaseLink href={product.purchase_link} />
                                </div>
                            )}

                            {/* PayPal / Apple Pay */}
                            {product.paypal_html && (
                                <div className="w-full max-w-[320px] flex justify-center mt-2">
                                        <PayPalSmartButton 
                                            html={product.paypal_html} 
                                            isPlatformOwner={isPlatformOwner} 
                                            price={product.price}
                                            productName={product.name}
                                            successUrl={product.success_url}
                                        />
                                </div>
                            )}

                            {/* Value Proposition */}
                            {product.value_proposition && (
                                <p className="text-[15px] md:text-[13px] text-slate-500 leading-[20px] md:leading-[18px] mt-4 text-center font-medium">
                                    {product.value_proposition}
                                </p>
                            )}
                        </TahoeGlassSurface>

                        {/* YouTube Video Embed */}
                        {youtubeId && (
                            <TahoeGlassSurface variant="mediaFrame" radius={20} tone="light" contentClassName="p-4">
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
                            <TahoeGlassSurface variant="card" radius={20} tone="light" contentClassName="p-6">
                                <h4 className="text-[15px] font-bold text-white mb-4 uppercase tracking-wider">
                                    Contact
                                </h4>
                                <div className="space-y-2">
                                    {/* Website link - always first */}
                                    {ownerUsername && (
                                        <p className="text-[15px] text-white/80">
                                            Website: <a href={`/${ownerUsername}`} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">nsso.me/{ownerUsername}</a>
                                        </p>
                                    )}
                                    {/* Other contacts */}
                                    {userContacts.map((contact, index) => (
                                        <p key={index} className="text-[15px] text-white/80">
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
