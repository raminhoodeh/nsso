'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Product } from '@/lib/types'
import { ChevronLeft, Check, Plus, X, Video, List, Copy, Upload, Loader2, ShieldCheck, ShieldAlert, Lock } from 'lucide-react'
import GlassCard from '@/components/ui/GlassCard'
import Header from '@/components/layout/Header'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import DOMPurify from 'dompurify'

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

    const copyPrompt = (type: keyof typeof PROMPTS) => {
        const text = PROMPTS[type]
        navigator.clipboard.writeText(text)
        setCopiedField(type)
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
            <main className="min-h-screen flex items-center justify-center">
                <div className="text-white text-xl text-center">
                    Loading...
                </div>
            </main>
        )
    }

    if (!product) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <div className="text-white text-xl text-center">
                    Product not found.
                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen pb-32 md:pb-12">
            <Header />

            <div className="pt-[120px] px-6 lg:px-[165px] max-w-[1470px] mx-auto">

                <GlassCard className="p-8 lg:p-12">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 pb-6 border-b border-white/10 gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
                            >
                                <ChevronLeft className="text-white" size={24} />
                            </button>
                            <div>
                                <h1 className="text-[20px] font-bold text-white" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                    Sales Page Creator
                                </h1>
                                <p className="text-[15px] text-white/60">Editing: {product.name}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-[13px] font-medium text-white/60 flex items-center gap-2">
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
                            </div>
                            <button
                                onClick={() => router.push(`/products/${productId}?source=creator`)}
                                className="md:h-[32px] h-[48px] md:w-auto w-full px-4 rounded-full bg-white text-black text-[13px] font-bold hover:bg-white/90 transition-colors"
                            >
                                Preview Page
                            </button>
                        </div>
                    </div>

                    {/* Standard Product Fields */}
                    <div className="mb-8">
                        <h2 className="text-[17px] font-bold text-white uppercase tracking-wider mb-6" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            Product Details
                        </h2>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Left Column */}
                            <div className="space-y-6">
                                {/* Product Name */}
                                <div>
                                    <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Product Name</label>
                                    <div className="relative rounded-[12px] overflow-hidden">
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                        <input
                                            type="text"
                                            value={product.name}
                                            onChange={(e) => updateProduct({ name: e.target.value })}
                                            className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)]"
                                        />
                                    </div>
                                </div>

                                {/* Price */}
                                <div>
                                    <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Price (Include Currency)</label>
                                    <div className="relative rounded-[12px] overflow-hidden">
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                        <input
                                            type="text"
                                            value={product.price || ''}
                                            onChange={(e) => updateProduct({ price: e.target.value })}
                                            placeholder="e.g. £12"
                                            className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)]"
                                        />
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Description</label>
                                    <div className="relative rounded-[12px] overflow-hidden">
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                        <textarea
                                            value={product.description || ''}
                                            onChange={(e) => updateProduct({ description: e.target.value })}
                                            placeholder="Describe your offering..."
                                            rows={4}
                                            className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)] resize-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Right Column */}
                            <div className="space-y-6">
                                {/* Product Image */}
                                <div>
                                    <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Product Image</label>
                                    <div className="flex items-center gap-4">
                                        {product.image_url && (
                                            <div className="w-16 h-16 rounded-lg bg-white/5 bg-cover bg-center border border-white/10" style={{ backgroundImage: `url(${product.image_url})` }} />
                                        )}
                                        <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10">
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
                                <div>
                                    <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Purchase Link</label>
                                    <div className="relative rounded-[12px] overflow-hidden">
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                        <input
                                            type="text"
                                            value={product.purchase_link || ''}
                                            onChange={(e) => updateProduct({ purchase_link: e.target.value })}
                                            placeholder="https://..."
                                            className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)]"
                                        />
                                    </div>
                                </div>

                                {/* PayPal HTML */}
                                <div>
                                    <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">PayPal Button Code</label>
                                    <textarea
                                        value={product.paypal_html || ''}
                                        onChange={(e) => updateProduct({ paypal_html: e.target.value })}
                                        placeholder="<form action=...>"
                                        rows={4}
                                        className={`w-full bg-black/20 rounded-lg p-4 text-white/80 text-[13px] font-mono focus:outline-none border transition-colors ${verificationStatus === 'scanning' ? 'border-yellow-500/50' :
                                            verificationStatus === 'secure' ? 'border-green-500/50' :
                                                verificationStatus === 'unsafe' ? 'border-red-500/50' :
                                                    'border-white/10'
                                            } resize-none`}
                                    />
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
                    <div className="mb-12 p-6 rounded-[18px] bg-white/5 border border-white/10">
                        <h2 className="text-[17px] font-bold text-white mb-2" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            AI-Assisted Creator
                        </h2>
                        <p className="text-[15px] leading-[20px] text-white/80">
                            Each field for your Product Sales Page contains an AI prompt to help you write the required copy for the page. Simply click on each field label to copy the preset prompt to your clipboard, and paste it into your preferred AI tool (ChatGPT, Claude, Gemini etc.) Feel free to edit as you wish, and use the content of the prompt to help you understand the copy that's required for each section of your Product Sales Page.
                        </p>
                    </div>

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
                                        <button
                                            onClick={() => copyPrompt('headline')}
                                            className="text-[13px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                                        >
                                            {copiedField === 'headline' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </button>
                                    </div>
                                    <div className="relative rounded-[12px] overflow-hidden">
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                        <input
                                            type="text"
                                            value={product.headline || ''}
                                            onChange={(e) => updateProduct({ headline: e.target.value })}
                                            placeholder="e.g. Master Design Systems in 30 Days"
                                            className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)]"
                                        />
                                    </div>
                                </div>

                                {/* Tagline */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-white/50 text-xs font-bold uppercase tracking-wider">
                                            Tagline
                                        </label>
                                        <button
                                            onClick={() => copyPrompt('tagline')}
                                            className="text-[13px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                                        >
                                            {copiedField === 'tagline' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </button>
                                    </div>
                                    <div className="relative rounded-[12px] overflow-hidden">
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                        <input
                                            type="text"
                                            value={product.tagline || ''}
                                            onChange={(e) => updateProduct({ tagline: e.target.value })}
                                            placeholder="e.g. The comprehensive guide for modern frontend developers"
                                            className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)]"
                                        />
                                    </div>
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
                                        <button
                                            onClick={() => copyPrompt('intro')}
                                            className="text-[13px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                                        >
                                            {copiedField === 'intro' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </button>
                                    </div>
                                    <div className="relative rounded-[12px] overflow-hidden">
                                        <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                        <textarea
                                            value={product.intro_text || ''}
                                            onChange={(e) => updateProduct({ intro_text: e.target.value })}
                                            placeholder="Describe the problem your user faces and how this product solves it..."
                                            rows={6}
                                            className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)] resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* 3. Benefits */}
                        < section className="space-y-6" >
                            <div className="flex items-center justify-between">
                                <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                    03 — Benefits
                                </h3>
                                <button
                                    onClick={() => copyPrompt('benefits')}
                                    className="text-[13px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                                >
                                    {copiedField === 'benefits' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                </button>
                            </div>

                            <div className="space-y-3">
                                {(product.benefits || []).map((benefit, index) => (
                                    <div key={index} className="flex items-center gap-3 group relative">
                                        <List size={20} className="text-white/20 flex-shrink-0" />
                                        <div className="flex-1 relative rounded-[12px] overflow-hidden">
                                            <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                            <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                            <input
                                                type="text"
                                                value={benefit}
                                                onChange={(e) => {
                                                    const newBenefits = [...(product.benefits || [])]
                                                    newBenefits[index] = e.target.value
                                                    updateProduct({ benefits: newBenefits })
                                                }}
                                                placeholder="Start with a verb (e.g. 'Automate your workflow...')"
                                                className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-3 pr-12 placeholder:text-[rgba(84,84,84,0.5)]"
                                            />
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newBenefits = (product.benefits || []).filter((_, i) => i !== index)
                                                updateProduct({ benefits: newBenefits })
                                            }}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100 z-20"
                                        >
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}

                                {(!product.benefits || product.benefits.length < 9) && (
                                    <button
                                        onClick={() => updateProduct({ benefits: [...(product.benefits || []), ''] })}
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                    >
                                        <Plus size={16} />
                                    </button>
                                )}
                            </div>
                        </section>

                        {/* 4. Core Value Proposition */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                    04 — Core Value Proposition
                                </h3>
                                <button
                                    onClick={() => copyPrompt('value_proposition')}
                                    className="text-[13px] text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                                >
                                    {copiedField === 'value_proposition' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                </button>
                            </div>

                            <div>
                                <div className="relative rounded-[12px] overflow-hidden">
                                    <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                    <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                    <textarea
                                        value={product.value_proposition || ''}
                                        onChange={(e) => updateProduct({ value_proposition: e.target.value })}
                                        placeholder="The one main reason they should buy..."
                                        rows={4}
                                        className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)] resize-none"
                                    />
                                </div>
                            </div>
                        </section>

                        {/* 5. Video */}
                        <section className="space-y-6">
                            <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                05 — Video Embed
                            </h3>

                            <div>
                                <label className="block text-white/50 text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Video size={14} />
                                    YouTube URL
                                </label>
                                <div className="relative rounded-[12px] overflow-hidden">
                                    <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                    <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                    <input
                                        type="text"
                                        value={product.video_url || ''}
                                        onChange={(e) => updateProduct({ video_url: e.target.value })}
                                        placeholder="https://youtube.com/watch?v=..."
                                        className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] p-4 placeholder:text-[rgba(84,84,84,0.5)]"
                                    />
                                </div>
                            </div>
                        </section >

                        {/* 5. Testimonials */}
                        < section className="space-y-6" >
                            <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                06 — Testimonials
                            </h3>

                            <div className="space-y-4">
                                {(product.testimonials || []).map((t, index) => (
                                    <div key={index} className="relative group p-4 rounded-[14px] bg-white/5 border border-white/5">
                                        <button
                                            onClick={() => {
                                                const newTestimonials = (product.testimonials || []).filter((_, i) => i !== index)
                                                updateProduct({ testimonials: newTestimonials })
                                            }}
                                            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center hover:bg-white/20 transition-all shadow-md opacity-0 group-hover:opacity-100"
                                        >
                                            <X size={14} className="text-white font-bold" strokeWidth={3} />
                                        </button>

                                        <div className="space-y-4">
                                            <div className="relative rounded-[12px] overflow-hidden">
                                                <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                                <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                                <textarea
                                                    value={t.text}
                                                    onChange={(e) => {
                                                        const newTestimonials = [...(product.testimonials || [])]
                                                        newTestimonials[index] = { ...newTestimonials[index], text: e.target.value }
                                                        updateProduct({ testimonials: newTestimonials })
                                                    }}
                                                    placeholder="&quot;This changed my life...&quot;"
                                                    rows={3}
                                                    className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[15px] font-medium leading-[20px] p-3 placeholder:text-[rgba(84,84,84,0.5)] resize-none"
                                                />
                                            </div>

                                            <div className="relative rounded-[12px] overflow-hidden">
                                                <div className="absolute inset-0 bg-[rgba(255,255,255,0.85)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                                <div className="absolute inset-0 bg-[rgba(0,0,0,0.05)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                                <input
                                                    type="text"
                                                    value={t.name}
                                                    onChange={(e) => {
                                                        const newTestimonials = [...(product.testimonials || [])]
                                                        newTestimonials[index] = { ...newTestimonials[index], name: e.target.value }
                                                        updateProduct({ testimonials: newTestimonials })
                                                    }}
                                                    placeholder="Reviewer Full Name"
                                                    className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[15px] font-medium leading-[20px] p-3 placeholder:text-[rgba(84,84,84,0.5)]"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}

                                {(!product.testimonials || product.testimonials.length < 5) && (
                                    <button
                                        onClick={() => updateProduct({ testimonials: [...(product.testimonials || []), { name: '', text: '' }] })}
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                                    >
                                        <Plus size={16} />
                                    </button>
                                )}
                            </div>
                        </section >

                        {/* Bottom Actions */}
                        <div className="flex flex-col md:flex-row gap-4 pt-8 border-t border-white/10">
                            <button
                                onClick={() => router.push('/dashboard')}
                                className="flex-1 md:h-[44px] min-h-[54px] md:min-h-0 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold transition-colors"
                            >
                                Back to Dashboard
                            </button>
                            <button
                                onClick={() => router.push(`/products/${productId}?source=creator`)}
                                className="flex-1 md:h-[44px] min-h-[54px] md:min-h-0 rounded-full bg-white text-black font-bold hover:bg-white/90 transition-colors"
                            >
                                Preview Sales Page
                            </button>
                        </div >

                    </div >
                </GlassCard >
            </div >
        </main >
    )
}
