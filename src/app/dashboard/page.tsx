'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { validateProfileUsername } from '@/lib/profile-username'
import Header from '@/components/layout/Header'
import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import {
    TahoeGlassField,
    TahoeGlassSurface
} from '@/components/ui/tahoe-glass'
import { LightButton, LightIconButton } from '@/components/ui/LightButton'
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
import SectionHelp from './components/SectionHelp'
import AskDeityButton from '@/components/ui/AskDeityButton'

function DashboardContent() {
    const { user, loading, error, refreshUser } = useUser()
    const [claimOwner, setClaimOwner] = useState<string | null>(null)
    const header = !loading && <div className="lg:hidden"><Header /></div>
    if (user && !claimOwner) setClaimOwner(user.id)
    if (loading || (user && !claimOwner)) return <>{header}<main className="min-h-screen flex items-center justify-center text-slate-950"><p role="status" className="nsso-crystal-reading rounded-3xl px-6 py-4">Loading your account…</p></main></>
    if (!user) return <>{header}<main className="min-h-screen flex items-center justify-center text-slate-950"><div className="nsso-crystal-reading mx-6 max-w-lg space-y-4 rounded-3xl p-6 text-center">{error ? <><p role="alert">Your account could not be loaded. Please retry.</p><LightButton type="button" onClick={() => { void refreshUser() }}>Retry account</LightButton></> : <Link href="/sign-in?next=/dashboard">Sign in to open your profile editor</Link>}</div></main></>
    return <>{header}<DashboardForAccount key={user.id} allowClaim={claimOwner === user.id} /></>
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
        createEntity,
        removeLink,
        reorderLinks,
        updateContact,
        removeContact,
        reorderContacts,
        profileCompleteness,
    } = useProfile()
    const currentView = searchParams.get('view') || 'profile'
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [addingCollection, setAddingCollection] = useState<'link' | 'contact' | null>(null)
    const addInFlight = useRef(false)
    const newItemFocus = useRef<{ id: string; origin: Element | null } | null>(null)
    const insertionView = useRef(0)
    useEffect(() => { insertionView.current++; newItemFocus.current = null }, [currentView])

    useEffect(() => {
        const request = newItemFocus.current
        if (!request) return
        newItemFocus.current = null
        const field = document.querySelector<HTMLInputElement>(`[data-profile-item-id="${request.id}"] input`)
        const active = document.activeElement
        // Deity deliberately keeps a closed, inert dialog mounted. Only an
        // actually open modal may suppress focus into the new editor row.
        const modal = document.querySelector('dialog:modal') || Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')).some(element => !element.closest('[hidden],[inert],[aria-hidden="true"]') && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden')
        if (!field || currentView !== 'profile' || modal || field.closest('[inert]') || (active !== request.origin && active !== document.body)) return
        field.focus({ preventScroll: true })
        field.scrollIntoView({ block: 'center', behavior: 'instant' })
    }, [addingCollection, links, contacts, currentView])

    const addProfileItem = async (kind: 'link' | 'contact', position: 'top' | 'bottom') => {
        if (addInFlight.current) return
        addInFlight.current = true
        const generation = insertionView.current
        const origin = document.activeElement
        setAddingCollection(kind)
        try {
            const result = kind === 'link'
                ? await createEntity('link', { link_name: '', link_url: '' }, position)
                : await createEntity('contact', { method: 'Email', value: '', custom_method_name: null }, position)
            const created = result.changes.find(change => change.entity === (kind === 'link' ? 'links' : 'contacts') && change.row)
            if (result.status === 'applied' && created && generation === insertionView.current) newItemFocus.current = { id: created.id, origin }
        } finally {
            addInFlight.current = false
            setAddingCollection(null)
        }
    }

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
                <div className="nsso-crystal-reading rounded-3xl px-6 py-4 text-slate-950 text-xl text-center">
                    All of you...<br />all in one place
                </div>
            </main>
        )
    }

    if (!profile) return <main className="min-h-screen flex items-center justify-center text-slate-950"><div className="nsso-crystal-reading mx-6 max-w-lg space-y-4 rounded-3xl p-6 text-center"><p role="alert">Your profile could not be loaded. Please retry before editing.</p><LightButton type="button" onClick={() => { void refreshProfile() }}>Retry profile</LightButton></div></main>

    return (
        <main className="min-h-screen pb-12">
            <div className="mx-auto max-w-[1470px] space-y-6 pb-0 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-[calc(120px+env(safe-area-inset-top))] sm:pl-[max(24px,env(safe-area-inset-left))] sm:pr-[max(24px,env(safe-area-inset-right))] lg:pt-10 lg:px-8">

                {/* Desktop sidebar and mobile account menu own navigation. */}

                {/* Profile Completeness Banner */}
                {profileCompleteness < 20 && (
                    <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin"
                        variant="card"
                        radius={20}
                        tone="dark"
                        semanticTint="light"
                        semanticTintOpacity={0.18}
                        className="nsso-crystal-panel w-full overflow-hidden text-left"
                        contentClassName="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-4"
                    >
                            <span className="min-w-0 flex-1">
                                <span className="block text-base font-semibold text-slate-950">Let Deity help you build your profile</span>
                                <span className="block text-sm text-slate-900">Your profile is {profileCompleteness}% complete. Ask Deity for personalized assistance.</span>
                            </span>
                            <AskDeityButton
                                onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                    detail: { initialMessage: "What is missing from my profile?" }
                                }))}
                                aria-label="Ask Deity what is missing from my profile"
                            />
                    </TahoeGlassSurface>
                )}

                {/* Your Profile Tab Content */}
                {currentView === 'profile' && (
                    <GlassCard
                        refractive
                        radius="var(--profile-card-radius)"
                        className="relative overflow-visible [--profile-card-radius:32px] p-4 sm:[--profile-card-radius:40px] sm:p-6 lg:p-8"
                    >
                        {/* Header */}
                        <div data-profile-identity-header className="mb-5 flex items-center justify-between gap-2 sm:mb-6 sm:gap-4">
                            <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">
                                {profilePicUrl ? 'Hey, wonderful' : 'Profile'}
                            </h2>

                            {/* Ask Deity Button */}
                            <AskDeityButton onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                    detail: { initialMessage: "How can you help me improve my profile?" }
                                }))} aria-label="Ask Deity about my profile" />
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
                                    className="aspect-square w-full max-w-72 overflow-hidden hover:ring-4 ring-slate-500/30 lg:max-w-64"
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
                                        <span className="w-full h-full flex items-center justify-center text-slate-900">
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
                                <p className="text-slate-900 text-sm mt-2">Click to upload</p>
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
                                        <label htmlFor="profile-full-name" className="block text-slate-900 text-xs font-bold uppercase tracking-wider">FULL NAME</label>
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
                                        <label htmlFor="profile-headline" className="block text-slate-900 text-xs font-bold uppercase tracking-wider">HEADLINE</label>
                                        <div className="flex items-center gap-3">
                                            {/* Character Counter */}
                                            <span className="text-slate-900 text-[10px] font-medium">
                                                {headline.length}/120
                                            </span>
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
                                        <label htmlFor="profile-bio" className="block text-slate-900 text-xs font-bold uppercase tracking-wider">BIO</label>
                                    </div>
                                    <TahoeGlassField
                                        tone="dark"
                                        surfaceClassName="p-0"
                                        controlClassName="min-h-[384px] resize-none p-4 text-[17px] font-medium leading-[22px] md:min-h-0 profile-bio-input"
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
                                            className="text-slate-950 placeholder:text-slate-900"
                                        />
                                    </TahoeGlassField>
                                </div>



                            </div>
                        </div>

                        {/* Free profile URL */}
                        <div className="mt-8 pt-8 border-t border-slate-500/15">
                            <div className="flex items-center gap-3 mb-4">
                                <h3 className="text-xl font-bold text-slate-950">Profile URL</h3>
                                <span className="nsso-glass-control inline-flex items-center justify-center rounded-full px-3 py-1">
                                    <span className="text-xs font-medium text-slate-900">Premium · Free</span>
                                </span>
                            </div>

                            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                <TahoeGlassSurface variant="recessed" radius={12} tone="dark" className="h-[54px] w-full md:flex-1" contentClassName="flex h-full w-full items-center px-2">
                                    <span className="shrink-0 pl-2 text-[18px] font-medium text-slate-900 sm:text-[22px]">nsso.me/</span>
                                    <input
                                        type="text"
                                        value={customDomain}
                                        onChange={(event) => setCustomDomain(event.target.value)}
                                        placeholder="yourname"
                                        aria-label="Profile username"
                                        autoCapitalize="none"
                                        autoCorrect="off"
                                        className="min-w-0 flex-1 border-none bg-transparent text-[18px] font-medium text-slate-950 outline-none placeholder:text-slate-900 sm:text-[22px]"
                                    />
                                    <LightIconButton
                                        onClick={handleCopyUrl}
                                        disabled={!user?.username}
                                        className="mr-1"
                                        title="Copy saved profile URL"
                                        aria-label="Copy saved profile URL"
                                    >
                                        {urlCopied ? <Check size={18} className="text-emerald-800" /> : <Copy size={18} />}
                                    </LightIconButton>
                                </TahoeGlassSurface>
                                <LightButton
                                    onClick={handleUpdateUsername}
                                    disabled={updatingUsername || !usernameAvailable || !customDomain || customDomain === user?.username}
                                    className="h-11 shrink-0 px-6"
                                >
                                    {updatingUsername && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {updatingUsername ? 'Updating...' : 'Update URL'}
                                </LightButton>
                            </div>
                            {customDomain && customDomain !== user?.username && (
                                <div className="mt-2" aria-live="polite">
                                    {checkingUsername ? (
                                        <p className="text-slate-900 text-sm">Checking availability...</p>
                                    ) : usernameAvailable === true ? (
                                        <p className="text-green-800 text-sm">✓ This username is available!</p>
                                    ) : usernameAvailable === false ? (
                                        <p className="text-rose-800 text-sm">✗ {usernameError || 'Username not available'}</p>
                                    ) : null}
                                </div>
                            )}
                            <p className="mt-4 text-slate-900 text-sm">Premium profile access and your nsso.me URL are currently free for the first 1000 users.</p>
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
                            <GlassCard className="overflow-visible p-4 sm:p-6 lg:p-8">
                                <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
                                    <div className="flex min-w-0 items-center gap-1">
                                        <h2 className="text-xl font-bold text-slate-950 sm:text-2xl">Links</h2>
                                        <SectionHelp title="Links">Where can people find you or your work online?</SectionHelp>
                                    </div>
                                    <div className="flex items-center gap-1 sm:gap-2">
                                        {/* Ask Deity Button */}
                                        <AskDeityButton onClick={() => window.dispatchEvent(new CustomEvent('open-deity-chat', {
                                                detail: { initialMessage: "Help me find links to add to my profile..." }
                                            }))} aria-label="Ask Deity about links" />
                                        <LightButton
                                            onClick={() => { void addProfileItem('link', 'top') }}
                                            aria-disabled={addingCollection !== null}
                                            aria-busy={addingCollection === 'link'}
                                            className="min-h-11 shrink-0 px-2 py-1 sm:px-3"
                                            contentClassName="text-xs sm:text-sm"
                                            aria-label="Add link"
                                        >
                                            + Add Link
                                        </LightButton>
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
                                        <p className="text-slate-900 text-center py-8">
                                            No links yet. Choose Add Link to add your first link.
                                        </p>
                                    )}
                                    {links.length > 0 && <LightButton type="button" aria-disabled={addingCollection !== null} aria-busy={addingCollection === 'link'} onClick={() => { void addProfileItem('link', 'bottom') }} className="w-full px-3 py-2" aria-label="Add link at bottom">+ Add Link</LightButton>}
                                </div>
                            </GlassCard>

                            {/* Card 3: Contact Section */}
                            <GlassCard className="p-4 sm:p-8">
                                <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
                                    <div>
                                        <h2 className="text-2xl font-bold text-slate-950">Contact</h2>
                                    </div>
                                    <LightButton
                                        onClick={() => { void addProfileItem('contact', 'top') }}
                                        aria-disabled={addingCollection !== null}
                                        aria-busy={addingCollection === 'contact'}
                                        className="min-h-11 shrink-0 px-3 py-1"
                                        aria-label="Add contact method"
                                    >
                                        + Add Contact
                                    </LightButton>
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
                                        <p className="text-slate-900 text-center py-8">
                                            No contact methods yet. Choose Add Contact to add one.
                                        </p>
                                    )}
                                    {contacts.length > 0 && <LightButton type="button" aria-disabled={addingCollection !== null} aria-busy={addingCollection === 'contact'} onClick={() => { void addProfileItem('contact', 'bottom') }} className="w-full px-3 py-2" aria-label="Add contact method at bottom">+ Add Contact</LightButton>}
                                </div>
                            </GlassCard>

                            {/* Advanced Mode Card (V2) */}
                            {user && <AdvancedModeCard userId={user.id} requestedOffering={searchParams.get('offering')} requestedCreator={searchParams.get('offeringView') === 'creator'} />}
                        </>
                    )
                }
            </div >

        </main >
    )
}

export default function DashboardPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><TahoeGlassSurface variant="pill" tone="dark" className="px-6 py-3" contentClassName="text-xl">Loading...</TahoeGlassSurface></div>}>
            <DashboardContent />
        </Suspense>
    )
}
