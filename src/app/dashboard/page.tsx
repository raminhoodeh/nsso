'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { validateProfileUsername } from '@/lib/profile-username'
import Header from '@/components/layout/Header'
import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import {
    TahoeGlassButton,
    TahoeGlassField,
    TahoeGlassSurface
} from '@/components/ui/tahoe-glass'
import { SortableContactItem } from './components/SortableContactItem'
import Input from '@/components/ui/Input'
import { Loader2, Copy, Check } from 'lucide-react'
import AdvancedModeCard from '@/app/dashboard/components/AdvancedModeCard'
import EarningsTab from '@/app/dashboard/components/EarningsTab'

import MyNssoTab from '@/app/dashboard/components/MyNssoTab'
import { useToast } from '@/components/ui/Toast'
import { useUser } from '@/components/providers/UserProvider'
import { useProfile } from '@/components/providers/ProfileProvider'
import type { ProfilePatch } from '@/lib/profile-mutations'
import ImageCropperModal from '@/components/ui/ImageCropperModal'
import { uploadProfileMedia, runProfileMediaAttempt } from '@/lib/profile-media-client'
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

function DashboardContent() {
    const { user, loading, error, refreshUser } = useUser()
    const [claimOwner, setClaimOwner] = useState<string | null>(null)
    if (user && !claimOwner) setClaimOwner(user.id)
    if (loading || (user && !claimOwner)) return <main className="min-h-screen flex items-center justify-center text-white"><p role="status">Loading your account…</p></main>
    if (!user) return <main className="min-h-screen flex items-center justify-center text-white"><div className="space-y-4 text-center">{error ? <><p role="alert">Your account could not be loaded. Please retry.</p><button type="button" onClick={() => { void refreshUser() }}>Retry account</button></> : <Link href="/sign-in?next=/dashboard">Sign in to open your profile editor</Link>}</div></main>
    return <DashboardForAccount key={user.id} allowClaim={claimOwner === user.id} />
}

function DashboardForAccount({ allowClaim }: { allowClaim: boolean }) {
    const searchParams = useSearchParams()
    const { showToast } = useToast()
    const { user, refreshUser } = useUser()
    const {
        profile,
        loading,
        refreshProfile,
        links,
        contacts,
        updateField: updateProfile,
        patchProfile,
        updateLink,
        addLink,
        removeLink,
        reorderLinks,
        updateContact,
        addContact,
        removeContact,
        reorderContacts,
        profileCompleteness,
    } = useProfile()
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Local UI state (will be migrated to ProfileProvider in Phase 2)
    const [fullName, setFullName] = useState('')
    const [headline, setHeadline] = useState('')
    const [bio, setBio] = useState('') // Local state for bio to prevent spam
    const [profilePicUrl, setProfilePicUrl] = useState('')
    const claimIntent = validateProfileUsername(allowClaim ? searchParams.get('claim') : null)
    const [customDomain, setCustomDomain] = useState(() => 'username' in claimIntent ? claimIntent.username : user?.username || '')
    const savedUsername = useRef(user?.username)


    // UI state follows the account-scoped authoritative profile provider.

    const [saving, setSaving] = useState(false)
    // URL-based state for navigation
    const currentView = searchParams.get('view') || 'profile'
    const [urlCopied, setUrlCopied] = useState(false)

    // PREFETCH STATES & REFS

    const [prefetchedEarnings, setPrefetchedEarnings] = useState<EarningsStats | null>(null)
    const [prefetchedMyNsso, setPrefetchedMyNsso] = useState<any>(null)

    // Each account owns its prefetch lifetime; an old account response is ignored.
    useEffect(() => {
        const controller = new AbortController()
        let active = true
        async function prefetch(path: string, publish: (value: any) => void) {
            try {
                const response = await fetch(path, { signal: controller.signal, cache: 'no-store' })
                if (response.ok) { const data = await response.json(); if (active) publish(data) }
            } catch { /* The selected tab exposes its own retry state. */ }
        }
        void prefetch('/api/my-nsso/connections?sort=date&order=desc', setPrefetchedMyNsso)
        const timer = setTimeout(() => { void prefetch('/api/earnings/stats', setPrefetchedEarnings) }, 1000)
        return () => { active = false; controller.abort(); clearTimeout(timer) }
    }, [])

    // Cropper State
    const [cropperOpen, setCropperOpen] = useState(false)
    const [cropperImage, setCropperImage] = useState<string | null>(null)
    const [isUploading, setIsUploading] = useState(false)

    // Username validation state
    const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
    const [usernameError, setUsernameError] = useState('')
    const [checkingUsername, setCheckingUsername] = useState(false)
    const [updatingUsername, setUpdatingUsername] = useState(false)

    // Initial claim intent stays editable; later confirmed username changes update it.
    useEffect(() => {
        if (savedUsername.current !== user?.username) {
            savedUsername.current = user?.username
            setCustomDomain(user?.username || '')
        }
    }, [user?.username])

    // Sync local state with profile provider updates (e.g. from Deity)
    useEffect(() => {
        if (profile) {
            if (profile.bio !== bio && !saving) setBio(profile.bio || '')
            if (profile.headline !== headline && !saving) setHeadline(profile.headline || '')
            if (profile.full_name !== fullName && !saving) setFullName(profile.full_name || '')
            if (profile.profile_pic_url !== profilePicUrl && !isUploading) setProfilePicUrl(profile.profile_pic_url || '')
        }
    }, [profile?.bio, profile?.headline, profile?.full_name, profile?.profile_pic_url])

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

    // Cancel stale checks so availability always belongs to the current input.
    useEffect(() => {
        setUsernameAvailable(null)
        setUsernameError('')
        setCheckingUsername(false)
        if (!customDomain || customDomain === user?.username) return

        const controller = new AbortController()
        const timer = setTimeout(async () => {
            setCheckingUsername(true)
            try {
                const response = await fetch(`/api/check-username?username=${encodeURIComponent(customDomain)}`, {
                    signal: controller.signal,
                })
                const data = await response.json()
                if (!controller.signal.aborted) {
                    setUsernameAvailable(response.ok && data.available)
                    setUsernameError(data.reason || data.error || '')
                }
            } catch {
                if (!controller.signal.aborted) {
                    setUsernameError('Failed to check username')
                    setUsernameAvailable(false)
                }
            } finally {
                if (!controller.signal.aborted) setCheckingUsername(false)
            }
        }, 500)

        return () => {
            clearTimeout(timer)
            controller.abort()
        }
    }, [customDomain, user?.username])

    // Profile URLs are available to every signed-in user for free.
    const handleUpdateUsername = async () => {
        if (!customDomain || customDomain === user?.username || !usernameAvailable) return
        setUpdatingUsername(true)
        try {
            const response = await fetch('/api/update-username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: customDomain }),
            })
            const data = await response.json()
            if (response.ok && data.success) {
                showToast('Username updated successfully!', 'success')

                // Refresh global user context to update Header immediately
                await refreshUser()
            } else {
                showToast(data.error || 'Failed to update username', 'error')
            }
        } catch {
            showToast('Failed to update username', 'error')
        }
        setUpdatingUsername(false)
    }

    // Save profile changes
    const handleCopyUrl = () => {
        const domain = user?.username
        if (!domain) return
        void navigator.clipboard.writeText(`https://nsso.me/${domain}`).then(() => {
            setUrlCopied(true); showToast('Profile URL copied!', 'success')
            setTimeout(() => setUrlCopied(false), 2000)
        }).catch(() => showToast('The URL could not be copied. You can select and copy it above.', 'error'))
    }

    const saveProfile = async (patch: ProfilePatch) => {
        setSaving(true)
        await patchProfile(patch,true)
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
    const handleCropComplete = async (croppedBlob: Blob, signal: AbortSignal) => {
        if (!user) return
        setIsUploading(true)

        try {
            await runProfileMediaAttempt(async attemptSignal => {
                const {url:publicUrl}=await uploadProfileMedia(croppedBlob,'avatar',user.id,attemptSignal)
                if (attemptSignal.aborted) return
                // Only the returned committed operation can acknowledge this image change.
                const committed = await patchProfile({profile_pic_url:publicUrl},true)
                if (attemptSignal.aborted) return
                if (!committed) throw new Error('The image change was not saved. Your crop has been kept.')
                setProfilePicUrl(publicUrl)
                showToast('Profile picture updated!', 'success')
                setCropperOpen(false)
                setCropperImage(null)
            }, { signal })
        } catch (error) {
            if (!signal.aborted) showToast(error instanceof Error ? error.message : 'The image was not uploaded. Your crop has been kept.', 'error')
        } finally {
            setIsUploading(false)
        }
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

    if (!profile) return <main className="min-h-screen flex items-center justify-center text-white"><div className="space-y-4 text-center"><p role="alert">Your profile could not be loaded. Please retry before editing.</p><button type="button" onClick={() => { void refreshProfile() }}>Retry profile</button></div></main>

    return (
        <main className="min-h-screen pb-12">
            <div className="md:hidden">
                <Header />
            </div>

            <div className="mx-auto max-w-[1470px] space-y-6 pb-0 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-[calc(120px+env(safe-area-inset-top))] sm:pl-[max(24px,env(safe-area-inset-left))] sm:pr-[max(24px,env(safe-area-inset-right))] md:pt-10 lg:px-8">

                {/* Tab Bar Removed - Replaced by Global Sidebar/BottomNav */}

                {/* Profile Completeness Banner */}
                {profileCompleteness < 20 && (
                    <TahoeGlassSurface
                        as="button"
                        type="button"
                        variant="card"
                        radius={20}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.38}
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
                    <GlassCard
                        refractive
                        radius="var(--profile-card-radius)"
                        className="relative overflow-visible [--profile-card-radius:32px] p-4 pt-[48px] sm:[--profile-card-radius:40px] sm:p-6 sm:pt-[48px] lg:p-8 lg:pt-[48px]"
                    >
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
                                className="min-h-11 px-4 py-2"
                                contentClassName="text-white/90"
                            >
                                <Sparkles className="w-4 h-4" />
                                <span className="text-sm font-medium">Ask Deity to help</span>
                            </TahoeGlassButton>
                        </div>

                        {/* Profile Content */}
                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
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
                                        <label htmlFor="profile-full-name" className="block text-white/50 text-xs font-bold uppercase tracking-wider">FULL NAME</label>
                                    </div>
                                    <Input
                                        id="profile-full-name"
                                        name="name"
                                        autoComplete="name"
                                        value={fullName}
                                        onChange={(e) => {setFullName(e.target.value);void updateProfile('full_name',e.target.value)}}
                                        onBlur={() => {void saveProfile({full_name:fullName})}}
                                        placeholder="Your full name"
                                    />
                                </div>

                                <div className="space-y-4">
                                    <div className="mb-3 ml-1 flex items-center justify-between gap-3">
                                        <label htmlFor="profile-headline" className="block text-white/50 text-xs font-bold uppercase tracking-wider">HEADLINE</label>
                                        <div className="flex items-center gap-3">
                                            {/* Character Counter */}
                                            <span className="text-white/40 text-[10px] font-medium">
                                                {headline.length}/120
                                            </span>
                                            <TahoeGlassButton
                                                onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                                    detail: { initialMessage: "Help me write a catchy headline..." }
                                                }))}
                                                className="min-h-11 min-w-11 px-1.5 py-0.5"
                                                contentClassName="gap-1 text-white/75"
                                            >
                                                <Sparkles className="w-3 h-3" />
                                                <span className="text-[10px] font-medium">Ask Deity</span>
                                            </TahoeGlassButton>
                                        </div>
                                    </div>
                                    <Input
                                        id="profile-headline"
                                        name="headline"
                                        value={headline}
                                        onChange={(e) => {setHeadline(e.target.value);void updateProfile('headline',e.target.value)}}
                                        onBlur={() => {void saveProfile({headline})}}
                                        placeholder="What you do"
                                        maxLength={120}
                                    />
                                </div>

                                <div>
                                    <div className="mb-3 ml-1 flex items-center justify-between gap-3">
                                        <label htmlFor="profile-bio" className="block text-white/50 text-xs font-bold uppercase tracking-wider">BIO</label>
                                        <TahoeGlassButton
                                            onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                                detail: { initialMessage: "Help me write my bio..." }
                                            }))}
                                            className="min-h-11 min-w-11 px-1.5 py-0.5"
                                            contentClassName="gap-1 text-white/75"
                                        >
                                            <Sparkles className="w-3 h-3" />
                                            <span className="text-[10px] font-medium">Ask Deity</span>
                                        </TahoeGlassButton>
                                    </div>
                                    <TahoeGlassField
                                        tone="light"
                                        surfaceClassName="p-0"
                                        controlClassName="min-h-[384px] resize-none p-4 text-[17px] font-medium leading-[22px] md:min-h-0"
                                        data-mobile-bio-field="expanded"
                                    >
                                        <textarea
                                            id="profile-bio"
                                            name="bio"
                                            value={bio}
                                            onChange={(e) => {setBio(e.target.value);void updateProfile('bio',e.target.value)}}
                                            onBlur={() => {void saveProfile({bio})}}

                                            placeholder="Need inspiration? Use this template: 'I am the [type of person] for [target customers] who want to [desired outcome]' and continue to elaborate on the experience of why you do this, how you do it, and what exactly is involved."
                                            rows={4}
                                            className="text-white placeholder:text-white/50"
                                        />
                                    </TahoeGlassField>
                                </div>



                            </div>
                        </div>

                        {/* Free profile URL */}
                        <div className="mt-8 pt-8 border-t border-white/10">
                            <div className="flex items-center gap-3 mb-4">
                                <h3 className="text-xl font-bold text-white">Profile URL</h3>
                                <TahoeGlassSurface variant="pill" tone="light" className="px-3 py-1" contentClassName="flex items-center justify-center">
                                    <span className="text-xs font-medium text-white/95">Premium · Free</span>
                                </TahoeGlassSurface>
                            </div>

                            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                <TahoeGlassSurface variant="recessed" radius={12} tone="light" className="h-[54px] w-full md:flex-1" contentClassName="flex h-full w-full items-center px-2">
                                    <span className="shrink-0 pl-2 text-[18px] font-medium text-white/95 sm:text-[22px]">nsso.me/</span>
                                    <input
                                        type="text"
                                        value={customDomain}
                                        onChange={(event) => setCustomDomain(event.target.value)}
                                        placeholder="yourname"
                                        aria-label="Profile username"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        className="min-w-0 flex-1 border-none bg-transparent text-[18px] font-medium text-white outline-none placeholder:text-white/50 sm:text-[22px]"
                                    />
                                    <TahoeGlassButton
                                        onClick={handleCopyUrl}
                                        disabled={!user?.username}
                                        className="mr-1 h-11 w-11 p-0"
                                        contentClassName="text-white/70"
                                        title="Copy saved profile URL"
                                        aria-label="Copy saved profile URL"
                                    >
                                        {urlCopied ? <Check size={18} className="text-green-400" /> : <Copy size={18} />}
                                    </TahoeGlassButton>
                                </TahoeGlassSurface>
                                <TahoeGlassButton
                                    onClick={handleUpdateUsername}
                                    disabled={updatingUsername || !usernameAvailable || !customDomain || customDomain === user?.username}
                                    className="h-11 shrink-0 px-6"
                                    contentClassName="text-white/95"
                                >
                                    {updatingUsername && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {updatingUsername ? 'Updating...' : 'Update URL'}
                                </TahoeGlassButton>
                            </div>
                            {customDomain && customDomain !== user?.username && (
                                <div className="mt-2" aria-live="polite">
                                    {checkingUsername ? (
                                        <p className="text-white/50 text-sm">Checking availability...</p>
                                    ) : usernameAvailable === true ? (
                                        <p className="text-green-400 text-sm">✓ This username is available!</p>
                                    ) : usernameAvailable === false ? (
                                        <p className="text-red-400 text-sm">✗ {usernameError || 'Username not available'}</p>
                                    ) : null}
                                </div>
                            )}
                            <p className="mt-4 text-white/60 text-sm">Premium profile access and your nsso.me URL are currently free.</p>
                        </div>
                    </GlassCard>
                )}



                {/* Earnings Tab Content */}
                {currentView === 'earnings' && <EarningsTab initialData={prefetchedEarnings || undefined} />}
                {currentView === 'my-nsso' && <MyNssoTab initialData={prefetchedMyNsso || undefined} />}


                {/* Only show Links, Contact, and Advanced Mode cards on "Your Profile" tab */}
                {
                    currentView === 'profile' && (
                        <>
                            {/* Card 2: Links Section */}
                            <GlassCard className="p-4 sm:p-6 lg:p-8">
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
                                            className="min-h-11 px-3 py-2"
                                            contentClassName="text-white/90"
                                        >
                                            <Sparkles className="w-4 h-4" />
                                            <span className="text-xs font-medium hidden sm:inline">Ask Deity</span>
                                        </TahoeGlassButton>
                                        <TahoeGlassButton
                                            onClick={() => addLink('', '')}
                                            className="h-11 w-11 shrink-0 p-0"
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
                            <GlassCard className="p-4 sm:p-8">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-white mb-2">Contact</h2>
                                        <p className="text-white/50 text-sm">Add your contact methods and social profiles.</p>
                                    </div>
                                    <TahoeGlassButton
                                        onClick={() => addContact()}
                                        className="h-11 w-11 p-0"
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
