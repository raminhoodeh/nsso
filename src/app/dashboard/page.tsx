'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Header from '@/components/layout/Header'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
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

const CONTACT_METHODS: ContactMethod[] = ['Email', 'WhatsApp', 'Phone', 'Telegram', 'Location', 'Other']

function DashboardContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const supabase = createClient()
    const { showToast } = useToast()
    const { user, refreshUser } = useUser()
    const { profile, updateField, profileCompleteness, loading: profileLoading } = useProfile()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Local UI state (will be migrated to ProfileProvider in Phase 2)
    const [fullName, setFullName] = useState('')
    const [headline, setHeadline] = useState('')
    const [profilePicUrl, setProfilePicUrl] = useState('')
    const [customDomain, setCustomDomain] = useState('')

    // Local state for links/contacts (Phase 1: Bio only - these stay local for now)
    const [links, setLinks] = useState<Link[]>([])
    const [contacts, setContacts] = useState<Contact[]>([])

    // UI state
    const [loading, setLoading] = useState(true || profileLoading)
    const [saving, setSaving] = useState(false)
    const [activeTab, setActiveTab] = useState<'page' | 'earnings' | 'my-nsso'>('page')
    const [showPolarModal, setShowPolarModal] = useState(false)
    const [showDowngradeModal, setShowDowngradeModal] = useState(false)
    const [urlCopied, setUrlCopied] = useState(false)

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

            // Load user
            const { data: userData } = await supabase
                .from('users')
                .select('*')
                .eq('id', authUser.id)
                .single()

            if (userData) {
                setCustomDomain(userData.username || '')
            }

            // Load profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', authUser.id)
                .single()

            if (profileData) {
                setFullName(profileData.full_name || '')
                setHeadline(profileData.headline || '')
                setProfilePicUrl(profileData.profile_pic_url || '')
            }

            // Load links (local state for Phase 1)
            const { data: linksData } = await supabase
                .from('links')
                .select('*')
                .eq('user_id', authUser.id)
                .order('created_at', { ascending: true })

            if (linksData) {
                setLinks(linksData)
            }

            // Load contacts (local state for Phase 1)
            const { data: contactsData } = await supabase
                .from('contacts')
                .select('*')
                .eq('user_id', authUser.id)
                .order('created_at', { ascending: true })

            if (contactsData) {
                setContacts(contactsData)
            }

            setLoading(false)
        }

        loadData()

        // Check for upgrade success
        if (searchParams.get('upgraded') === 'true') {
            showToast('You are now Premium! Username claimed.', 'success')
            // Clean URL
            router.replace('/dashboard')
        }
    }, [supabase, router, searchParams])

    // Sync local customDomain state with user context when loaded
    useEffect(() => {
        if (user?.username) {
            setCustomDomain(user.username)
        }
    }, [user])

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

    // Handle checkout
    // Handle checkout
    const handleCheckout = async () => {
        if (!desiredUsername || !usernameAvailable) return
        setProcessingCheckout(true)

        try {
            const response = await fetch('/api/polar-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ desiredUsername }),
            })
            const data = await response.json()

            if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl
            } else {
                console.error('Checkout Error:', data)
                showToast(data.details || data.error || 'Failed to start checkout', 'error')
            }
        } catch (err) {
            console.error('Checkout Exception:', err)
            showToast('Failed to start checkout. Check console.', 'error')
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
                bio: profile?.bio || '',
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

    // Add a new link
    const addLink = async () => {
        if (!user) return

        const { data, error } = await supabase
            .from('links')
            .insert({
                user_id: user.id,
                link_name: '',
                link_url: '',
            })
            .select()
            .single()

        if (data) {
            setLinks([...links, data])
        }
        if (error) {
            showToast('Failed to add link', 'error')
        }
    }

    // Update a link
    const updateLink = async (id: string, field: 'link_name' | 'link_url', value: string) => {
        setLinks(links.map(l => l.id === id ? { ...l, [field]: value } : l))

        const { error } = await supabase
            .from('links')
            .update({ [field]: value })
            .eq('id', id)

        if (!error) {
            showToast('Changes saved', 'success')
        }
    }

    // Remove a link
    const removeLink = async (id: string) => {
        await supabase.from('links').delete().eq('id', id)
        setLinks(links.filter(l => l.id !== id))
        showToast('Changes saved', 'success')
    }

    // Add a new contact
    const addContact = async () => {
        if (!user) return

        const { data, error } = await supabase
            .from('contacts')
            .insert({
                user_id: user.id,
                method: 'Email',
                value: '',
            })
            .select()
            .single()

        if (data) {
            setContacts([...contacts, data])
        }
        if (error) {
            showToast('Failed to add contact', 'error')
        }
    }

    // Update a contact
    const updateContact = async (
        id: string,
        field: 'method' | 'value' | 'custom_method_name',
        value: string
    ) => {
        setContacts(contacts.map(c => c.id === id ? { ...c, [field]: value } : c))

        const { error } = await supabase
            .from('contacts')
            .update({ [field]: value })
            .eq('id', id)

        if (!error) {
            showToast('Changes saved', 'success')
        }
    }

    // Remove a contact
    const removeContact = async (id: string) => {
        await supabase.from('contacts').delete().eq('id', id)
        setContacts(contacts.filter(c => c.id !== id))
    }

    // Copy profile URL
    const copyProfileUrl = () => {
        const url = `${window.location.origin}/${user?.username}`
        navigator.clipboard.writeText(url)
        showToast('Profile URL copied!', 'success')
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
            <Header />

            <div className="pt-[120px] px-6 lg:px-[165px] max-w-[1470px] mx-auto space-y-6">

                {/* Horizontal Tab Bar - Always visible */}
                <div className="absolute left-1/2 -translate-x-1/2 top-[95px] z-30">
                    <div
                        className="border-[1.4px] border-[rgba(255,255,255,0.4)] border-solid flex gap-[6px] items-start overflow-clip p-[8px] rounded-[100px]"
                        style={{
                            backdropFilter: 'blur(50px)'
                        }}
                    >
                        {/* Background layers */}
                        <div className="absolute inset-0 pointer-events-none rounded-[100px]">
                            <div className="absolute bg-[rgba(255,255,255,0.1)] inset-0 mix-blend-luminosity rounded-[100px]" />
                            <div
                                className="absolute inset-0 opacity-30 rounded-[100px]"
                                style={{
                                    backgroundImage: 'url(/siri-gradient.png)',
                                    backgroundSize: 'cover',
                                    backgroundPosition: '50% 50%',
                                    backdropFilter: 'blur(50px)'
                                }}
                            />
                        </div>

                        {/* Your Page Tab */}
                        <button
                            onClick={() => setActiveTab('page')}
                            className="relative flex h-[31px] items-center overflow-clip px-[14px] py-0 rounded-[100px] shrink-0 transition-all"
                        >
                            {activeTab === 'page' && (
                                <div
                                    className="absolute inset-0 pointer-events-none rounded-[100px]"
                                    style={{
                                        backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(192,192,192,0.4)), url(/siri-gradient.png)`,
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2)'
                                    }}
                                />
                            )}
                            <p
                                className={`relative font-semibold text-[13px] leading-[17px] overflow-ellipsis overflow-hidden whitespace-nowrap ${activeTab === 'page' ? 'text-[rgba(255,255,255,0.96)]' : 'text-[rgba(255,255,255,0.6)]'
                                    }`}
                                style={{
                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                    fontWeight: 590,
                                    fontVariationSettings: "'wdth' 100"
                                }}
                            >
                                Your Page
                            </p>
                        </button>

                        {/* My nsso Tab */}
                        <button
                            onClick={() => setActiveTab('my-nsso')}
                            className="relative flex h-[31px] items-center overflow-clip px-[14px] py-0 rounded-[100px] shrink-0 transition-all"
                        >
                            {activeTab === 'my-nsso' && (
                                <div
                                    className="absolute inset-0 pointer-events-none rounded-[100px]"
                                    style={{
                                        backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(192,192,192,0.4)), url(/siri-gradient.png)`,
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2)'
                                    }}
                                />
                            )}
                            <p
                                className={`relative font-semibold text-[13px] leading-[17px] overflow-ellipsis overflow-hidden whitespace-nowrap ${activeTab === 'my-nsso' ? 'text-[rgba(255,255,255,0.96)]' : 'text-[rgba(255,255,255,0.6)]'}`}
                                style={{
                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                    fontWeight: 590,
                                    fontVariationSettings: "'wdth' 100"
                                }}
                            >
                                My nsso
                            </p>
                        </button>

                        {/* Earnings Tab */}
                        <button
                            onClick={() => setActiveTab('earnings')}
                            className="relative flex h-[31px] items-center overflow-clip px-[14px] py-0 rounded-[100px] shrink-0 transition-all"
                        >
                            {activeTab === 'earnings' && (
                                <div
                                    className="absolute inset-0 pointer-events-none rounded-[100px]"
                                    style={{
                                        backgroundImage: `linear-gradient(to bottom, rgba(255,255,255,0.4), rgba(192,192,192,0.4)), url(/siri-gradient.png)`,
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2)'
                                    }}
                                />
                            )}
                            <p
                                className={`relative font-semibold text-[13px] leading-[17px] overflow-ellipsis overflow-hidden whitespace-nowrap ${activeTab === 'earnings' ? 'text-[rgba(255,255,255,0.96)]' : 'text-[rgba(255,255,255,0.6)]'
                                    }`}
                                style={{
                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                    fontWeight: 590,
                                    fontVariationSettings: "'wdth' 100"
                                }}
                            >
                                Earnings
                            </p>
                        </button>
                    </div>
                </div>

                {/* Profile Completeness Banner */}
                {profileCompleteness < 20 && (
                    <div
                        className="relative rounded-[20px] overflow-hidden cursor-pointer hover:scale-[1.01] transition-transform"
                        onClick={() => window.open('/deity', '_blank')}
                        style={{
                            border: '1.4px solid rgba(255, 255, 255, 0.4)',
                            backdropFilter: 'blur(50px)'
                        }}
                    >
                        {/* Background layers */}
                        <div className="absolute inset-0 pointer-events-none">
                            <div className="absolute bg-[rgba(255,255,255,0.1)] inset-0 mix-blend-luminosity" />
                            <div
                                className="absolute inset-0 opacity-30"
                                style={{
                                    backgroundImage: 'url(/siri-gradient.png)',
                                    backgroundSize: 'cover',
                                    backgroundPosition: '50% 50%'
                                }}
                            />
                        </div>

                        {/* Content */}
                        <div className="relative p-6 flex items-center gap-4">
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                                <Sparkles className="w-6 h-6 text-white" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-white font-semibold text-lg mb-1">Let Deity help you build your profile</h3>
                                <p className="text-white/60 text-sm">Your profile is {profileCompleteness}% complete. Click here for personalized assistance.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Your Page Tab Content */}
                {activeTab === 'page' && (
                    <GlassCard className="p-6 lg:p-8 relative pt-[48px] rounded-[40px] overflow-visible">
                        {/* Header */}
                        <div className="flex flex-wrap justify-between items-center mb-8 gap-4">
                            <h2 className="text-2xl font-bold text-white">
                                {profilePicUrl ? 'Hey, beautiful' : 'Profile'}
                            </h2>

                            {/* Ask Deity Button */}
                            <button
                                onClick={() => window.open('/deity', '_blank')}
                                className="flex items-center gap-2 px-4 py-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-all"
                                style={{
                                    border: '1px solid rgba(255, 255, 255, 0.2)'
                                }}
                            >
                                <Sparkles className="w-4 h-4" />
                                <span className="text-sm font-medium">Ask Deity to help</span>
                            </button>
                        </div>

                        {/* Profile Content */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Profile Picture */}
                            <div className="flex flex-col items-center">
                                <div
                                    className="w-40 h-40 rounded-3xl bg-white/10 overflow-hidden cursor-pointer hover:ring-4 ring-white/30 transition-all"
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {profilePicUrl ? (
                                        <img
                                            src={profilePicUrl}
                                            alt="Profile"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white/50">
                                            <span className="text-4xl">+</span>
                                        </div>
                                    )}
                                </div>
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
                                        <button
                                            onClick={() => window.open('/deity', '_blank')}
                                            className="flex items-center gap-1 px-2 py-1 rounded-full text-white/60 hover:text-white hover:bg-white/5 transition-all text-xs"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                            <span className="text-[10px] font-medium">Ask Deity</span>
                                        </button>
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
                                            <button
                                                onClick={() => window.open('/deity', '_blank')}
                                                className="flex items-center gap-1 px-2 py-1 rounded-full text-white/60 hover:text-white hover:bg-white/5 transition-all text-xs"
                                            >
                                                <Sparkles className="w-3 h-3" />
                                                <span className="text-[10px] font-medium">Ask Deity</span>
                                            </button>
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
                                    <label className="block text-white/50 text-xs font-bold uppercase tracking-wider mb-1 ml-1">BIO</label>
                                    <div className="relative rounded-[12px] overflow-hidden">
                                        <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                        <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                        <textarea
                                            value={profile?.bio || ''}
                                            onChange={(e) => updateField('bio', e.target.value)}

                                            placeholder="Need inspiration? Use this template: 'I am the [type of person] for [target customers] who want to [desired outcome]' and continue to elaborate on the experience of why you do this, how you do it, and what exactly is involved."
                                            rows={4}
                                            className="relative z-10 w-full bg-transparent border-none outline-none text-white text-[17px] font-medium leading-[22px] p-4 placeholder:text-white/50 resize-none"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Domain Section - Figma Exact Design */}
                        <div className="mt-8 pt-8 border-t border-white/10">
                            <div className="flex items-center gap-3 mb-4">
                                <h3 className="text-xl font-bold text-white">Domain name</h3>
                                {user?.is_premium && (
                                    <div className="relative border-[0.75px] border-white/45 rounded-[200px] px-[12px] py-[4px] overflow-hidden flex items-center justify-center group select-none">
                                        <div className="absolute inset-0 bg-white/[0.03] mix-blend-luminosity rounded-[200px]" />
                                        <div className="absolute inset-0 bg-gray-500/15 mix-blend-color-dodge rounded-[200px]" />
                                        <img
                                            alt=""
                                            src="/assets/premium-bezel.png"
                                            className="absolute inset-0 w-full h-full object-cover backdrop-blur-[68px]"
                                        />
                                        <span className="relative z-10 font-medium text-[12px] text-white/96 leading-[16px]" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                                            Premium
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                {/* Flex container for Input + External Downgrade Button */}
                                <div className="flex flex-col md:flex-row items-start gap-4">
                                    {/* Figma Domain Input with integrated CLAIM IT button */}
                                    <div className="relative w-full max-w-[522px] h-[54px] shrink-0">
                                        {/* Base container with all layers */}
                                        <div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                                            {/* Glassmorphic background layers */}
                                            <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                                            <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />

                                            {/* Purple gradient layer */}
                                            <div className="absolute inset-0 bg-[rgba(94,92,230,0.18)] rounded-[12px]" />

                                            {/* Siri gradient background image */}
                                            <div
                                                className="absolute inset-0 opacity-40 rounded-[12px]"
                                                style={{
                                                    backgroundImage: 'url(/siri-gradient.png)',
                                                    backgroundSize: 'cover',
                                                    backgroundPosition: 'center'
                                                }}
                                            />

                                            {/* Prefix text - nsso.me/ */}
                                            <span
                                                className="relative z-10 text-[22px] font-medium text-white/96 shrink-0 pl-4"
                                                style={{
                                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                    fontWeight: 510
                                                }}
                                            >
                                                nsso.me/
                                            </span>

                                            {/* Input field - Always editable now */}
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
                                                className="relative z-10 flex-1 bg-transparent border-none outline-none text-[22px] font-medium text-[#545454] placeholder:text-[#545454]/50 min-w-0"
                                                style={{
                                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                    fontWeight: 510
                                                }}
                                            />

                                            {/* Copy Button */}
                                            <button
                                                onClick={handleCopyUrl}
                                                className="relative z-10 p-2 mr-1 text-white/50 hover:text-white transition-colors"
                                                title="Copy URL"
                                            >
                                                {urlCopied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                                            </button>

                                            {/* Actions Section inside Input - Desktop Only */}
                                            <div className="relative z-10 hidden md:flex items-center gap-2 mr-1.5 shrink-0">

                                                {/* Primary Action: CLAIM IT (Non-Premium) or UPDATE (Premium + Changed) or Badge */}
                                                {(!user?.is_premium || (user?.is_premium && customDomain !== user.username)) ? (
                                                    <div
                                                        className="p-[0.75px] rounded-[100px]"
                                                        style={{
                                                            background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)'
                                                        }}
                                                    >
                                                        <button
                                                            onClick={user?.is_premium ? handleUpdateUsername : handleCheckout}
                                                            disabled={!usernameAvailable || processingCheckout || (user?.is_premium && !customDomain) || (!user?.is_premium && !desiredUsername)}
                                                            className="relative h-[42px] w-[133px] rounded-[100px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-[0.98]"
                                                            style={{
                                                                boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)'
                                                            }}
                                                        >
                                                            {/* Shiny button background layers */}
                                                            <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[100px]" />
                                                            <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[100px]" />

                                                            <span
                                                                className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide"
                                                                style={{
                                                                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                                    fontWeight: 590
                                                                }}
                                                            >
                                                                {processingCheckout ? 'Processing...' : (user?.is_premium ? 'UPDATE' : 'CLAIM IT')}
                                                            </span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="h-[42px] px-4 rounded-[12px] border border-white/45 flex items-center justify-center text-[14px] font-semibold text-white/60 bg-white/5">
                                                        Premium Active
                                                    </span>
                                                )}
                                            </div>

                                            {/* Inset shadow overlay */}
                                            <div
                                                className="absolute inset-0 pointer-events-none rounded-[12px]"
                                                style={{
                                                    boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)'
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Mobile Actions Row (Below Input) */}
                                    <div className="flex md:hidden items-center gap-3 w-full">
                                        {/* Primary Action Button (Mobile) */}
                                        {(!user?.is_premium || (user?.is_premium && customDomain !== user.username)) ? (
                                            <div
                                                className="p-[0.75px] rounded-[100px] flex-1"
                                                style={{
                                                    background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)'
                                                }}
                                            >
                                                <button
                                                    onClick={user?.is_premium ? handleUpdateUsername : handleCheckout}
                                                    disabled={!usernameAvailable || processingCheckout || (user?.is_premium && !customDomain) || (!user?.is_premium && !desiredUsername)}
                                                    className="relative h-[42px] w-full rounded-[100px] flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                                                    style={{
                                                        boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)'
                                                    }}
                                                >
                                                    <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[100px]" />
                                                    <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[100px]" />
                                                    <span
                                                        className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide"
                                                        style={{
                                                            fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                                            fontWeight: 590
                                                        }}
                                                    >
                                                        {processingCheckout ? 'Processing...' : (user?.is_premium ? 'UPDATE' : 'CLAIM IT')}
                                                    </span>
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="h-[42px] px-4 rounded-[12px] border border-white/45 flex items-center justify-center text-[14px] font-semibold text-white/60 bg-white/5 flex-1">
                                                Premium Active
                                            </span>
                                        )}


                                        {/* Mobile Downgrade Button */}
                                        {user?.is_premium && (
                                            <button
                                                onClick={() => setShowDowngradeModal(true)}
                                                className="h-[42px] px-6 rounded-[100px] border border-white/20 flex items-center justify-center text-[15px] font-medium text-white/90 hover:text-white/95 hover:bg-white/5 transition-all hover:border-white/30"
                                            >
                                                Downgrade
                                            </button>
                                        )}
                                    </div>

                                    {/* Downgrade Button - Situated to the right */}
                                    {user?.is_premium && (
                                        <button
                                            onClick={() => setShowDowngradeModal(true)}
                                            className="hidden md:flex h-[54px] px-6 rounded-[100px] border border-white/20 items-center justify-center text-[15px] font-medium text-white/90 hover:text-white/95 hover:bg-white/5 transition-all hover:border-white/30"
                                        >
                                            Downgrade
                                        </button>
                                    )}

                                    {/* Quote Section */}
                                    <div className="hidden lg:flex items-center h-[54px] ml-4">
                                        <p className="text-white/80 text-sm italic font-bold max-w-[500px] leading-tight text-right lg:text-left">
                                            "nsso is the most beautiful way to present yourself online" <span className="font-normal not-italic">- <a href="https://www.instagram.com/ramin.nsso" target="_blank" rel="noopener noreferrer" className="hover:underline">Ramin Hoodeh</a></span>
                                        </p>
                                    </div>
                                </div>

                                {/* Username availability indicator */}
                                {((!user?.is_premium && desiredUsername) || (user?.is_premium && customDomain !== user?.username && customDomain)) && (
                                    <div>
                                        {checkingUsername ? (
                                            <p className="text-white/50 text-sm">Checking availability...</p>
                                        ) : usernameAvailable === true ? (
                                            <p className="text-green-400 text-sm">✓ This username is available!</p>
                                        ) : usernameAvailable === false ? (
                                            <p className="text-red-400 text-sm">✗ {usernameError || 'Username not available'}</p>
                                        ) : null}
                                    </div>
                                )}

                                <p className="text-white/80 text-sm">
                                    {user?.is_premium
                                        ? `Your custom URL: nsso.me/${customDomain}`
                                        : 'Upgrade to premium ($8/mo) to claim your custom URL'}
                                </p>
                            </div>
                        </div>
                    </GlassCard>
                )}

                {/* Earnings Tab Content - No wrapper */}
                {activeTab === 'earnings' && <EarningsTab />}
                {activeTab === 'my-nsso' && <MyNssoTab />}


                {/* Only show Links, Contact, and Advanced Mode cards on "Your Page" tab */}
                {activeTab === 'page' && (
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
                                    <button
                                        onClick={() => window.open('/deity', '_blank')}
                                        className="flex items-center gap-2 px-3 py-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-all"
                                        style={{
                                            border: '1px solid rgba(255, 255, 255, 0.2)'
                                        }}
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        <span className="text-xs font-medium hidden sm:inline">Ask Deity</span>
                                    </button>
                                    <button
                                        onClick={addLink}
                                        className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-2xl transition-colors shrink-0"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {links.map((link) => (
                                    <div key={link.id} className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                                        <div className="w-full md:flex-1">
                                            <Input
                                                value={link.link_name}
                                                onChange={(e) => updateLink(link.id, 'link_name', e.target.value)}
                                                placeholder="Link name (e.g. Portfolio)"
                                            />
                                        </div>
                                        <div className="flex w-full md:flex-1 gap-4 items-center">
                                            {/* Validation Status Indicator */}
                                            <div
                                                className="w-2 h-2 rounded-full flex-shrink-0"
                                                style={{
                                                    backgroundColor: link.link_url && link.link_url.startsWith('http')
                                                        ? 'rgb(34, 197, 94)' // green for valid
                                                        : 'rgb(239, 68, 68)' // red for invalid/empty
                                                }}
                                                title={link.link_url && link.link_url.startsWith('http') ? 'Valid URL' : 'Invalid or missing URL'}
                                            />
                                            <div className="flex-1 min-w-0">
                                                <Input
                                                    value={link.link_url}
                                                    onChange={(e) => updateLink(link.id, 'link_url', e.target.value)}
                                                    placeholder="https://..."
                                                />
                                            </div>
                                            <button
                                                onClick={() => removeLink(link.id)}
                                                className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-colors shrink-0"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {links.length === 0 && (
                                    <p className="text-white/50 text-center py-8">
                                        No links yet. Click + to add your first link.
                                    </p>
                                )}
                            </div>
                        </GlassCard>

                        {/* Card 3: Contact Section */}
                        <GlassCard className="p-6 lg:p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div className="pr-8">
                                    <h2 className="text-2xl font-bold text-white">Contact</h2>
                                    <p className="text-white/70 text-sm">Add your preferred contact methods</p>
                                </div>
                                <button
                                    onClick={addContact}
                                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-2xl transition-colors shrink-0"
                                >
                                    +
                                </button>
                            </div>

                            <div className="space-y-4">
                                {contacts.map((contact) => (
                                    <div key={contact.id} className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                                        <div className="w-full md:w-40">
                                            <div className="relative rounded-[12px] overflow-hidden">
                                                <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px] pointer-events-none" />
                                                <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px] pointer-events-none" />
                                                <select
                                                    value={contact.method}
                                                    onChange={(e) => updateContact(contact.id, 'method', e.target.value)}
                                                    className="relative z-10 w-full bg-transparent border-none outline-none text-[#545454] text-[17px] font-medium leading-[22px] py-3 px-4 pr-10 cursor-pointer appearance-none"
                                                >
                                                    {CONTACT_METHODS.map((method) => (
                                                        <option key={method} value={method}>{method}</option>
                                                    ))}
                                                </select>
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-0 pointer-events-none text-[#545454]">
                                                    <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                        <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>

                                        {contact.method === 'Other' && (
                                            <div className="w-full md:w-40">
                                                <Input
                                                    value={contact.custom_method_name || ''}
                                                    onChange={(e) => updateContact(contact.id, 'custom_method_name', e.target.value)}
                                                    placeholder="Method name"
                                                />
                                            </div>
                                        )}

                                        <div className="flex w-full md:flex-1 gap-4 items-center">
                                            <div className="flex-1 min-w-0">
                                                <Input
                                                    value={contact.value}
                                                    onChange={(e) => updateContact(contact.id, 'value', e.target.value)}
                                                    placeholder={contact.method === 'Email' ? 'you@example.com' : 'Contact details'}
                                                />
                                            </div>
                                            <button
                                                onClick={() => removeContact(contact.id)}
                                                className="w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-colors shrink-0"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))}

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
                )}
            </div>

            {/* Downgrade Confirmation Modal */}
            {showDowngradeModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
                    <GlassCard className="w-full max-w-md p-8">
                        <h2 className="text-2xl font-bold text-white mb-4 text-center">
                            Cancel Subscription?
                        </h2>
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
                    </GlassCard>
                </div>
            )}
        </main>
    )
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="text-white text-xl">Loading...</div></div>}>
            <DashboardContent />
        </Suspense>
    )
}
