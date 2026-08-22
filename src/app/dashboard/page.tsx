'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Header from '@/components/layout/Header'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import {
    TahoeGlassButton,
    TahoeGlassDialog,
    TahoeGlassField,
    TahoeGlassSurface
} from '@/components/ui/tahoe-glass'
import CreateProfileButton from '@/components/ui/CreateProfileButton'
import { SortableContactItem } from './components/SortableContactItem'
import Input from '@/components/ui/Input'
import { Plus, X, Upload, Loader2, CreditCard, Copy, Check } from 'lucide-react'
import AdvancedModeCard from '@/app/dashboard/components/AdvancedModeCard'
import EarningsTab from '@/app/dashboard/components/EarningsTab'

import MyNssoTab from '@/app/dashboard/components/MyNssoTab'
import { useToast } from '@/components/ui/Toast'
import { useUser } from '@/components/providers/UserProvider'
import { useProfile } from '@/components/providers/ProfileProvider'
import type { User, Profile, Link, Contact, ContactMethod } from '@/lib/types'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import { Sparkles } from 'lucide-react'
import type { EarningsStats } from '@/lib/earnings'

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { SortableLinkItem } from './components/SortableLinkItem'

const CONTACT_METHODS: ContactMethod[] = ['Email', 'WhatsApp', 'Phone', 'Telegram', 'Location', 'Other']

function DashboardContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const { showToast } = useToast()
    const { user, refreshUser } = useUser()
    const {
        profile,
        links,
        contacts,
        updateField: updateProfile,
        updateLink,
        addLink,
        removeLink,
        reorderLinks,
        updateContact,
        addContact,
        removeContact,
        reorderContacts,
        loading: profileLoading
    } = useProfile()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Local UI state (will be migrated to ProfileProvider in Phase 2)
    const [fullName, setFullName] = useState('')
    const [headline, setHeadline] = useState('')
    const [bio, setBio] = useState('') // Local state for bio to prevent spam
    const [profilePicUrl, setProfilePicUrl] = useState('')
    const [customDomain, setCustomDomain] = useState('')


    // Calculate profile completeness
    const profileCompleteness = (() => {
        if (!profile) return 0
        const fields = [
            profile.full_name,
            profile.headline,
            profile.bio,
            profile.profile_pic_url,
            links.length > 0,
            contacts.length > 0
        ]
        const filled = fields.filter(Boolean).length
        return Math.round((filled / fields.length) * 100)
    })()

    // UI state
    // Initial loading state combines auth check and profile fetch
    const [loading, setLoading] = useState(true)

    const [saving, setSaving] = useState(false)
    // URL-based state for navigation
    const currentView = searchParams.get('view') || 'profile'
    const [showPolarModal, setShowPolarModal] = useState(false)
    const [showDowngradeModal, setShowDowngradeModal] = useState(false)
    const [urlCopied, setUrlCopied] = useState(false)

    // PREFETCH STATES & REFS

    const [prefetchedEarnings, setPrefetchedEarnings] = useState<EarningsStats | null>(null)
    const [prefetchedMyNsso, setPrefetchedMyNsso] = useState<any>(null)

    // Eager Background Prefetching
    useEffect(() => {


        // 2. Prefetch Earnings
        const loadEarnings = async () => {
            try {
                const res = await fetch('/api/earnings/stats')
                if (res.ok) {
                    const data = await res.json()
                    setPrefetchedEarnings(data)
                }
            } catch (err) {
                console.error('Background earnings fetch failed', err)
            }
        }

        // 3. Prefetch My nsso
        const loadMyNsso = async () => {
            try {
                const res = await fetch('/api/my-nsso/connections?sort=date&order=desc')
                if (res.ok) {
                    const data = await res.json()
                    setPrefetchedMyNsso(data)
                }
            } catch (err) {
                console.error('Background my-nsso fetch failed', err)
            }
        }

        // 4. Warm up Deity Agent (Preload Code)
        // This triggers the network request for the heavy chunk automatically
        const warmUpDeity = () => {
            import('@/components/agent/AgentChatInterface')
                .then(() => console.log('Deity Agent Ready (Warmed Up)'))
                .catch(err => console.error('Deity Warmup Failed', err))
        }

        // Execute after a small delay to prioritize main content paint
        const timer = setTimeout(() => {
            loadEarnings()
            warmUpDeity()
        }, 1000)

        // Start MyNsso fetch immediately (user priority)
        loadMyNsso()

        return () => clearTimeout(timer)
    }, [])

    // Cropper State
    const [cropperOpen, setCropperOpen] = useState(false)
    const [cropperImage, setCropperImage] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)

    // Premium/Username validation state
    const [desiredUsername, setDesiredUsername] = useState('')

    const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
    const [usernameError, setUsernameError] = useState('')
    const [checkingUsername, setCheckingUsername] = useState(false)
    const [processingCheckout, setProcessingCheckout] = useState(false)
    const [processingDowngrade, setProcessingDowngrade] = useState(false)

    // Load user data
    useEffect(() => {
        const loadData = async () => {
            const { data: { user: authUser } } = await supabase.auth.getUser()

            if (!authUser) {
                router.push('/sign-in')
                return
            }

            // Parallel Fetching
            const [
                { data: userData },
                { data: profileData },
            ] = await Promise.all([
                supabase.from('users').select('*').eq('id', authUser.id).single(),
                supabase.from('profiles').select('*').eq('user_id', authUser.id).single(),
            ])

            if (userData) {
                setCustomDomain(userData.username || '')
            }

            if (profileData) {
                setFullName(profileData.full_name || '')
                setHeadline(profileData.headline || '')
                setBio(profileData.bio || '')
                setProfilePicUrl(profileData.profile_pic_url || '')

            }

            setLoading(false)
        }

        loadData()
    }, [supabase, router])

    // Update loading state when profile loading finishes
    useEffect(() => {
        if (!profileLoading && !loading) {
            // Profile loaded
        }
    }, [profileLoading, loading])

    // Check for upgrade success
    // Check for upgrade success
    useEffect(() => {
        if (searchParams.get('upgraded') === 'true') {
            showToast('You are now Premium! Username claimed.', 'success')
            // Clean URL
            router.replace('/dashboard')
        }
    }, [searchParams, router, showToast])

    // Sync local customDomain state with user context when loaded
    useEffect(() => {
        if (user?.username) {
            setCustomDomain(user.username)
        }
    }, [user])

    // Sync local state with profile provider updates (e.g. from Deity)
    useEffect(() => {
        if (profile) {
            if (profile.bio !== bio && !saving) setBio(profile.bio || '')
            if (profile.headline !== headline && !saving) setHeadline(profile.headline || '')
            if (profile.full_name !== fullName && !saving) setFullName(profile.full_name || '')
        }
    }, [profile?.bio, profile?.headline, profile?.full_name])

    // Proactive Nudge: Suggest asking Deity if profile is incomplete
    useEffect(() => {
        if (!loading && profileCompleteness > 0 && profileCompleteness < 60) {
            const hasSeenNudge = sessionStorage.getItem('deity_proactive_nudge')
            if (!hasSeenNudge) {
                const timer = setTimeout(() => {
                    showToast('💡 Tip: Ask Deity to help complete your profile!', 'info')
                    sessionStorage.setItem('deity_proactive_nudge', 'true')
                }, 3000)
                return () => clearTimeout(timer)
            }
        }
    }, [loading, profileCompleteness, showToast])

    // Username availability check (debounced)
    // Username availability check (debounced)
    useEffect(() => {
        const usernameToCheck = user?.is_premium ? customDomain : desiredUsername

        // If nothing entered, or if premium user hasn't changed their name, reset state
        if (!usernameToCheck || (user?.is_premium && usernameToCheck === user.username)) {
            setUsernameAvailable(null)
            setUsernameError('')
            return
        }

        const timer = setTimeout(async () => {
            setCheckingUsername(true)
            try {
                const response = await fetch(`/api/check-username?username=${usernameToCheck}`)
                const data = await response.json()
                setUsernameAvailable(data.available)
                setUsernameError(data.reason || '')
            } catch {
                setUsernameError('Failed to check username')
                setUsernameAvailable(false)
            }
            setCheckingUsername(false)
        }, 500)

        return () => clearTimeout(timer)
    }, [desiredUsername, customDomain, user?.is_premium, user?.username])

    // Handle Free Domain Claim
    const handleClaimFreeDomain = async () => {
        if (!desiredUsername || !usernameAvailable) return
        setProcessingCheckout(true)

        try {
            const response = await fetch('/api/claim-free-domain', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ desiredUsername }),
            })

            let data
            const responseText = await response.text()
            try {
                data = JSON.parse(responseText)
            } catch (e) {
                console.error('API Response was not JSON:', responseText)
                data = { error: 'Server returned invalid response' }
            }

            if (response.ok && data.success) {
                showToast(`Domain claimed! Welcome to Premium.`, 'success')
                // Refresh user state to reflect premium status immediately
                await refreshUser()
                // Force a reload to ensure all premium UI elements are visible if needed, 
                // or just rely on state. Let's rely on state.
                // Actually, refreshUser might happen too fast before DB propagation in some cases? 
                // Let's reload to be safe and ensure fresh data
                window.location.reload()
            } else {
                console.error('Claim Error Data:', data)
                console.error('Claim Response Status:', response.status, response.statusText)
                showToast(data.error || 'Failed to claim domain', 'error')
            }
        } catch (err) {
            console.error('Claim Exception:', err)
            showToast('Failed to claim domain. Please try again.', 'error')
        }
        setProcessingCheckout(false)
    }

    // Handle username update for premium users
    const handleUpdateUsername = async () => {
        if (!customDomain || customDomain === user?.username || !usernameAvailable) return
        setProcessingCheckout(true)
        try {
            const response = await fetch('/api/update-username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: customDomain }),
            })
            const data = await response.json()
            if (data.success) {
                showToast('Username updated successfully!', 'success')

                // Refresh global user context to update Header immediately
                await refreshUser()
            } else {
                showToast(data.error || 'Failed to update username', 'error')
            }
        } catch {
            showToast('Failed to update username', 'error')
        }
        setProcessingCheckout(false)
    }

    // Handle downgrade
    const handleDowngrade = async () => {
        setProcessingDowngrade(true)
        try {
            const response = await fetch('/api/cancel-subscription', {
                method: 'POST',
            })
            const data = await response.json()

            if (data.success) {
                showToast('Your subscription will cancel at the end of the billing period', 'success')
                setShowDowngradeModal(false)
            } else {
                showToast(data.error || 'Failed to cancel subscription', 'error')
            }
        } catch {
            showToast('Failed to cancel subscription', 'error')
        }
        setProcessingDowngrade(false)
    }


    // Save profile changes
    const handleCopyUrl = () => {
        const domain = user?.is_premium ? customDomain : desiredUsername
        if (!domain) return
        navigator.clipboard.writeText(`nsso.me/${domain}`)
        setUrlCopied(true)
        showToast('Profile URL copied!', 'success')
        setTimeout(() => setUrlCopied(false), 2000)
    }

    const saveProfile = async () => {
        if (!user) return
        setSaving(true)

        const { error } = await supabase
            .from('profiles')
            .upsert({
                user_id: user.id,
                full_name: fullName,
                headline,
                bio,
                profile_pic_url: profilePicUrl,
            })

        if (error) {
            showToast('Failed to save profile', 'error')
        } else {
            showToast('Profile saved!', 'success')
        }
        setSaving(false)
    }

    // Handle profile picture upload
    // Handle profile picture file selection
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.addEventListener('load', () => {
            setCropperImage(reader.result as string)
            setCropperOpen(true)
        })
        reader.readAsDataURL(file)
        e.target.value = '' // Reset input
    }

    // Handle Cropped Upload
    const handleCropComplete = async (croppedBlob: Blob) => {
        if (!user) return
        setIsUploading(true)

        const fileExt = 'jpg' // Canvas toBlob usually is png or jpg, we default to jpg/png
        const fileName = `${user.id}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, croppedBlob, { upsert: true, contentType: 'image/jpeg' })

        if (uploadError) {
            showToast('Failed to upload image', 'error')
            setIsUploading(false)
            return
        }

        const { data: { publicUrl } } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName)

        setProfilePicUrl(publicUrl)

        // Save immediately
        await supabase
            .from('profiles')
            .upsert({ user_id: user.id, profile_pic_url: publicUrl })

        showToast('Profile picture updated!', 'success')
        setIsUploading(false)
        setCropperOpen(false)
        setCropperImage(null)
    }

    // Copy profile URL
    const copyProfileUrl = () => {
        const url = `${window.location.origin}/${user?.username}`
        navigator.clipboard.writeText(url)
        showToast('Profile URL copied!', 'success')
    }

    // DND Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    )

    const handleLinkDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (active.id !== over?.id) {
            const oldIndex = links.findIndex((link) => link.id === active.id)
            const newIndex = links.findIndex((link) => link.id === over?.id)

            const newLinks = arrayMove(links, oldIndex, newIndex)
            reorderLinks(newLinks.map(l => l.id))
        }
    }

    const handleContactDragEnd = (event: DragEndEvent) => {
        const { active, over } = event

        if (active.id !== over?.id) {
            const oldIndex = contacts.findIndex((c) => c.id === active.id)
            const newIndex = contacts.findIndex((c) => c.id === over?.id)

            const newContacts = arrayMove(contacts, oldIndex, newIndex)
            reorderContacts(newContacts.map(c => c.id))
        }
    }

    if (loading) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <div className="text-white text-xl text-center">
                    All of you...<br />all in one place
                </div>
            </main>
        )
    }

    return (
        <main className="min-h-screen pb-12">
            <div className="md:hidden">
                <Header />
            </div>

            <div className="pt-[120px] md:pt-10 px-6 lg:px-8 max-w-[1470px] mx-auto space-y-6">

                {/* Tab Bar Removed - Replaced by Global Sidebar/BottomNav */}

                {/* Profile Completeness Banner */}
                {profileCompleteness < 20 && (
                    <TahoeGlassSurface
                        as="button"
                        type="button"
                        variant="card"
                        radius={20}
                        tone="light"
                        className="w-full overflow-hidden text-left hover:scale-[1.01]"
                        contentClassName="p-6 flex items-center gap-4"
                        onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                            detail: { initialMessage: "What is missing from my profile?" }
                        }))}
                        aria-label="Ask Deity what is missing from my profile"
                    >
                            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ring-1 ring-white/25">
                                <Sparkles className="w-6 h-6 text-white" />
                            </span>
                            <span className="flex-1">
                                <span className="mb-1 block text-lg font-semibold text-white">Let Deity help you build your profile</span>
                                <span className="block text-sm text-white/60">Your profile is {profileCompleteness}% complete. Click here for personalized assistance.</span>
                            </span>
                    </TahoeGlassSurface>
                )}

                {/* Your Profile Tab Content */}
                {currentView === 'profile' && (
                    <GlassCard className="p-6 lg:p-8 relative pt-[48px] rounded-[40px] overflow-visible">
                        {/* Header */}
                        <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
                            <h2 className="text-2xl font-bold text-white">
                                {profilePicUrl ? 'Hey, beautiful' : 'Profile'}
                            </h2>

                            {/* Ask Deity Button */}
                            <TahoeGlassButton
                                onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                    detail: { initialMessage: "How can you help me improve my profile?" }
                                }))}
                                className="px-4 py-2"
                                contentClassName="text-white/90"
                            >
                                <Sparkles className="w-4 h-4" />
                                <span className="text-sm font-medium">Ask Deity to help</span>
                            </TahoeGlassButton>
                        </div>

                        {/* Profile Content */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Profile Picture */}
                            <div className="flex flex-col items-center">
                                <TahoeGlassSurface
                                    as="button"
                                    type="button"
                                    variant="mediaFrame"
                                    radius={24}
                                    className="h-40 w-40 overflow-hidden hover:ring-4 ring-white/30"
                                    contentClassName="block h-full w-full"
                                    onClick={() => fileInputRef.current?.click()}
                                    aria-label="Upload profile picture"
                                >
                                    {profilePicUrl ? (
                                        <img
                                            src={profilePicUrl}
                                            alt="Profile"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <span className="w-full h-full flex items-center justify-center text-white/50">
                                            <span className="text-4xl">+</span>
                                        </span>
                                    )}
                                </TahoeGlassSurface>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />
                                <p className="text-white/50 text-sm mt-2">Click to upload</p>
                            </div>

                            {/* Cropper Modal */}
                            {cropperImage && (
                                <ImageCropperModal
                                    isOpen={cropperOpen}
                                    onClose={() => setCropperOpen(false)}
                                    imageSrc={cropperImage}
                                    aspectRatio={1} // 1:1 for Profile Pic
                                    onCropComplete={handleCropComplete}
                                    loading={isUploading}
                                />
                            )}

                            {/* Profile Fields */}
                            <div className="lg:col-span-2 space-y-4">

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-1 ml-1">
                                        <label className="block text-white/50 text-xs font-bold uppercase tracking-wider">FULL NAME</label>
                                    </div>
                                    <Input
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        onBlur={saveProfile}
                                        placeholder="Your full name"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between mb-1 ml-1">
                                        <label className="block text-white/50 text-xs font-bold uppercase tracking-wider">HEADLINE</label>
                                        <div className="flex items-center gap-3">
                                            {/* Character Counter */}
                                            <span className="text-white/40 text-[10px] font-medium">
                                                {headline.length}/120
                                            </span>
                                            <TahoeGlassButton
                                                onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                                    detail: { initialMessage: "Help me write a catchy headline..." }
                                                }))}
                                                className="px-2 py-1"
                                                contentClassName="gap-1 text-white/75"
                                            >
                                                <Sparkles className="w-3 h-3" />
                                                <span className="text-[10px] font-medium">Ask Deity</span>
                                            </TahoeGlassButton>
                                        </div>
                                    </div>
                                    <Input
                                        value={headline}
                                        onChange={(e) => setHeadline(e.target.value)}
                                        onBlur={saveProfile}
                                        placeholder="What you do"
                                        maxLength={120}
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1 ml-1">
                                        <label className="block text-white/50 text-xs font-bold uppercase tracking-wider">BIO</label>
                                        <TahoeGlassButton
                                            onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                                detail: { initialMessage: "Help me write my bio..." }
                                            }))}
                                            className="px-2 py-1"
                                            contentClassName="gap-1 text-white/75"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                            <span className="text-[10px] font-medium">Ask Deity</span>
                                        </TahoeGlassButton>
                                    </div>
                                    <TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="p-4 text-[17px] font-medium leading-[22px] resize-none">
                                        <textarea
                                            value={bio}
                                            onChange={(e) => setBio(e.target.value)}
                                            onBlur={() => {
                                                updateProfile('bio', bio);
                                                saveProfile();
                                            }}

                                            placeholder="Need inspiration? Use this template: 'I am the [type of person] for [target customers] who want to [desired outcome]' and continue to elaborate on the experience of why you do this, how you do it, and what exactly is involved."
                                            rows={4}
                                            className="text-white placeholder:text-white/50"
                                        />
                                    </TahoeGlassField>
                                </div>



                            </div>
                        </div>

                        {/* Domain Section - Figma Exact Design */}
                        <div className="mt-8 pt-8 border-t border-white/10">
                            <div className="flex items-center gap-3 mb-4">
                                <h3 className="text-xl font-bold text-white">Domain name</h3>
                                {user?.is_premium && (
                                    <TahoeGlassSurface variant="pill" tone="light" className="px-3 py-1" contentClassName="flex items-center justify-center">
                                        <span className="font-medium text-[12px] text-white/96 leading-[16px]" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                                            Premium
                                        </span>
                                    </TahoeGlassSurface>
                                )}
                            </div>

                            <div className="space-y-4">
                                {/* Flex container for Input + Quote */}
                                <div className="flex flex-col lg:flex-row items-center gap-4 w-full">
                                    {/* Figma Domain Input with integrated CLAIM IT button */}
                                    <TahoeGlassSurface variant="recessed" radius={12} tone="light" className="w-full lg:flex-1 h-[54px]" contentClassName="flex h-full w-full items-center px-2">
                                        {/* Prefix text - nsso.me/ */}
                                        <span
                                            className="text-[22px] font-medium text-white/96 shrink-0 pl-2"
                                            style={{
                                                fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                fontWeight: 510
                                            }}
                                        >
                                            nsso.me/
                                        </span>

                                        {/* Input field */}
                                        <input
                                            type="text"
                                            value={user?.is_premium ? customDomain : desiredUsername}
                                            onChange={(e) => {
                                                if (user?.is_premium) {
                                                    setCustomDomain(e.target.value)
                                                } else {
                                                    setDesiredUsername(e.target.value)
                                                }
                                            }}
                                            placeholder="yourname"
                                            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[22px] font-medium text-white placeholder:text-white/50"
                                            style={{
                                                fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                fontWeight: 510
                                            }}
                                        />

                                        {/* Copy Button */}
                                        <TahoeGlassButton
                                            onClick={handleCopyUrl}
                                            className="p-2 mr-1"
                                            contentClassName="text-white/70"
                                            title="Copy URL"
                                            aria-label="Copy profile URL"
                                        >
                                            {urlCopied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                                        </TahoeGlassButton>

                                        {/* Actions Section inside Input - Desktop Only */}
                                        <div className="relative z-10 hidden md:flex items-center gap-2 mr-1.5 shrink-0">
                                            {/* Always show button, content changes based on state */}
                                                <TahoeGlassButton
                                                    onClick={user?.is_premium ? handleUpdateUsername : handleClaimFreeDomain}
                                                    disabled={
                                                        (!user?.is_premium && !usernameAvailable) ||
                                                        processingCheckout ||
                                                        (user?.is_premium && !customDomain) ||
                                                        (user?.is_premium && customDomain === user?.username) ||
                                                        (!user?.is_premium && !desiredUsername)
                                                    }
                                                    className="h-[42px] px-6"
                                                    contentClassName="text-white/95"
                                                >
                                                        {processingCheckout && <Loader2 className="w-4 h-4 animate-spin" />}
                                                        <span
                                                            className="text-[16px] font-semibold text-white/96 tracking-wide"
                                                            style={{
                                                                fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                                fontWeight: 590
                                                            }}
                                                        >
                                                            {processingCheckout
                                                                ? (user?.is_premium ? 'Updating...' : 'Claiming...')
                                                                : (user?.is_premium ? 'UPDATE' : 'CLAIM IT')
                                                            }
                                                        </span>
                                                </TahoeGlassButton>

                                        </div>

                                    </TahoeGlassSurface>

                                    {/* Quote Section - Now sitting to the right */}
                                    <div className="hidden lg:flex items-center h-[54px] shrink-0">
                                        <p className="text-white/80 text-sm italic font-bold leading-tight">
                                            "nsso is the most beautiful way to present yourself online" <span className="font-normal not-italic">- <a href="https://www.instagram.com/ramin.nsso" target="_blank" rel="noopener noreferrer" className="hover:underline">Ramin Hoodeh</a></span>
                                        </p>
                                    </div>
                                </div>

                                {/* Mobile Actions Row (Below Input) */}
                                <div className="flex md:hidden items-center gap-3 w-full">
                                    {/* Primary Action Button (Mobile) */}
                                    {(!user?.is_premium || (user?.is_premium && customDomain !== user.username)) && (
                                            <TahoeGlassButton
                                                onClick={user?.is_premium ? handleUpdateUsername : handleClaimFreeDomain}
                                                disabled={
                                                    (!user?.is_premium && !usernameAvailable) ||
                                                    processingCheckout ||
                                                    (user?.is_premium && !customDomain) ||
                                                    (!user?.is_premium && !desiredUsername)
                                                }
                                                className="h-[42px] flex-1 px-6"
                                                contentClassName="text-white/95"
                                            >
                                                    {processingCheckout && <Loader2 className="w-4 h-4 animate-spin" />}
                                                    <span
                                                        className="text-[16px] font-semibold text-white/96 tracking-wide"
                                                        style={{
                                                            fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                            fontWeight: 590
                                                        }}
                                                    >
                                                        {processingCheckout
                                                            ? (user?.is_premium ? 'Updating...' : 'Claiming...')
                                                            : (user?.is_premium ? 'UPDATE' : 'CLAIM IT')
                                                        }
                                                    </span>
                                            </TahoeGlassButton>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Username availability indicator */}
                        {((!user?.is_premium && desiredUsername) || (user?.is_premium && customDomain !== user?.username && customDomain)) && (
                            <div className="mt-2 pl-1">
                                {checkingUsername ? (
                                    <p className="text-white/50 text-sm">Checking availability...</p>
                                ) : usernameAvailable === true ? (
                                    <p className="text-green-400 text-sm">✓ This username is available!</p>
                                ) : usernameAvailable === false ? (
                                    <p className="text-red-400 text-sm">✗ {usernameError || 'Username not available'}</p>
                                ) : null}
                            </div>
                        )}

                        <p className="mt-4 text-white/60 text-sm">
                            {user?.is_premium
                                ? `Your custom URL is free for 1 year: nsso.me/${customDomain}`
                                : 'Your custom URL is free for 1 year:'}
                        </p>
                    </GlassCard>
                )}



                {/* Earnings Tab Content */}
                {currentView === 'earnings' && <EarningsTab initialData={prefetchedEarnings || undefined} />}
                {currentView === 'my-nsso' && <MyNssoTab />}


                {/* Only show Links, Contact, and Advanced Mode cards on "Your Profile" tab */}
                {
                    currentView === 'profile' && (
                        <>
                            {/* Card 2: Links Section */}
                            <GlassCard className="p-6 lg:p-8">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="pr-8">
                                        <h2 className="text-2xl font-bold text-white">Links</h2>
                                        <p className="text-white/70 text-sm">Where can people find you and your work online?</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {/* Ask Deity Button */}
                                        <TahoeGlassButton
                                            onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                                detail: { initialMessage: "Help me find links to add to my profile..." }
                                            }))}
                                            className="px-3 py-2"
                                            contentClassName="text-white/90"
                                        >
                                            <Sparkles className="w-4 h-4" />
                                            <span className="text-xs font-medium hidden sm:inline">Ask Deity</span>
                                        </TahoeGlassButton>
                                        <TahoeGlassButton
                                            onClick={() => addLink('', '')}
                                            className="w-10 h-10 p-0 shrink-0"
                                            contentClassName="text-white text-2xl"
                                            aria-label="Add link"
                                        >
                                            +
                                        </TahoeGlassButton>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleLinkDragEnd}
                                    >
                                        <SortableContext
                                            items={links.map(l => l.id)}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {links.map((link) => (
                                                <SortableLinkItem
                                                    key={link.id}
                                                    link={link}
                                                    updateLink={updateLink}
                                                    removeLink={removeLink}
                                                />
                                            ))}
                                        </SortableContext>
                                    </DndContext>

                                    {links.length === 0 && (
                                        <p className="text-white/50 text-center py-8">
                                            No links yet. Click + to add your first link.
                                        </p>
                                    )}
                                </div>
                            </GlassCard>

                            {/* Card 3: Contact Section */}
                            <GlassCard className="p-8">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Contact</h2>
                                        <p className="text-white/50 text-sm">Add your contact methods and social profiles.</p>
                                    </div>
                                    <TahoeGlassButton
                                        onClick={() => addContact()}
                                        className="w-10 h-10 p-0"
                                        contentClassName="text-white text-xl"
                                        aria-label="Add contact method"
                                    >
                                        +
                                    </TahoeGlassButton>
                                </div>
                                <div className="space-y-4">
                                    <DndContext
                                        sensors={sensors}
                                        collisionDetection={closestCenter}
                                        onDragEnd={handleContactDragEnd}
                                    >
                                        <SortableContext
                                            items={contacts.map(c => c.id)}
                                            strategy={verticalListSortingStrategy}
                                        >
                                            {contacts.map((contact) => (
                                                <SortableContactItem
                                                    key={contact.id}
                                                    contact={contact}
                                                    updateContact={updateContact}
                                                    removeContact={removeContact}
                                                />
                                            ))}
                                        </SortableContext>
                                    </DndContext>

                                    {contacts.length === 0 && (
                                        <p className="text-white/50 text-center py-8">
                                            No contact methods yet. Click + to add one.
                                        </p>
                                    )}
                                </div>
                            </GlassCard>

                            {/* Advanced Mode Card (V2) */}
                            {user && <AdvancedModeCard userId={user.id} />}
                        </>
                    )
                }
            </div >

            <TahoeGlassDialog
                open={showDowngradeModal}
                onOpenChange={setShowDowngradeModal}
                portal={false}
                title="Cancel Subscription?"
                titleClassName="text-2xl font-bold text-white text-center"
                tone="light"
                className="max-w-md p-8"
            >
                            <div className="text-center mb-6">
                                <div className="text-5xl mb-4">⚠️</div>
                                <p className="text-white/70 mb-4">
                                    Your subscription will remain active until the end of your current billing period.
                                </p>
                                <p className="text-red-400 font-medium">
                                    After that, you will lose your custom URL (nsso.me/{customDomain}) and it may be claimed by someone else.
                                </p>
                            </div>
                            <div className="flex gap-4">
                                <GlassButton
                                    variant="secondary"
                                    fullWidth
                                    onClick={() => setShowDowngradeModal(false)}
                                >
                                    Keep Premium
                                </GlassButton>
                                <GlassButton
                                    variant="primary"
                                    fullWidth
                                    onClick={handleDowngrade}
                                    disabled={processingDowngrade}
                                >
                                    {processingDowngrade ? 'Processing...' : 'Cancel Subscription'}
                                </GlassButton>
                            </div>
            </TahoeGlassDialog>
        </main >
    )
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><TahoeGlassSurface variant="pill" tone="light" className="px-6 py-3" contentClassName="text-xl">Loading...</TahoeGlassSurface></div>}>
            <DashboardContent />
        </Suspense>
    )
}
