'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import ProfileQRCodeToggle from '@/components/ui/ProfileQRCodeToggle'
import CreateProfileButton from '@/components/ui/CreateProfileButton'
import { useUser } from '@/components/providers/UserProvider'
import { useProfile } from '@/components/providers/ProfileProvider'
import ProfileSaveStatus from '@/components/profile/ProfileSaveStatus'
import GlassCard from '@/components/profile/ProfileGlassCard'
import GlassButton from '@/components/ui/GlassButton'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import { productCheckoutVisibility } from '@/lib/payments/product-presentation'
import SafeExternalLink from '@/components/ui/SafeExternalLink'
import { safeWebUrl } from '@/lib/urls'
import { useToast } from '@/components/ui/Toast'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import {
    PROFILE_COLLECTION_GRID_CLASS,
    PROFILE_COLLECTION_SECTION_CLASS,
    PROFILE_PAGE_CONTAINER_CLASS,
} from '@/components/profile/profileLayout'
import ExpandableBio from '@/components/profile/ExpandableBio'
import { getProfileBioPreview } from '@/components/profile/profileBio'

export default function PreviewPage() {
    const router = useRouter()
    const { showToast } = useToast()
    const { user, loading: accountLoading, error: accountError, refreshUser } = useUser()
    const { profile, links, contacts, experiences, qualifications, projects, products, loading: profileLoading, refreshProfile } = useProfile()

    useEffect(() => {
        if (!accountLoading && !accountError && !user) router.push('/sign-in')
    }, [accountLoading, accountError, user, router])

    const copyProfileUrl = async () => {
        if (!user?.username) return
        try {
            await navigator.clipboard.writeText(`${window.location.origin}/${user.username}`)
            showToast('Profile URL copied!', 'success')
        } catch {
            showToast('Your profile URL could not be copied. Please try again.', 'error')
        }
    }

    if (accountLoading || (user && profileLoading) || (!user && !accountError)) {
        return (
            <main className="min-h-screen flex items-center justify-center">
                <div className="text-white text-xl text-center">
                    All of you...<br />all in one place
                </div>
            </main>
        )
    }

    if (!user || !profile || profile.user_id !== user.id) {
        return <main className="flex min-h-screen items-center justify-center px-6">
            <GlassCard className="max-w-lg p-6 text-center text-white">
                <p>Your profile preview could not be loaded. Your editing draft has been kept.</p>
                <GlassButton className="mt-4" onClick={() => { void refreshUser(); void refreshProfile() }}>Retry preview</GlassButton>
            </GlassCard>
        </main>
    }

    return (
        <main className="min-h-screen">
            {/* Navigation Bar */}
            <TahoeGlassSurface
                as="nav"
                variant="menu"
                radius="0 0 24px 24px"
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.025}
                className="fixed top-0 left-0 right-0 z-50 px-6 lg:px-10 md:hidden"
                contentClassName="mx-auto flex h-[72px] max-w-[1800px] items-center justify-between"
            >
                    <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push('/dashboard')}
                    >
                        ← Edit Profile
                    </GlassButton>
                    <GlassButton
                        variant="ghost"
                        size="sm"
                        onClick={copyProfileUrl}
                    >
                        Copy page URL
                    </GlassButton>
            </TahoeGlassSurface>

            {/* Profile Content */}
            <div className={`${PROFILE_PAGE_CONTAINER_CLASS} pt-[120px] pb-40`}>
                <p role="status" className="mb-4 rounded-xl bg-black/20 p-3 text-sm text-white/80">Profile preview — checkout is disabled. Unsaved changes are not yet public.</p>
                <ProfileSaveStatus />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

                    {/* Left Column - Primary Identity */}
                    <div className="space-y-6">
                        {/* Profile Picture */}
                        {profile?.profile_pic_url && user?.username && (
                            <ProfileQRCodeToggle
                                profilePicUrl={profile.profile_pic_url}
                                username={user.username}
                                fullName={profile.full_name || 'Profile'}
                            />
                        )}

                        {/* Name and Headline */}
                        <div className="text-center lg:text-left">
                            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2">
                                <span className="font-normal">I'm </span>{profile?.full_name || 'Anonymous'}
                            </h1>
                            {profile?.headline && (
                                <p className="text-xl lg:text-2xl text-white/70">
                                    {profile.headline}
                                </p>
                            )}
                        </div>

                        {/* Mobile Contact Details (Below Headline) */}
                        {contacts.length > 0 && (
                            <div className="block lg:hidden !mt-10 space-y-2">
                                <GlassCard className="p-4 bg-white/5 border-white/10">
                                    <div className="space-y-3">
                                        {contacts.map((contact) => (
                                            <div key={contact.id} className="text-white text-center flex items-center justify-center gap-2">
                                                <span className="text-white/70">
                                                    {contact.method === 'Other' ? contact.custom_method_name : contact.method}:
                                                </span>{' '}
                                                <span>{contact.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </GlassCard>
                            </div>
                        )}

                        {/* Bio Card */}
                        {profile?.bio && (
                            <GlassCard className="p-6 !mt-10">
                                <ExpandableBio
                                    text={profile.bio}
                                    collapsedText={getProfileBioPreview(user?.username, profile.bio)}
                                    className="text-white/90 text-lg leading-relaxed whitespace-pre-wrap"
                                />
                            </GlassCard>
                        )}

                        {/* Mobile Links Section */}
                        {links.length > 0 && (
                            <div className="space-y-3 block lg:hidden !mt-10">

                                {links.map((link) => (
                                    <SafeExternalLink
                                        key={link.id}
                                        href={link.link_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                    >
                                        <GlassCard className="p-4 hover:scale-[1.02] transition-transform cursor-pointer">
                                            <div className="flex items-center justify-between">
                                                <span className="text-white font-medium text-lg">
                                                    {link.link_name || 'Untitled Link'}
                                                </span>
                                                <span className="text-white/50">→</span>
                                            </div>
                                        </GlassCard>
                                    </SafeExternalLink>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 !mt-24">
                            {/* Experience Section */}
                            {experiences.length > 0 && (
                                <GlassCard className="p-6 h-full max-h-[85vh]">
                                    <div className="h-full overflow-y-auto custom-scrollbar pr-2">
                                        <h3 className="text-white/50 text-sm uppercase tracking-wider mb-6 font-bold">Experiences</h3>
                                        <div className="space-y-6">
                                            {experiences.map(exp => (
                                                <div key={exp.id} className="relative pl-6 border-l border-white/10">
                                                    <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-white/20" />
                                                    <h4 className="text-white font-semibold text-lg leading-tight mb-1">{exp.job_title}</h4>
                                                    <p className="text-white/70 font-medium mb-1">{exp.company_name}</p>
                                                    <p className="text-white/40 text-sm">
                                                        {exp.start_year} — {exp.end_year || 'Present'}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </GlassCard>
                            )}

                            {/* Qualifications Section */}
                            {qualifications.length > 0 && (
                                <GlassCard className="p-6 h-full max-h-[85vh]">
                                    <div className="h-full overflow-y-auto custom-scrollbar pr-2">
                                        <h3 className="text-white/50 text-sm uppercase tracking-wider mb-6 font-bold">Qualifications</h3>
                                        <div className="space-y-6">
                                            {qualifications.map(qual => (
                                                <div key={qual.id} className="relative pl-6 border-l border-white/10">
                                                    <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-white/20" />
                                                    <h4 className="text-white font-semibold text-lg leading-tight mb-1">{qual.qualification_name}</h4>
                                                    <p className="text-white/70 font-medium mb-1">{qual.institution}</p>
                                                    <p className="text-white/40 text-sm">
                                                        {qual.start_year} — {qual.end_year}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </GlassCard>
                            )}
                        </div>
                    </div>

                    {/* Right Column - Connections & Links */}
                    <div className="space-y-6 hidden lg:block">
                        {/* Contact Details */}
                        {contacts.length > 0 && (
                            <div className="space-y-2">

                                {contacts.map((contact) => (
                                    <div key={contact.id} className="text-white">
                                        <span className="text-white/70">
                                            {contact.method === 'Other' ? contact.custom_method_name : contact.method}:
                                        </span>{' '}
                                        <span>{contact.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Link Buttons */}
                        {links.length > 0 && (
                            <div className="space-y-3">

                                {links.map((link) => (
                                    <SafeExternalLink
                                        key={link.id}
                                        href={link.link_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block"
                                    >
                                        <GlassCard className="p-4 hover:scale-[1.02] transition-transform cursor-pointer">
                                            <div className="flex items-center justify-between">
                                                <span className="text-white font-medium text-lg">
                                                    {link.link_name || 'Untitled Link'}
                                                </span>
                                                <span className="text-white/50">→</span>
                                            </div>
                                        </GlassCard>
                                    </SafeExternalLink>
                                ))}
                            </div>
                        )}

                        {/* Empty State */}
                        {links.length === 0 && contacts.length === 0 && (
                            <GlassCard className="p-6 text-center">
                                <p className="text-white/50">
                                    No links or contact methods added yet.
                                </p>
                                <GlassButton
                                    variant="secondary"
                                    size="sm"
                                    className="mt-4"
                                    onClick={() => router.push('/dashboard')}
                                >
                                    Add content
                                </GlassButton>
                            </GlassCard>
                        )}
                    </div>
                </div>

                {/* 2. Visual Portfolio (Projects) */}
                {projects.length > 0 && (
                    <section className={`${PROFILE_COLLECTION_SECTION_CLASS} mt-24`}>
                        <h2 className="text-3xl font-bold text-white mb-8 lg:mb-10">Projects</h2>
                        <div className={PROFILE_COLLECTION_GRID_CLASS}>
                            {projects.map((project) => {
                                const projectUrl = safeWebUrl(project.project_url)
                                const Wrapper = projectUrl ? 'a' : 'div'
                                const wrapperProps = projectUrl ? {
                                    href: projectUrl,
                                    target: '_blank',
                                    rel: 'noopener noreferrer',
                                    className: 'block h-full cursor-pointer transition-opacity hover:opacity-80'
                                } : { className: 'h-full' }

                                return (
                                    <Wrapper key={project.id} {...wrapperProps}>
                                        <GlassCard className="p-6 md:p-7 flex flex-col h-full hover:bg-white/10 transition-colors group">
                                            <h3 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                                                {project.project_name}
                                                {project.project_url && <ExternalLink size={16} className="opacity-50" />}
                                            </h3>
                                            <div className="text-white/50 text-sm uppercase tracking-widest mb-4 font-bold">{project.contribution}</div>
                                            <p className="text-white/70 leading-relaxed mb-6 flex-grow">{project.description}</p>
                                            {project.project_photo_url && (
                                                <div className="w-full aspect-video rounded-xl bg-black/20 overflow-hidden">
                                                    <img src={project.project_photo_url} alt={project.project_name} className="w-full h-full object-cover" />
                                                </div>
                                            )}
                                        </GlassCard>
                                    </Wrapper>
                                )
                            })}
                        </div>
                    </section>
                )}

                {/* 3. Products & Services */}
                {products.length > 0 && (
                    <section className={`${PROFILE_COLLECTION_SECTION_CLASS} mt-24`}>
                        <h2 className="text-3xl font-bold text-white mb-8 lg:mb-10">Products & Services</h2>
                        <div className={PROFILE_COLLECTION_GRID_CLASS}>
                            {products.map(product => {
                                const checkout = productCheckoutVisibility(product)
                                const ProductWrapper = product.sales_page_active && product.sales_page_published !== false ? Link : 'div'
                                // Fix TS error by explicitly typing or checking
                                const wrapperProps = product.sales_page_active && product.sales_page_published !== false
                                    ? { href: `/products/${product.id}?preview=true`, className: "block flex-grow cursor-pointer transition-opacity hover:opacity-80" }
                                    : { className: "block flex-grow" }

                                return (
                                    <GlassCard key={product.id} className="p-6 flex flex-col h-full group">
                                        {/* @ts-ignore - Dynamic component props mismatch */}
                                        <ProductWrapper {...wrapperProps}>

                                            {product.image_url && (
                                                <div className="w-full aspect-square rounded-xl bg-black/20 overflow-hidden mb-6">
                                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                </div>
                                            )}
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <h3 className="text-xl font-bold text-white">{product.name}</h3>
                                                {product.price !== null && (
                                                    <TahoeGlassSurface
                                                        variant="pill"
                                                        tone="light"
                                                        semanticTint="dark"
                                                        semanticTintOpacity={0.18}
                                                        className="px-3 py-1 font-medium text-white"
                                                    >
                                                        {product.price}
                                                    </TahoeGlassSurface>
                                                )}
                                            </div>
                                            <p className="text-white/60 text-sm leading-relaxed mb-6">{product.description}</p>
                                        </ProductWrapper>

                                        {/* Action Buttons */}
                                        <div className="space-y-3 mt-auto">
                                            {checkout.purchaseUrl && (
                                                <div className="w-full flex justify-center">
                                                    <GlassButton disabled className="w-[11.625rem]">
                                                        Link to Purchase
                                                    </GlassButton>
                                                </div>
                                            )}
                                            {checkout.paypal && product.payment_config && (
                                                <div className="w-full flex justify-center">
                                                    <PayPalSmartButton config={product.payment_config} preview />
                                                </div>
                                            )}
                                        </div>
                                    </GlassCard>
                                )
                            })}
                        </div>
                    </section>
                )}


                <div className="pt-12 flex justify-center pb-1">
                    <CreateProfileButton />
                </div>

            </div>
        </main>
    )
}
