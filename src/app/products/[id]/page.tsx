'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'

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

                // Fetch user contacts for contact details
                const { data: contactsData } = await supabase
                    .from('contacts')
                    .select('method, value, custom_method_name')
                    .eq('user_id', productData.user_id)

                if (contactsData) {
                    setUserContacts(contactsData)
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
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-white/60">Loading...</div>
            </div>
        )
    }

    if (!product) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-white/60">Product not found</div>
            </div>
        )
    }

    const youtubeId = product.video_url ? extractYouTubeId(product.video_url) : null

    return (
        <div className="min-h-screen bg-[#43628c] p-4 md:p-8">
            <div className="max-w-[1400px] mx-auto">
                {/* Golden Ratio Grid: 1.618fr 1fr */}
                <div className="grid grid-cols-1 lg:grid-cols-[1.618fr_1fr] gap-8">

                    {/* LEFT COLUMN - Primary Content */}
                    <div className="space-y-8 px-3 md:px-16">
                        {/* Back Button */}
                        <div className="mb-8">
                            <button
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
                                className="relative rounded-full overflow-hidden isolate px-4 py-2 text-[15px] font-semibold text-white text-center transition-all duration-200 ease-out bg-transparent hover:bg-[rgba(255,255,255,0.1)]"
                                style={{ backdropFilter: 'blur(10px)' }}
                            >
                                {/* Lighten layer */}
                                <div className="absolute inset-0 pointer-events-none rounded-[inherit] bg-[rgba(255,255,255,0.06)] mix-blend-lighten" aria-hidden="true" />
                                {/* Color dodge layer */}
                                <div className="absolute inset-0 pointer-events-none rounded-[inherit] bg-[rgba(94,94,94,0.18)] mix-blend-color-dodge" aria-hidden="true" />
                                {/* Content */}
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                    <ChevronLeft size={16} />
                                    {isOwner && searchParams.get('source') === 'creator'
                                        ? 'Back to Sales Page Creator'
                                        : 'Back to Profile'}
                                </span>
                            </button>
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
                        <div className="lg:hidden relative rounded-[20px] overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 p-6 w-full flex flex-col items-center">
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
                            <h3 className="text-[17px] font-bold text-white mb-2 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.name}
                            </h3>

                            {/* Price */}
                            <p className="text-[29px] font-bold text-white mb-4 text-center" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                {product.price}
                            </p>

                            {/* Purchase Link Button */}
                            {product.purchase_link && (
                                <div className="w-full max-w-[280px] mb-3">
                                    <div
                                        className="p-[0.75px] rounded-[12px]"
                                        style={{
                                            background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)'
                                        }}
                                    >
                                        <a
                                            href={product.purchase_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="relative h-[44px] w-full rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                                            style={{
                                                boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)'
                                            }}
                                        >
                                            <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" />
                                            <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" />
                                            <span
                                                className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide"
                                                style={{
                                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                    fontWeight: 590
                                                }}
                                            >
                                                Link to Purchase
                                            </span>
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* PayPal Button */}
                            {product.paypal_html && (
                                <div className="w-full max-w-[280px] flex justify-center">
                                    <PayPalSmartButton 
                                        html={product.paypal_html} 
                                        isPlatformOwner={isPlatformOwner} 
                                        price={product.price}
                                        productName={product.name}
                                        successUrl={isPlatformOwner ? "https://drive.google.com/drive/folders/1MF0xhcGp3GI7CJhj9TcotxLex_rahkWu?usp=sharing" : undefined}
                                    />
                                </div>
                            )}
                        </div>

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
                        <div className="relative rounded-[20px] overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 p-6">
                            <div className="grid grid-cols-[17.5%_82.5%] gap-6 items-center">
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
                        </div>

                        {/* Testimonial Carousel */}
                        {product.testimonials && product.testimonials.length > 0 && (
                            <div className="relative rounded-[20px] overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 p-3 md:p-8">
                                <div className="flex items-center gap-2 md:gap-4">
                                    {product.testimonials.length > 1 && (
                                        <button
                                            onClick={prevTestimonial}
                                            className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                                        >
                                            <ChevronLeft size={18} className="text-white" />
                                        </button>
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
                                        <button
                                            onClick={nextTestimonial}
                                            className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors flex-shrink-0"
                                        >
                                            <ChevronRight size={18} className="text-white" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Footer Attribution */}
                        <div className="mt-12 pt-8 border-t border-white/10">
                            <a
                                href="/"
                                className="text-white/60 hover:text-white/80 transition-colors text-sm font-medium"
                            >
                                Sales page created with nsso →
                            </a>
                        </div>
                    </div>

                    {/* RIGHT COLUMN - Conversion & Context */}
                    <div className="space-y-6">
                        {/* Product Card */}
                        <div className="relative rounded-[20px] overflow-hidden bg-white shadow-lg border border-slate-200 p-6 w-full flex flex-col items-center">
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
                                    <div
                                        className="p-[0.75px] rounded-[12px]"
                                        style={{
                                            background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.05) 100%)'
                                        }}
                                    >
                                        <a
                                            href={product.purchase_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="relative h-[44px] w-full rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98] bg-slate-900"
                                            style={{
                                                boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)'
                                            }}
                                        >
                                            <span
                                                className="relative z-10 text-[16px] font-semibold text-white tracking-wide"
                                                style={{
                                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                    fontWeight: 590
                                                }}
                                            >
                                                Link to Purchase
                                            </span>
                                        </a>
                                    </div>
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
                        </div>

                        {/* YouTube Video Embed */}
                        {youtubeId && (
                            <div className="relative rounded-[20px] overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 p-4">
                                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                                    <iframe
                                        className="absolute inset-0 w-full h-full rounded-[12px]"
                                        src={`https://www.youtube.com/embed/${youtubeId}`}
                                        title="Product Video"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                    />
                                </div>
                            </div>
                        )}

                        {/* Contact Details */}
                        {(ownerUsername || userContacts.length > 0) && (
                            <div className="relative rounded-[20px] overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 p-6">
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
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
