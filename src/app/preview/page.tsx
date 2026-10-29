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
import { LightButton } from '@/components/ui/LightButton'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import PreviewCheckoutButton from '@/components/ui/PreviewCheckoutButton'
import { productCheckoutVisibility, purchaseButtonLabel } from '@/lib/payments/product-presentation'
import SafeExternalLink from '@/components/ui/SafeExternalLink'
import { safeWebUrl } from '@/lib/urls'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import Header from '@/components/layout/Header'
import {
    PROFILE_COLLECTION_GRID_CLASS,
    PROFILE_COLLECTION_SECTION_CLASS,
    PROFILE_PAGE_CONTAINER_CLASS,
} from '@/components/profile/profileLayout'
import ExpandableBio from '@/components/profile/ExpandableBio'
import { getProfileBioPreview } from '@/components/profile/profileBio'
import { LIGHT_PANEL } from '@/components/ui/light-panel'

export default function PreviewPage() {
    const router = useRouter()
    const { user, loading: accountLoading, error: accountError, refreshUser } = useUser()
    const { profile, links, contacts, experiences, qualifications, projects, products, loading: profileLoading, refreshProfile } = useProfile()

    useEffect(() => {
        if (!accountLoading && !accountError && !user) router.push('/sign-in')
    }, [accountLoading, accountError, user, router])
    const header = !accountLoading && user ? <Header username={user.username || undefined} /> : null

    if (accountLoading || (user && profileLoading) || (!user && !accountError)) {
        return <>{header}
            <main className="min-h-screen flex items-center justify-center">
                <div className="nsso-crystal-reading rounded-3xl px-6 py-4 text-slate-950 text-xl text-center">
                    All of you...<br />all in one place
                </div>
            </main>
        </>
    }

    if (!user || !profile || profile.user_id !== user.id) {
        return <>{header}<main className="flex min-h-screen items-center justify-center px-6 pt-28">
            <section aria-label="Profile preview recovery" className={`${LIGHT_PANEL.surface} ${LIGHT_PANEL.focusWithin} max-w-lg rounded-2xl border border-white/80 p-6 text-center shadow-lg`}>
                <p>Your profile preview could not be loaded. Your editing draft has been kept.</p>
                <GlassButton tone="dark" className="mt-4" onClick={() => { void refreshUser(); void refreshProfile() }}>Retry preview</GlassButton>
            </section>
        </main></>
    }

    return (
        <>{header}<main className="min-h-screen text-slate-950 [text-shadow:none]">
            {/* Profile Content */}
            <div className={`${PROFILE_PAGE_CONTAINER_CLASS} pt-[calc(120px+env(safe-area-inset-top))] md:pt-[120px] pb-16`}>
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
                            <h1 className="text-4xl lg:text-5xl font-bold text-slate-950 mb-2">
                                <span className="font-normal">I'm </span>{profile?.full_name || 'Anonymous'}
                            </h1>
                            {profile?.headline && (
                                <p className="text-xl lg:text-2xl text-slate-950">
                                    {profile.headline}
                                </p>
                            )}
                        </div>

                        {/* Mobile Contact Details (Below Headline) */}
                        {contacts.length > 0 && (
                            <div className="block lg:hidden !mt-10 space-y-2">
                                <GlassCard className="p-4 border-white/70">
                                    <div className="space-y-3">
                                        {contacts.map((contact) => (
                                            <div key={contact.id} className="text-slate-950 text-center flex items-center justify-center gap-2">
                                                <span className="text-slate-950">
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
                                    className="text-slate-950 text-lg leading-relaxed whitespace-pre-wrap"
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
                                        className="block rounded-[40px] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950"
                                    >
                                        <GlassCard className="p-4 hover:scale-[1.02] transition-transform cursor-pointer">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-950 font-medium text-lg">
                                                    {link.link_name || 'Untitled Link'}
                                                </span>
                                                <span className="text-slate-950">→</span>
                                            </div>
                                        </GlassCard>
                                    </SafeExternalLink>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 !mt-24">
                            {/* Experience Section */}
                            {experiences.length > 0 && (
                                <GlassCard className="p-6 h-full">
                                    <div>
                                        <h3 className="text-slate-950 text-sm uppercase tracking-wider mb-6 font-bold">Experiences</h3>
                                        <div className="space-y-6">
                                            {experiences.map(exp => (
                                                <div key={exp.id} className="relative pl-6 border-l border-slate-400/50">
                                                    <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-slate-500/60" />
                                                    <h4 className="text-slate-950 font-semibold text-lg leading-tight mb-1">{exp.job_title}</h4>
                                                    <p className="text-slate-950 font-medium mb-1">{exp.company_name}</p>
                                                    <p className="text-slate-950 text-sm">
                                                        {exp.start_year} to {exp.end_year || 'Present'}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </GlassCard>
                            )}

                            {/* Qualifications Section */}
                            {qualifications.length > 0 && (
                                <GlassCard className="p-6 h-full">
                                    <div>
                                        <h3 className="text-slate-950 text-sm uppercase tracking-wider mb-6 font-bold">Qualifications</h3>
                                        <div className="space-y-6">
                                            {qualifications.map(qual => (
                                                <div key={qual.id} className="relative pl-6 border-l border-slate-400/50">
                                                    <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-slate-500/60" />
                                                    <h4 className="text-slate-950 font-semibold text-lg leading-tight mb-1">{qual.qualification_name}</h4>
                                                    <p className="text-slate-950 font-medium mb-1">{qual.institution}</p>
                                                    <p className="text-slate-950 text-sm">
                                                        {qual.start_year} to {qual.end_year}
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
                                    <div key={contact.id} className="text-slate-950">
                                        <span className="text-slate-950">
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
                                        className="block rounded-[40px] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950"
                                    >
                                        <GlassCard className="p-4 hover:scale-[1.02] transition-transform cursor-pointer">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-950 font-medium text-lg">
                                                    {link.link_name || 'Untitled Link'}
                                                </span>
                                                <span className="text-slate-950">→</span>
                                            </div>
                                        </GlassCard>
                                    </SafeExternalLink>
                                ))}
                            </div>
                        )}

                        {/* Empty State */}
                        {links.length === 0 && contacts.length === 0 && (
                            <GlassCard className="p-6 text-center">
                                <p className="text-slate-950">
                                    No links or contact methods added yet.
                                </p>
                                <LightButton
                                    className="mt-4 px-4 py-2 text-[15px]"
                                    onClick={() => router.push('/dashboard')}
                                >
                                    Add content
                                </LightButton>
                            </GlassCard>
                        )}
                    </div>
                </div>

                {/* 2. Visual Portfolio (Projects) */}
                {projects.length > 0 && (
                    <section className={`${PROFILE_COLLECTION_SECTION_CLASS} mt-24`}>
                        <h2 className="text-3xl font-bold text-slate-950 mb-8 lg:mb-10">Projects</h2>
                        <div className={PROFILE_COLLECTION_GRID_CLASS}>
                            {projects.map((project) => {
                                const projectUrl = safeWebUrl(project.project_url)
                                const Wrapper = projectUrl ? 'a' : 'div'
                                const wrapperProps = projectUrl ? {
                                    href: projectUrl,
                                    target: '_blank',
                                    rel: 'noopener noreferrer',
                                    className: 'block h-full cursor-pointer rounded-xl focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950'
                                } : { className: 'h-full' }

                                return (
                                    <Wrapper key={project.id} {...wrapperProps}>
                                        <GlassCard className="p-6 md:p-7 flex flex-col h-full hover:bg-white/25 transition-colors group">
                                            <h3 className="text-2xl font-bold text-slate-950 mb-2 flex items-center gap-2">
                                                {project.project_name}
                                                {project.project_url && <ExternalLink size={16} className="text-slate-950" />}
                                            </h3>
                                            <div className="text-slate-950 text-sm uppercase tracking-widest mb-4 font-bold">{project.contribution}</div>
                                            <p className="text-slate-950 leading-relaxed mb-6 flex-grow">{project.description}</p>
                                            {project.project_photo_url && (
                                                <div className="w-full aspect-video rounded-xl bg-white/30 overflow-hidden">
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
                        <h2 className="text-3xl font-bold text-slate-950 mb-8 lg:mb-10">Products & Services</h2>
                        <div className={PROFILE_COLLECTION_GRID_CLASS}>
                            {products.map(product => {
                                const checkout = productCheckoutVisibility(product)
                                const ProductWrapper = product.sales_page_active && product.sales_page_published !== false ? Link : 'div'
                                // Fix TS error by explicitly typing or checking
                                const wrapperProps = product.sales_page_active && product.sales_page_published !== false
                                    ? { href: `/products/${product.id}?preview=true`, className: "block flex-grow cursor-pointer rounded-xl focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950" }
                                    : { className: "block flex-grow" }

                                return (
                                    <GlassCard key={product.id} className="p-6 flex flex-col h-full group">
                                        {/* @ts-ignore - Dynamic component props mismatch */}
                                        <ProductWrapper {...wrapperProps}>

                                            {product.image_url && (
                                                <div className="w-full aspect-square rounded-xl bg-white/30 overflow-hidden mb-6">
                                                    <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                </div>
                                            )}
                                            <div className="flex items-start justify-between gap-4 mb-2">
                                                <h3 className="text-xl font-bold text-slate-950">{product.name}</h3>
                                                {product.price !== null && (
                                                    <TahoeGlassSurface chromiumAppearance="light" materialFinish="satin"
                                                        variant="pill"
                                                        tone="dark"
                                                        semanticTint="light"
                                                        semanticTintOpacity={0.18}
                                                        className="px-3 py-1 font-medium text-slate-950"
                                                    >
                                                        {product.price}
                                                    </TahoeGlassSurface>
                                                )}
                                            </div>
                                            <p className="text-slate-950 text-sm leading-relaxed mb-6">{product.description}</p>
                                        </ProductWrapper>

                                        {/* Action Buttons */}
                                        <div className="space-y-3 mt-auto">
                                            {checkout.purchaseUrls.map(purchaseUrl => (
                                                <div key={purchaseUrl} className="w-full flex justify-center">
                                                    <PreviewCheckoutButton className="w-full max-w-[15rem] [&>button]:h-11 [&>button]:whitespace-nowrap">
                                                        {purchaseButtonLabel(purchaseUrl)}
                                                    </PreviewCheckoutButton>
                                                </div>
                                            ))}
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
        </main></>
    )
}
