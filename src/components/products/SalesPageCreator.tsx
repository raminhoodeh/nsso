'use client'

import { type ReactNode, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { EditableValues } from '@/lib/profile-mutations'
import { ChevronLeft, Check, Plus, Video, List, Copy, Upload, Loader2 } from 'lucide-react'
import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import { useToast } from '@/components/ui/Toast'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import { uploadProfileMedia, runProfileMediaAttempt } from '@/lib/profile-media-client'
import { boundedClientRead } from '@/lib/client-read'
import PayPalCodeEditor from '@/components/payments/PayPalCodeEditor'
import { useProfile } from '@/components/providers/ProfileProvider'
import { offeringEditorHref } from '@/lib/offering-navigation'
import {
    TahoeGlassField,
    TahoeGlassSurface,
} from '@/components/ui/tahoe-glass'
import { LightButton, LightIconButton, LightCloseButton, lightButtonClass } from '@/components/ui/LightButton'
import { cn } from '@/lib/utils'
import { purchaseButtonLabel } from '@/lib/payments/product-presentation'
import { safeWebUrl } from '@/lib/urls'

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

interface SalesPageCreatorProps {
    productId: string
    embedded?: boolean
    onBack?: () => void
    externalPaymentDraft?: boolean
}

export default function SalesPageCreator({ productId, embedded = false, onBack, externalPaymentDraft = false }: SalesPageCreatorProps) {
    const router = useRouter()
    const [supabase] = useState(() => createClient())

    const {products,loading,patchEntity,refreshProfile,getRevision,mutationState,productMutationState} = useProfile()
    const product = products.find(row => row.id === productId) || null
    const purchaseUrl = safeWebUrl(product?.purchase_link)
    const secondaryPurchaseUrl = safeWebUrl(product?.secondary_purchase_link)
    const productState = productMutationState || mutationState
    const saving = mutationState.status === 'saving' || productState.status === 'saving'
    const saved = mutationState.status === 'saved' && productState.status === 'saved'
    const [copiedField, setCopiedField] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)
    const [paymentDirty, setPaymentDirty] = useState(false)
    const [paymentBusy, setPaymentBusy] = useState(false)
    const [leaveRequested, setLeaveRequested] = useState(false)

    // Cropper State
    const [cropperOpen, setCropperOpen] = useState(false)
    const [cropperImage, setCropperImage] = useState<string | null>(null)

    const backHref = offeringEditorHref(productId)
    const previewDisabled = !saved || isUploading || paymentBusy || paymentDirty || externalPaymentDraft
    const previewClassName = 'min-h-11 px-5 py-2.5'
    const previewContentClassName = 'text-sm font-semibold'
    const PageRegion = embedded ? 'section' : 'main'
    const PageCard = embedded ? 'div' : GlassCard
    const leavingBusy = isUploading || (!embedded && paymentBusy)
    const leaveMessage = !leaveRequested ? '' : leavingBusy
        ? 'Wait for the payment save or image upload to finish before leaving.'
        : !embedded && paymentDirty
            ? 'Save your payment button changes or discard the local draft before leaving. Your draft is still here.'
            : ''
    const leaveCreator = () => {
        if (onBack) onBack()
        else router.push(backHref, { scroll: false })
    }
    const navigateBack = () => {
        if (leavingBusy || (!embedded && paymentDirty)) {
            setLeaveRequested(true)
            return
        }
        leaveCreator()
    }
    const discardLocalPaymentDraft = () => {
        if (!embedded && !leavingBusy) leaveCreator()
    }

    const updateProduct = async (updates: EditableValues['product']) => {
        if (!product) return false
        return patchEntity('product',productId,updates)
    }

    const { showToast } = useToast()

    const copyPrompt = async (type: keyof typeof PROMPTS) => {
        try {
            await navigator.clipboard.writeText(PROMPTS[type])
            setCopiedField(type)
            showToast('Prompt ready for Deity', 'success')
            setTimeout(() => setCopiedField(null), 2000)
        } catch {
            showToast('The prompt could not be copied. Please try again.', 'error')
        }
    }



    const handleImageSelect = (file: File) => {
        const reader = new FileReader()
        reader.addEventListener('load', () => {
            setCropperImage(reader.result as string)
            setCropperOpen(true)
        })
        reader.readAsDataURL(file)
    }

    const handleCropComplete = async (croppedBlob: Blob, signal: AbortSignal) => {
        setIsUploading(true)
        try {
            await runProfileMediaAttempt(async attemptSignal => {
                const { data: { user: actor }, error: authError } = await boundedClientRead(() => supabase.auth.getUser(), { signal: attemptSignal })
                if (attemptSignal.aborted) return
                if (authError || !actor || !product || product.user_id !== actor.id) throw new Error('Please sign in as the product owner to upload an image.')
                const {url}=await uploadProfileMedia(croppedBlob,'product',actor.id,attemptSignal)
                if (attemptSignal.aborted) return
                if (!await updateProduct({image_url:url})) throw new Error('The image change was not saved. Your crop is kept for retry.')
                if (attemptSignal.aborted) return
                setCropperOpen(false)
                setCropperImage(null)
            }, { signal })
        } catch {
            if (!signal.aborted) showToast('The image save could not be confirmed. Your crop has been kept; check your profile before retrying.', 'error')
        } finally {
            setIsUploading(false)
        }
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
                    <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} tone="light" contentClassName="px-8 py-6 text-center text-xl">
                        Product not found.
                    </TahoeGlassSurface>
                </main>
            </CreatorRouteContent>
        )
    }

    return (
        <CreatorRouteContent>
        <PageRegion className={embedded ? 'min-w-0' : 'relative z-[1] min-h-screen pb-32 md:pb-12'} data-sales-page-creator="true">
            {/* Header Removed to avoid duplicate logo */}

            <div className={embedded ? 'min-w-0' : 'pt-[120px] lg:pt-10 px-6 lg:px-8 max-w-[1470px] mx-auto'}>

                <PageCard {...(embedded ? {} : { refractive: true })} className={embedded ? 'p-4 md:p-6' : 'p-8 lg:p-12'}>
                {/* Header */}
                    <TahoeGlassSurface as="header" variant="menu" radius={20} tone="light" className="mb-8" contentClassName="flex flex-col justify-between gap-4 p-4 md:flex-row md:items-center">
                        <div className="flex items-center gap-4">
                            <LightIconButton
                                onClick={() => navigateBack()}
                                aria-label="Back to offering"
                                disabled={leavingBusy}
                                className="-ml-2"
                            >
                                <ChevronLeft size={24} />
                            </LightIconButton>
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
                                        <div className={`w-2 h-2 rounded-full ${saved ? 'bg-[#32D74B]' : 'bg-yellow-500'}`} />
                                        {saved ? 'Saved' : 'Not saved'}
                                    </>
                                )}
                            </TahoeGlassSurface>
                            <LightButton
                                onClick={() => router.push(`/products/${productId}?source=creator&preview=true`)}
                                disabled={previewDisabled}
                                className={previewClassName}
                                contentClassName={previewContentClassName}
                            >
                                Preview page
                            </LightButton>
                        </div>
                    </TahoeGlassSurface>
                    {leaveMessage && <div className="mb-5 space-y-3"><p role="alert" className="text-sm text-amber-200">{leaveMessage}</p>{!embedded && paymentDirty && <LightButton intent="danger" type="button" onClick={discardLocalPaymentDraft} disabled={leavingBusy} className="min-h-11 px-4 py-2" contentClassName="text-sm">Discard local payment draft and go back</LightButton>}</div>}
                    {(paymentDirty || externalPaymentDraft) && <p role="status" className="mb-5 text-sm text-white/85">Save your PayPal button changes before opening a preview.{embedded && ' Back keeps your draft in the offering editor.'}</p>}

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
                                        <label className={cn(lightButtonClass, 'cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-40')}>
                                            {isUploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                            <span className="text-sm">{product.image_url ? 'Change Image' : 'Upload Image'}</span>
                                            <input
                                                type="file"
                                                aria-label={`Upload image for ${product.name || 'product'}`}
                                                accept="image/*"
                                                className="sr-only"
                                                disabled={isUploading}
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
                                    {purchaseUrl && <p className="mt-2 text-xs text-white/75">Button preview: {purchaseButtonLabel(purchaseUrl)}</p>}
                                </div>

                                <div>
                                    <TahoeGlassField
                                        label="Second Purchase Link (optional)"
                                        labelClassName="text-xs uppercase tracking-widest text-white/50"
                                        tone="dark"
                                        semanticTint="light"
                                        semanticTintOpacity={0.16}
                                        surfaceClassName="px-4 py-4"
                                        controlClassName="text-[17px] font-medium leading-[22px] text-[#545454] placeholder:text-[#545454]/50"
                                    >
                                        <input
                                            type="url"
                                            value={product.secondary_purchase_link || ''}
                                            onChange={(e) => updateProduct({ secondary_purchase_link: e.target.value })}
                                            placeholder="https://..."
                                        />
                                    </TahoeGlassField>
                                    {secondaryPurchaseUrl && <p className="mt-2 text-xs text-white/75">Button preview: {purchaseButtonLabel(secondaryPurchaseUrl)}</p>}
                                </div>

                                <div>
                                    <p className="mb-2 text-xs uppercase tracking-widest text-white/50">PayPal Button Code</p>
                                    {embedded ? <Link href={backHref} onClick={event => { event.preventDefault(); navigateBack() }} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-white underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-white"><ChevronLeft size={16} aria-hidden="true" />Edit PayPal button code in your offering</Link> : <PayPalCodeEditor
                                        key={product.id}
                                        productId={product.id}
                                        accountId={product.user_id}
                                        getRevision={getRevision}
                                        refreshRevision={refreshProfile}
                                        initialHtml={product.paypal_html}
                                        onSaved={refreshProfile}
                                        onDirtyChange={setPaymentDirty}
                                        onSavingChange={setPaymentBusy}
                                    />}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Info Box */}
                    <TahoeGlassSurface variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={18} tone="light" className="mb-12" contentClassName="p-6">
                        <h2 className="text-[17px] font-bold text-white mb-2" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                            AI-Assisted Creator
                        </h2>
                        <p className="text-[15px] leading-[20px] text-white/80">
                            Each field for your Product Sales Page contains an AI prompt to help you write the required copy for the page. Simply click on each field label to copy the preset prompt to your clipboard, and paste it into Deity or your preferred AI tool (ChatGPT, Claude, Gemini etc.) Feel free to edit as you wish, and use the content of the prompt to help you understand the copy that's required for each section of your Product Sales Page.
                        </p>
                    </TahoeGlassSurface>

                    {/* Form Content */}
                    <div className="max-w-3xl space-y-12">

                        {/* 1. Header Section */}
                        <section className="space-y-6">
                            <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                01. The Hook
                            </h3>

                            <div className="space-y-6">
                                {/* Headline */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-white/50 text-xs font-bold uppercase tracking-wider">
                                            Headline Hook
                                        </label>
                                        <LightButton
                                            onClick={() => copyPrompt('headline')}
                                            className="px-3 py-1.5"
                                            contentClassName="gap-1 text-[13px] font-medium"
                                        >
                                            {copiedField === 'headline' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </LightButton>
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
                                        <LightButton
                                            onClick={() => copyPrompt('tagline')}
                                            className="px-3 py-1.5"
                                            contentClassName="gap-1 text-[13px] font-medium"
                                        >
                                            {copiedField === 'tagline' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </LightButton>
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
                                02. The Pitch
                            </h3>

                            <div className="space-y-6">
                                {/* Intro */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-white/50 text-xs font-bold uppercase tracking-wider">
                                            Introduction / Problem
                                        </label>
                                        <LightButton
                                            onClick={() => copyPrompt('intro')}
                                            className="px-3 py-1.5"
                                            contentClassName="gap-1 text-[13px] font-medium"
                                        >
                                            {copiedField === 'intro' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                        </LightButton>
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
                                    03. Benefits
                                </h3>
                                <LightButton
                                    onClick={() => copyPrompt('benefits')}
                                    className="px-3 py-1.5"
                                    contentClassName="gap-1 text-[13px] font-medium"
                                >
                                    {copiedField === 'benefits' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                </LightButton>
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
                                        <LightCloseButton
                                            onClick={() => {
                                                const newBenefits = (product.benefits || []).filter((_, i) => i !== index)
                                                updateProduct({ benefits: newBenefits })
                                            }}
                                            aria-label={`Remove benefit ${index + 1}`}
                                            intent="danger"
                                            className="absolute right-1 top-1/2 z-20 -translate-y-1/2"
                                        />
                                    </div>
                                ))}

                                {(!product.benefits || product.benefits.length < 9) && (
                                    <LightIconButton
                                        onClick={() => updateProduct({ benefits: [...(product.benefits || []), ''] })}
                                        aria-label="Add benefit"
                                    >
                                        <Plus size={16} />
                                    </LightIconButton>
                                )}
                            </div>
                        </section>

                        {/* 4. Core Value Proposition */}
                        <section className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[17px] font-bold text-white uppercase tracking-wider" style={{ fontFamily: "'SF Pro Display', -apple-system, sans-serif" }}>
                                    04. Core Value Proposition
                                </h3>
                                <LightButton
                                    onClick={() => copyPrompt('value_proposition')}
                                    className="px-3 py-1.5"
                                    contentClassName="gap-1 text-[13px] font-medium"
                                >
                                    {copiedField === 'value_proposition' ? <Check size={12} /> : <Copy size={12} />} Copy AI Prompt
                                </LightButton>
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
                                05. Video Embed
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
                                06. Testimonials
                            </h3>

                            <div className="space-y-4">
                                {(product.testimonials || []).map((t, index) => (
                                    <TahoeGlassSurface key={index} variant="card" semanticTint="dark" semanticTintOpacity={0.38} radius={14} tone="light" className="group" contentClassName="relative p-4">
                                        <LightCloseButton
                                            onClick={() => {
                                                const newTestimonials = (product.testimonials || []).filter((_, i) => i !== index)
                                                updateProduct({ testimonials: newTestimonials })
                                            }}
                                            aria-label={`Remove testimonial ${index + 1}`}
                                            intent="danger"
                                            className="mb-3 ml-auto flex"
                                        />

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
                                    <LightIconButton
                                        onClick={() => updateProduct({ testimonials: [...(product.testimonials || []), { name: '', text: '' }] })}
                                        aria-label="Add testimonial"
                                    >
                                        <Plus size={16} />
                                    </LightIconButton>
                                )}
                            </div>
                        </section >

                        {/* Bottom Actions */}
                        <div className="flex flex-col md:flex-row gap-4 pt-8 border-t border-white/10">
                            <Link href={backHref} onClick={event => { event.preventDefault(); navigateBack() }} aria-disabled={leavingBusy || undefined} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg px-1 py-2 text-sm font-medium text-white/90 underline underline-offset-4 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white aria-disabled:cursor-wait aria-disabled:opacity-50"><ChevronLeft size={16} aria-hidden="true" />Back</Link>
                            <LightButton
                                onClick={() => router.push(`/products/${productId}?source=creator&preview=true`)}
                                disabled={previewDisabled}
                                className={previewClassName}
                                contentClassName={previewContentClassName}
                            >
                                Preview page
                            </LightButton>
                        </div >

                    </div >
                </PageCard >
            </div >
        </PageRegion >
        </CreatorRouteContent>
    )
}
