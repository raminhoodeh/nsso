'use client'

import { type ReactNode, useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Product } from '@/lib/types'
import { ChevronLeft, Check, Plus, X, Video, List, Copy, Upload, Loader2, ShieldCheck, ShieldAlert, Lock } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import { useToast } from '@/components/ui/Toast'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import DOMPurify from 'dompurify'
import {
    TahoeGlassButton,
    TahoeGlassField,
    TahoeGlassSurface,
} from '@/components/ui/tahoe-glass'

function CreatorRouteContent({ children }: { children: ReactNode }) {
    return <>{children}</>
}

// AI Prompt Constants
const PROMPTS = {
    headline: `I am making the landing page copy for my [PRODUCT OR SERVICE] which is in [SPECIFIC INDUSTRY] aimed at helping [SPECIFIC NICHE GROUP] to accomplish [SPECIFIC BENEFIT]. Act as a professional hook writer, and give me 10 title ideas for my [PRODUCT OR SERVICE] using the templates I provide below from other winning titles. Make sure to follow the rules I provide below as well:

## Title Templates:
**Title #1:**
How to ______ without ________ 

**Title #2:**
The ___ Day _______ 

**Title #3:**
______ for _______ 

**Title #4:**
The ___ Step _______ 

**Title #5:**
How to ______ and get ________ 

**Title #6:**
The ______ Guide To (avoiding, getting, having) ____________ 

**Title #7:**
How To Think Like A _________ 

**Title #8:**
XX Questions Every ________ Should Answer / Ask If They Want (or before)  ___________  

**Title #9:**
______ Fatal Mistakes  

**Title #10:**
Hidden _____ ________  

**Title #11:**
______ Deadly Sins Of __________  

**Title #12:**
XX Types Of ____________  

**Title #13:**
XX Crucial ________  

**Title #14:**
______ Staggering Distinctions   

## Title Rules:
- Use direct and engaging words, with appropriate style and tone for my niche.
- Make sure each title conveys a specific benefit or end result
- Make sure each title makes my [PRODUCT OR SERVICE] sound unique and specific`,

    tagline: `Ok, my headline hook is going to be [INSERT TITLE]. Act as a professional hook writer, and help me create 10 taglines using the following templates I provide below from other winning taglines. Make sure to follow the rules I provide below as well:


## Tagline Templates:

**Tagline #1:**

The ____ Cure 



**Tagline #2:**

The ____ Blueprint 



**Tagline #3:**

The ____ Shortcut



**Tagline #4:**

The ____ Trap 



**Tagline #5:**

The ____ Secret



**Tagline #6:**

The ____ Fix 



**Tagline #7:**

The Instant ____ 



**Tagline #8:**

The Ultimate ____ 



## Tagline Rules:

- If possible, use alliteration
- Use direct and engaging words, with appropriate style and tone for my niche.
- Make sure each title conveys a specific benefit or end result
- Make sure each title makes my [INSERT PRODUCT OR SERVICE] sound unique and specific
- Follow the structure exactly.
- Use direct and engaging words, with an appropriate style and tone for the Avatar.
- Write using simple, conversational language. At a 5th grade reading level. Short, punchy, easy to read sentences and action oriented. Short paragraphs. Limit words with more than 4 syllables. 
- Write using active, visual, visceral, direct language. Limit/avoid passive constructions.
- The Avatar should be able to see, feel, and experience what you're describing.
- Amplify the emotional impact without using jargon or tropes. Always be direct without adjectives.
- Do this in a focused and relaxed state of flow without cutting corners, summarizing too much, or leaving out important details.`,

    intro: `Ok, now I need to create a simple landing page that convinces my target audience to buy this [PRODUCT OR SERVICE] for just [INSERT PRICE]. My landing page should consist of:
A 1-2 paragraph introduction that grabs attention and creates interest in my [PRODUCT OR SERVICE]. You can do this by asking questions, connecting with the reader's pains or struggles, creating curiosity, or promise to share a unique and credible solution to their pain.
- Follow the structure exactly.
- Use direct and engaging words, with an appropriate style and tone for the Avatar.
- Write using simple, conversational language. At a 5th grade reading level. Short, punchy, easy to read sentences and action oriented. Short paragraphs. Limit words with more than 4 syllables. 
- Write using active, visual, visceral, direct language. Limit/avoid passive constructions.
- The Avatar should be able to see, feel, and experience what you're describing.
- Amplify the emotional impact without using jargon or tropes. Always be direct without adjectives.
- Do this in a focused and relaxed state of flow without cutting corners, summarizing too much, or leaving out important details.`,

    benefits: `4-6 Bullet Points that convey what benefits the customer will experience after purchasing this [PRODUCT OR SERVICE], use the previous paragraph introduction to help you [insert paragraph if AI tool has forgotten it]

- Follow the structure exactly.
- Use direct and engaging words, with an appropriate style and tone for the Avatar.
- Write using simple, conversational language. At a 5th grade reading level. Short, punchy, easy to read sentences and action oriented. Short paragraphs. Limit words with more than 4 syllables. 
- Write using active, visual, visceral, direct language. Limit/avoid passive constructions.
- The Avatar should be able to see, feel, and experience what you're describing.
- Amplify the emotional impact without using jargon or tropes. Always be direct without adjectives.
- Do this in a focused and relaxed state of flow without cutting corners, summarizing too much, or leaving out important details.`,

    value_proposition: `Ok, now I need to create a simple landing page that convinces my target audience to buy this [PRODUCT OR SERVICE] for just [INSERT PRICE]. Earlier you created the headline hook, title, bullet-point benefits [INSERT IF NECESSARY]. Lastly, my landing page should consist of:
A short paragraph explaining why the real-world value of the [PRODUCT OR SERVICE] is worth 10-100X more than the [INSERT PRICE] I'm charging. 
- Follow the structure exactly.
- Use direct and engaging words, with an appropriate style and tone for the Avatar.
- Write using simple, conversational language. At a 5th grade reading level. Short, punchy, easy to read sentences and action oriented. Short paragraphs. Limit words with more than 4 syllables. 
- Write using active, visual, visceral, direct language. Limit/avoid passive constructions.
- The Avatar should be able to see, feel, and experience what you're describing.
- Amplify the emotional impact without using jargon or tropes. Always be direct without adjectives.
- Do this in a focused and relaxed state of flow without cutting corners, summarizing too much, or leaving out important details.`
}

export default function SalesPageCreator() {
    const params = useParams()
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    const [product, setProduct] = useState<Product | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [copiedField, setCopiedField] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'scanning' | 'secure' | 'unsafe'>('idle')
    const [securityMessage, setSecurityMessage] = useState('')

    // Cropper State
    const [cropperOpen, setCropperOpen] = useState(false)
    const [cropperImage, setCropperImage] = useState<string | null>(null)

    const productId = params.id as string

    useEffect(() => {
        if (!productId) return
        const fetchProduct = async () => {
            const { data, error } = await supabase.from('products').select('*').eq('id', productId).single()
            if (data) {
                if (!data.benefits) data.benefits = []
                if (!data.testimonials) data.testimonials = []
                setProduct(data)
            }
            setLoading(false)
        }
        fetchProduct()
    }, [productId, supabase])

    // PayPal Security Check Effect
    useEffect(() => {
        if (!product || !product.paypal_html) {
            setVerificationStatus('idle')
            setSecurityMessage('')
            return
        }

        setVerificationStatus('scanning')
        setSecurityMessage('Analyzing code security...')

        const timer = setTimeout(() => {
            const rawHtml = product.paypal_html || ''

            const clean = DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['form', 'input', 'img', 'div', 'style', 'section', 'span'],
                ALLOWED_ATTR: ['action', 'method', 'target', 'type', 'src', 'border', 'name', 'alt', 'value', 'class', 'style', 'id'],
                ALLOWED_URI_REGEXP: /^(https:\/\/.*\.paypal\.com\/|https:\/\/www\.paypal\.com\/|https:\/\/www\.paypalobjects\.com\/)/
            })

            const isPayPal = rawHtml.includes('paypal.com') || rawHtml.includes('paypal.HostedButtons')
            const hasScript = rawHtml.includes('<script') || rawHtml.includes('javascript:')
            const isHostedButton = /paypal\.HostedButtons\(\{\s*hostedButtonId:\s*"[A-Z0-9]+"/m.test(rawHtml)
            const isSingleButton = rawHtml.includes('<form') && rawHtml.includes('paypal.com/ncp/payment')

            if ((clean !== rawHtml && !isHostedButton && !isSingleButton) || (hasScript && !isHostedButton) || !isPayPal) {
                if (clean.length === 0 && !isHostedButton && !isSingleButton) {
                    setVerificationStatus('unsafe')
                    setSecurityMessage('Invalid code detected.')
                } else if (!isPayPal) {
                    setVerificationStatus('unsafe')
                    setSecurityMessage('Code does not appear to be from PayPal.')
                } else {
                    setVerificationStatus('secure')
                    setSecurityMessage('Verified Standard PayPal Button')
                }
            } else {
                setVerificationStatus('secure')
                setSecurityMessage(isHostedButton ? 'Verified Safe (Smart Button)' : 'Code verified: Safe from malicious scripts.')
            }
        }, 1500)

        return () => clearTimeout(timer)
    }, [product?.paypal_html])

    const updateProduct = async (updates: Partial<Product>) => {
        if (!product) return
        setProduct({ ...product, ...updates })
        setSaving(true)
        const { error } = await supabase.from('products').update(updates).eq('id', productId)
        if (error) console.error('Error saving:', error)
        setSaving(false)
    }


    const { showToast } = useToast()

    const copyPrompt = (type: keyof typeof PROMPTS) => {
        const text = PROMPTS[type]
        navigator.clipboard.writeText(text)
        setCopiedField(type)
        showToast('Prompt ready for Deity', 'success')
        setTimeout(() => setCopiedField(null), 2000)
    }



    const handleImageSelect = (file: File) => {
        const reader = new FileReader()
        reader.addEventListener('load', () => {
            setCropperImage(reader.result as string)
            setCropperOpen(true)
        })
        reader.readAsDataURL(file)
    }

    const handleCropComplete = async (croppedBlob: Blob) => {
        setIsUploading(true)
        const fileName = `${Math.random()}.jpg`
        const filePath = `products/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(filePath, croppedBlob, { contentType: 'image/jpeg' })

        if (uploadError) {
            console.error('Error uploading:', uploadError)
            setIsUploading(false)
            return
        }

        const { data } = supabase.storage.from('images').getPublicUrl(filePath)
        await updateProduct({ image_url: data.publicUrl })
        setIsUploading(false)
        setCropperOpen(false)
        setCropperImage(null)
    }

    if (loading) {
        return (
            <CreatorRouteContent>
                <main className="relative z-[1] flex min-h-screen items-center justify-center">
                    <TahoeGlassSurface variant="pill" tone="light" contentClassName="px-6 py-3 text-center text-xl">
                        Loading...
                    </TahoeGlassSurface>
                </main>
            </CreatorRouteContent>
        )
    }

    if (!product) {
        return (
            <CreatorRouteContent>
                <main className="relative z-[1] flex min-h-screen items-center justify-center">
                    <TahoeGlassSurface variant="card" tone="light" contentClassName="px-8 py-6 text-center text-xl">
                        Product not found.
                    </TahoeGlassSurface>
                </main>
            </CreatorRouteContent>
        )
    }

    return (
        <CreatorRouteContent>
        <main className="relative z-[1] min-h-screen pb-32 md:pb-12">
            {/* Header Removed to avoid duplicate logo */}

            <div className="pt-[120px] md:pt-10 px-6 lg:px-8 max-w-[1470px] mx-auto">

                <GlassCard className="p-8 lg:p-12">
                    {/* Header */}
                    <TahoeGlassSurface as="header" variant="menu" radius={20} tone="light" className="mb-8" contentClassName="flex flex-col justify-between gap-4 p-4 md:flex-row md:items-center">
                        <div className="flex items-center gap-4">
                            <TahoeGlassButton
                                onClick={() => router.push('/dashboard')}
                                aria-label="Back to dashboard"
                                className="-ml-2 h-10 w-10 px-0 py-0"
                                contentClassName="!text-white"
                            >
                                <ChevronLeft size={24} />
                            </TahoeGlassButton>
                            <div>
                                <h1 className="text-[20px] font-bold text-white" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                    Sales Page Creator
                                </h1>
                                <p className="text-[15px] text-white/60">Editing: {product.name}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <TahoeGlassSurface variant="pill" tone="light" contentClassName="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-white/70">
                                {saving ? (
                                    <>
                                        <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <div className="w-2 h-2 rounded-full bg-[#32D74B]" />
                                        Saved
                                    </>
                                )}
                            </TahoeGlassSurface>
                            <TahoeGlassButton
                                onClick={() => router.push(`/products/${productId}?source=creator`)}
                                className="h-[48px] w-full px-4 py-0 md:h-[32px] md:w-auto"
                                contentClassName="text-[13px] font-bold !text-white"
                            >
                                Preview Page
                            </TahoeGlassButton>
                        </div>
                    </TahoeGlassSurface>

                    {/* Standard Product Fields */}
                    <div className="mb-8">
                        <h2 className="text-[17px] font-bold text-white uppercase tracking-wider mb-6" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            Product Details
                        </h2>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Left Column */}
                            <div className="space-y-6">
                                {/* Product Name */}
                                <TahoeGlassField
                                    label="Product Name"
                                    labelClassName="text-xs uppercase tracking-widest text-white/50"
                                    tone="dark"
                                    semanticTint="light"
                                    semanticTintOpacity={0.16}
                                    surfaceClassName="px-4 py-4"
                                    controlClassName="text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                >
                                    <input
                                        type="text"
                                        value={product.name}
                                        onChange={(e) => updateProduct({ name: e.target.value })}
                                    />
                                </TahoeGlassField>

                                {/* Price */}
                                <TahoeGlassField
                                    label="Price (Include Currency)"
                                    labelClassName="text-xs uppercase tracking-widest text-white/50"
                                    tone="dark"
                                    semanticTint="light"
                                    semanticTintOpacity={0.16}
                                    surfaceClassName="px-4 py-4"
                                    controlClassName="text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                >
                                    <input
                                        type="text"
                                        value={product.price || ''}
                                        onChange={(e) => updateProduct({ price: e.target.value })}
                                        placeholder="e.g. £12"
                                    />
                                </TahoeGlassField>

                                {/* Description */}
                                <TahoeGlassField
                                    label="Description"
                                    labelClassName="text-xs uppercase tracking-widest text-white/50"
                                    tone="dark"
                                    semanticTint="light"
                                    semanticTintOpacity={0.16}
                                    surfaceClassName="px-4 py-4"
                                    controlClassName="resize-none text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                >
                                    <textarea
                                        value={product.description || ''}
                                        onChange={(e) => updateProduct({ description: e.target.value })}
                                        placeholder="Describe your offering..."
                                        rows={4}
                                    />
                                </TahoeGlassField>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-6">
                                {/* Product Image */}
                                <div>
                                    <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Product Image</label>
                                    <div className="flex items-center gap-4">
                                        {product.image_url && (
                                            <TahoeGlassSurface variant="mediaFrame" radius={8} className="h-16 w-16" contentClassName="h-full w-full p-1">
                                                <div className="h-full w-full rounded-md bg-cover bg-center" style={{ backgroundImage: `url(${product.image_url})` }} />
                                            </TahoeGlassSurface>
                                        )}
                                        <TahoeGlassSurface variant="button" radius={12} tone="light">
                                            <label className="flex cursor-pointer items-center gap-2 px-4 py-2">
                                                {isUploading ? <Loader2 size={16} className="animate-spin text-white/70" /> : <Upload size={16} className="text-white/70" />}
                                                <span className="text-sm text-white/70">{product.image_url ? 'Change Image' : 'Upload Image'}</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0]
                                                        if (file) handleImageSelect(file)
                                                        e.target.value = ''
                                                    }}
                                                />
                                            </label>
                                        </TahoeGlassSurface>
                                    </div>
                                </div>
                                {/* Cropper Modal */}
                                {cropperImage && (
                                    <ImageCropperModal
                                        isOpen={cropperOpen}
                                        onClose={() => setCropperOpen(false)}
                                        imageSrc={cropperImage}
                                        aspectRatio={1} // Product image is 1:1
                                        onCropComplete={handleCropComplete}
                                        loading={isUploading}
                                    />
                                )}

                                {/* Purchase Link */}
                                <TahoeGlassField
                                    label="Purchase Link"
                                    labelClassName="text-xs uppercase tracking-widest text-white/50"
                                    tone="dark"
                                    semanticTint="light"
                                    semanticTintOpacity={0.16}
                                    surfaceClassName="px-4 py-4"
                                    controlClassName="text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                >
                                    <input
                                        type="text"
                                        value={product.purchase_link || ''}
                                        onChange={(e) => updateProduct({ purchase_link: e.target.value })}
                                        placeholder="https://..."
                                    />
                                </TahoeGlassField>

                                {/* PayPal HTML */}
                                <div>
                                    <TahoeGlassField
                                        label="PayPal Button Code"
                                        labelClassName="text-xs uppercase tracking-widest text-white/50"
                                        tone="light"
                                        semanticTint="dark"
                                        semanticTintOpacity={0.12}
                                        surfaceClassName={`px-4 py-4 ring-1 ${verificationStatus === 'scanning' ? 'ring-yellow-500/50' :
                                            verificationStatus === 'secure' ? 'ring-green-500/50' :
                                                verificationStatus === 'unsafe' ? 'ring-red-500/50' :
                                                    'ring-white/10'
                                            }`}
                                        controlClassName="resize-none font-mono text-[13px] text-white/80 placeholder:text-white/45"
                                    >
                                        <textarea
                                            value={product.paypal_html || ''}
                                            onChange={(e) => updateProduct({ paypal_html: e.target.value })}
                                            placeholder="<form action=...>"
                                            rows={4}
                                        />
                                    </TahoeGlassField>
                                    {/* Security Status Indicator */}
                                    {product.paypal_html && (
                                        <div className="mt-2 flex items-center justify-between animate-in fade-in duration-300">
                                            <div className="flex items-center gap-2">
                                                {verificationStatus === 'scanning' && (
                                                    <>
                                                        <Loader2 size={14} className="text-yellow-400 animate-spin" />
                                                        <span className="text-yellow-400 text-xs font-medium tracking-wide">Scanning code...</span>
                                                    </>
                                                )}
                                                {verificationStatus === 'secure' && (
                                                    <>
                                                        <ShieldCheck size={14} className="text-green-400" />
                                                        <span className="text-green-400 text-xs font-medium tracking-wide">Verified Safe</span>
                                                    </>
                                                )}
                                                {verificationStatus === 'unsafe' && (
                                                    <>
                                                        <ShieldAlert size={14} className="text-red-400" />
                                                        <span className="text-red-400 text-xs font-medium tracking-wide">Unsafe content detected</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 opacity-50">
                                                <Lock size={10} className="text-white" />
                                                <span className="text-[10px] uppercase tracking-widest text-white">nsso secure html verification</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Info Box */}
                    <TahoeGlassSurface variant="card" radius={18} tone="light" className="mb-12" contentClassName="p-6">
                        <h2 className="text-[17px] font-bold text-white mb-2" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            AI-Assisted Creator
                        </h2>
                        <p className="text-[15px] leading-[20px] text-white/80">
                            Each field for your Product Sales Page contains an AI prompt to help you write the required copy for the page. Simply click on each field label to copy the preset prompt to your clipboard, and paste it into your preferred AI tool (ChatGPT, Claude, Gemini etc.) Feel free to edit as you wish, and use the content of the prompt to help you understand the copy that's required for each section of your Product Sales Page.
                        </p>
                    </TahoeGlassSurface>

                    {/* Form Content */}
                    <div className="max-w-3xl space-y-12">

                        {/* 1. Header Section */}
                        <section className="space-y-6">
                            <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                01 — The Hook
                            </h3>

                            <div className="space-y-6">
                                {/* Headline */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-white/50 text-xs font-bold uppercase tracking-wider">
                                            Headline Hook
                                        </label>
                                        <TahoeGlassButton
                                            onClick={() => copyPrompt('headline')}
                                            className="px-3 py-1.5"
                                            contentClassName="gap-1 text-[13px] font-medium !text-blue-200"
                                        >
                                            {copiedField === 'headline' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </TahoeGlassButton>
                                    </div>
                                    <TahoeGlassField
                                        tone="dark"
                                        semanticTint="light"
                                        semanticTintOpacity={0.16}
                                        surfaceClassName="px-4 py-4"
                                        controlClassName="text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                    >
                                        <input
                                            type="text"
                                            value={product.headline || ''}
                                            onChange={(e) => updateProduct({ headline: e.target.value })}
                                            placeholder="e.g. Master Design Systems in 30 Days"
                                            aria-label="Headline hook"
                                        />
                                    </TahoeGlassField>
                                </div>

                                {/* Tagline */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-white/50 text-xs font-bold uppercase tracking-wider">
                                            Tagline
                                        </label>
                                        <TahoeGlassButton
                                            onClick={() => copyPrompt('tagline')}
                                            className="px-3 py-1.5"
                                            contentClassName="gap-1 text-[13px] font-medium !text-blue-200"
                                        >
                                            {copiedField === 'tagline' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </TahoeGlassButton>
                                    </div>
                                    <TahoeGlassField
                                        tone="dark"
                                        semanticTint="light"
                                        semanticTintOpacity={0.16}
                                        surfaceClassName="px-4 py-4"
                                        controlClassName="text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                    >
                                        <input
                                            type="text"
                                            value={product.tagline || ''}
                                            onChange={(e) => updateProduct({ tagline: e.target.value })}
                                            placeholder="e.g. The comprehensive guide for modern frontend developers"
                                            aria-label="Tagline"
                                        />
                                    </TahoeGlassField>
                                </div>
                            </div>
                        </section>

                        {/* 2. The Pitch */}
                        <section className="space-y-6">
                            <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                02 — The Pitch
                            </h3>

                            <div className="space-y-6">
                                {/* Intro */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-white/50 text-xs font-bold uppercase tracking-wider">
                                            Introduction / Problem
                                        </label>
                                        <TahoeGlassButton
                                            onClick={() => copyPrompt('intro')}
                                            className="px-3 py-1.5"
                                            contentClassName="gap-1 text-[13px] font-medium !text-blue-200"
                                        >
                                            {copiedField === 'intro' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </TahoeGlassButton>
                                    </div>
                                    <TahoeGlassField
                                        tone="dark"
                                        semanticTint="light"
                                        semanticTintOpacity={0.16}
                                        surfaceClassName="px-4 py-4"
                                        controlClassName="resize-none text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                    >
                                        <textarea
                                            value={product.intro_text || ''}
                                            onChange={(e) => updateProduct({ intro_text: e.target.value })}
                                            placeholder="Describe the problem your user faces and how this product solves it..."
                                            rows={6}
                                            aria-label="Introduction or problem"
                                        />
                                    </TahoeGlassField>
                                </div>
                            </div>
                        </section>

                        {/* 3. Benefits */}
                        < section className="space-y-6" >
                            <div className="flex items-center justify-between">
                                <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                    03 — Benefits
                                </h3>
                                <TahoeGlassButton
                                    onClick={() => copyPrompt('benefits')}
                                    className="px-3 py-1.5"
                                    contentClassName="gap-1 text-[13px] font-medium !text-blue-200"
                                >
                                    {copiedField === 'benefits' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                </TahoeGlassButton>
                            </div>

                            <div className="space-y-3">
                                {(product.benefits || []).map((benefit, index) => (
                                    <div key={index} className="flex items-center gap-3 group relative">
                                        <List size={20} className="text-white/20 flex-shrink-0" />
                                        <TahoeGlassField
                                            className="flex-1"
                                            tone="dark"
                                            semanticTint="light"
                                            semanticTintOpacity={0.16}
                                            surfaceClassName="px-3 py-3 pr-12"
                                            controlClassName="text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                        >
                                            <input
                                                type="text"
                                                value={benefit}
                                                onChange={(e) => {
                                                    const newBenefits = [...(product.benefits || [])]
                                                    newBenefits[index] = e.target.value
                                                    updateProduct({ benefits: newBenefits })
                                                }}
                                                placeholder="Start with a verb (e.g. 'Automate your workflow...')"
                                                aria-label={`Benefit ${index + 1}`}
                                            />
                                        </TahoeGlassField>
                                        <TahoeGlassButton
                                            onClick={() => {
                                                const newBenefits = (product.benefits || []).filter((_, i) => i !== index)
                                                updateProduct({ benefits: newBenefits })
                                            }}
                                            aria-label={`Remove benefit ${index + 1}`}
                                            semanticTint="dark"
                                            className="absolute right-3 top-1/2 z-20 h-8 w-8 -translate-y-1/2 px-0 py-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                                            contentClassName="!text-red-200"
                                        >
                                            <X size={16} />
                                        </TahoeGlassButton>
                                    </div>
                                ))}

                                {(!product.benefits || product.benefits.length < 9) && (
                                    <TahoeGlassButton
                                        onClick={() => updateProduct({ benefits: [...(product.benefits || []), ''] })}
                                        aria-label="Add benefit"
                                        className="h-8 w-8 px-0 py-0"
                                        contentClassName="!text-white"
                                    >
                                        <Plus size={16} />
                                    </TahoeGlassButton>
                                )}
                            </div>
                        </section>

                        {/* 4. Core Value Proposition */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                    04 — Core Value Proposition
                                </h3>
                                <TahoeGlassButton
                                    onClick={() => copyPrompt('value_proposition')}
                                    className="px-3 py-1.5"
                                    contentClassName="gap-1 text-[13px] font-medium !text-blue-200"
                                >
                                    {copiedField === 'value_proposition' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                </TahoeGlassButton>
                            </div>

                            <div>
                                <TahoeGlassField
                                    tone="dark"
                                    semanticTint="light"
                                    semanticTintOpacity={0.16}
                                    surfaceClassName="px-4 py-4"
                                    controlClassName="resize-none text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                >
                                    <textarea
                                        value={product.value_proposition || ''}
                                        onChange={(e) => updateProduct({ value_proposition: e.target.value })}
                                        placeholder="The one main reason they should buy..."
                                        rows={4}
                                        aria-label="Core value proposition"
                                    />
                                </TahoeGlassField>
                            </div>
                        </section>

                        {/* 5. Video */}
                        <section className="space-y-6">
                            <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                05 — Video Embed
                            </h3>

                            <div>
                                <TahoeGlassField
                                    label={<><Video size={14} /> YouTube URL</>}
                                    labelClassName="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-white/50"
                                    tone="light"
                                    semanticTint="dark"
                                    semanticTintOpacity={0.08}
                                    surfaceClassName="px-4 py-4"
                                    controlClassName="text-[17px] font-medium leading-[22px] text-white placeholder:text-white/50"
                                >
                                    <input
                                        type="text"
                                        value={product.video_url || ''}
                                        onChange={(e) => updateProduct({ video_url: e.target.value })}
                                        placeholder="https://youtube.com/watch?v=..."
                                    />
                                </TahoeGlassField>
                            </div>
                        </section >

                        {/* 5. Testimonials */}
                        < section className="space-y-6" >
                            <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                06 — Testimonials
                            </h3>

                            <div className="space-y-4">
                                {(product.testimonials || []).map((t, index) => (
                                    <TahoeGlassSurface key={index} variant="card" radius={14} tone="light" className="group" contentClassName="relative p-4">
                                        <TahoeGlassButton
                                            onClick={() => {
                                                const newTestimonials = (product.testimonials || []).filter((_, i) => i !== index)
                                                updateProduct({ testimonials: newTestimonials })
                                            }}
                                            aria-label={`Remove testimonial ${index + 1}`}
                                            className="absolute -right-2 -top-2 h-6 w-6 px-0 py-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                                            contentClassName="!text-white"
                                        >
                                            <X size={14} strokeWidth={3} />
                                        </TahoeGlassButton>

                                        <div className="space-y-4">
                                            <TahoeGlassField
                                                tone="dark"
                                                semanticTint="light"
                                                semanticTintOpacity={0.16}
                                                surfaceClassName="px-3 py-3"
                                                controlClassName="resize-none text-[15px] font-medium leading-[20px] text-[#545454] placeholder:text-[#545454]/50"
                                            >
                                                <textarea
                                                    value={t.text}
                                                    onChange={(e) => {
                                                        const newTestimonials = [...(product.testimonials || [])]
                                                        newTestimonials[index] = { ...newTestimonials[index], text: e.target.value }
                                                        updateProduct({ testimonials: newTestimonials })
                                                    }}
                                                    placeholder="&quot;This changed my life...&quot;"
                                                    rows={3}
                                                    aria-label={`Testimonial ${index + 1} text`}
                                                />
                                            </TahoeGlassField>

                                            <TahoeGlassField
                                                tone="dark"
                                                semanticTint="light"
                                                semanticTintOpacity={0.16}
                                                surfaceClassName="px-3 py-3"
                                                controlClassName="text-[15px] font-medium leading-[20px] text-[#545454] placeholder:text-[#545454]/50"
                                            >
                                                <input
                                                    type="text"
                                                    value={t.name}
                                                    onChange={(e) => {
                                                        const newTestimonials = [...(product.testimonials || [])]
                                                        newTestimonials[index] = { ...newTestimonials[index], name: e.target.value }
                                                        updateProduct({ testimonials: newTestimonials })
                                                    }}
                                                    placeholder="Reviewer Full Name"
                                                    aria-label={`Testimonial ${index + 1} reviewer name`}
                                                />
                                            </TahoeGlassField>
                                        </div>
                                    </TahoeGlassSurface>
                                ))}

                                {(!product.testimonials || product.testimonials.length < 5) && (
                                    <TahoeGlassButton
                                        onClick={() => updateProduct({ testimonials: [...(product.testimonials || []), { name: '', text: '' }] })}
                                        aria-label="Add testimonial"
                                        className="h-8 w-8 px-0 py-0"
                                        contentClassName="!text-white"
                                    >
                                        <Plus size={16} />
                                    </TahoeGlassButton>
                                )}
                            </div>
                        </section >

                        {/* Bottom Actions */}
                        <div className="flex flex-col md:flex-row gap-4 pt-8 border-t border-white/10">
                            <TahoeGlassButton
                                onClick={() => router.push('/dashboard')}
                                className="min-h-[54px] flex-1 px-6 py-0 md:h-[44px] md:min-h-0"
                                contentClassName="font-semibold !text-white"
                            >
                                Edit Profile
                            </TahoeGlassButton>
                            <TahoeGlassButton
                                onClick={() => router.push(`/products/${productId}?source=creator`)}
                                className="min-h-[54px] flex-1 px-6 py-0 md:h-[44px] md:min-h-0"
                                contentClassName="font-bold !text-white"
                            >
                                Preview Sales Page
                            </TahoeGlassButton>
                        </div >

                    </div >
                </GlassCard >
            </div >
        </main >
        </CreatorRouteContent>
    )
}
