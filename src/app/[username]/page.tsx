import { NativeGlassLens } from '@/components/ui/tahoe-glass/NativeGlassLens'
import { loadPublicProfile, loadPublicProfileMetadata, loadPublicProfileViewer } from '@/lib/public-profile'
import { notFound } from 'next/navigation'
import GlassCard from '@/components/profile/ProfileGlassCard'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import SafeExternalLink from '@/components/ui/SafeExternalLink'
import { safeContactUrl, safeWebUrl } from '@/lib/urls'
import { productCheckoutVisibility, productPurchaseButtonLabel } from '@/lib/payments/product-presentation'
import { lightButtonClass } from '@/components/ui/light-button-styles'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import ProfileQRCodeToggle from '@/components/ui/ProfileQRCodeToggle'
import CreateProfileButton from '@/components/ui/CreateProfileButton'
import AddToMyNssoButton from '@/components/ui/AddToMyNssoButton'
import QRScanHandler from '@/components/logic/QRScanHandler'
import type { Metadata } from 'next'
import Header from '@/components/layout/Header'
import ExpandableBio from '@/components/profile/ExpandableBio'
import ExpandableProfileText from '@/components/profile/ExpandableProfileText'
import ExpandableProfileList from '@/components/profile/ExpandableProfileList'
import ProfileTimelineDisclosureGroup from '@/components/profile/ProfileTimelineDisclosureGroup'
import {
    PROFILE_COLLECTION_GRID_CLASS,
    PROFILE_COLLECTION_SECTION_CLASS,
    PROFILE_PAGE_CONTAINER_CLASS,
    PROFILE_PAGE_TOP_CLEARANCE_CLASS,
} from '@/components/profile/profileLayout'
import MetaPixelConsent from '@/components/analytics/MetaPixelConsent'
import { cookies } from 'next/headers'
import { META_PIXEL_CONSENT_COOKIE, parseMetaPixelConsent } from '@/lib/analytics/metaPixel'

interface PageProps {
    params: Promise<{ username: string }>
}

// Generate metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { username } = await params
    const data = await loadPublicProfileMetadata(username)
    if (!data) {
        return { title: 'Profile Not Found | nsso' }
    }
    const { profile } = data

    return {
        title: `${profile?.full_name || username} | nsso`,
        description: profile?.headline || `View ${username}'s profile on nsso`,
        openGraph: {
            title: `${profile?.full_name || username} | nsso`,
            description: profile?.headline || `View ${username}'s profile on nsso`,
            type: 'profile',
        },
    }
}

export default async function PublicProfilePage({ params }: PageProps) {
    const { username } = await params
    const isRaminProfile = username.toLowerCase() === 'ramin'
    const pixelId = isRaminProfile ? process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() : undefined
    const initialPixelConsent = isRaminProfile
        ? parseMetaPixelConsent((await cookies()).get(META_PIXEL_CONSENT_COOKIE)?.value)
        : 'unset'

    const data = await loadPublicProfile(username)
    if (!data) {
        notFound()
    }
    const { user, profile, links, contacts, experiences, qualifications, projects, products } = data
    const { viewer, connectionExists } = await loadPublicProfileViewer(user.id)

    // Check if viewer is the owner
    const isOwner = viewer?.id === user.id
    

    // Helper to render contact item with smart linking
    const renderContactItem = (contact: any) => {
        const method = contact.method === 'Other' ? contact.custom_method_name : contact.method
        const href = safeContactUrl(contact.method, contact.value)
        const isExternal = !!href?.startsWith('https:')

        const content = (
            <div className="text-slate-950 flex flex-wrap items-center justify-center lg:justify-start gap-2 break-words">
                <span className="text-slate-950">{method}:</span>
                <span className={`min-w-0 break-all ${href ? 'hover:underline hover:text-slate-950 transition-colors' : ''}`}>
                    {contact.value}
                </span>
                {isExternal && <ExternalLink size={12} className="text-slate-950" />}
            </div>
        )

        if (href) {
            return (
                <a
                    key={contact.id}
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    className="flex min-h-11 items-center justify-center lg:justify-start hover:text-slate-950 transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950"
                >
                    {content}
                </a>
            )
        }

        return <div key={contact.id}>{content}</div>
    }

    return (
        <>
            <main data-profile-page="public" className={`min-h-screen pb-40 text-slate-950 [text-shadow:none] ${PROFILE_PAGE_TOP_CLEARANCE_CLASS} ${viewer ? 'md:pt-8' : ''}`}>
            {/* Navigation */}
            <div className={viewer ? "md:hidden" : ""}>
                <Header
                    variant={isOwner ? 'owner' : 'default'}
                    username={username}
                />
            </div>

            {/* Logic Handlers */}
            <QRScanHandler key={`${viewer?.id ?? 'guest'}:${user.id}`} scannedUserId={user.id} currentUser={viewer} />

            {/* Profile Content */}
            <div className={`${PROFILE_PAGE_CONTAINER_CLASS} space-y-12 lg:space-y-20`}>
                <nav id="profile-sections" aria-label="Profile sections" className="!mb-8 flex scroll-mt-32 flex-wrap justify-center gap-2 lg:!mb-10 lg:justify-start">
                    <NativeGlassLens as="a" href="#profile-about" className={lightButtonClass}>About</NativeGlassLens>
                    {experiences.length > 0 && <NativeGlassLens as="a" href="#profile-experience" className={lightButtonClass}>Experience</NativeGlassLens>}
                    {qualifications.length > 0 && <NativeGlassLens as="a" href="#profile-qualifications" className={lightButtonClass}>Qualifications</NativeGlassLens>}
                    {projects.length > 0 && <NativeGlassLens as="a" href="#profile-projects" className={lightButtonClass}>Projects</NativeGlassLens>}
                    {products.length > 0 && <NativeGlassLens as="a" href="#profile-products" className={lightButtonClass}>Products & Services</NativeGlassLens>}
                </nav>

                {/* 1. Identity & Resume Section */}
                <div id="profile-about" className="grid scroll-mt-32 grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 !mt-0">

                    {/* Left Column - Primary Identity & Resume */}
                    <div className="space-y-6">
                        {/* Profile Picture */}
                        {profile?.profile_pic_url && (
                            <ProfileQRCodeToggle
                                profilePicUrl={profile.profile_pic_url}
                                username={username}
                                fullName={profile.full_name || 'Profile'}
                            />
                        )}

                        {/* Name and Headline */}
                        <div className="text-center lg:text-left">
                            <h1 className="text-4xl lg:text-5xl font-bold text-slate-950 mb-2">
                                <span className="font-normal">I'm </span>{profile?.full_name || 'Anonymous'}
                            </h1>
                            {profile?.headline && (
                                <p className="text-xl lg:text-2xl text-slate-950 mb-6">
                                    {profile.headline}
                                </p>
                            )}

                            {/* Add to My nsso Button (Visible to everyone except self) */}
                            {user.id !== viewer?.id && (
                                <div className="flex justify-center lg:justify-start">
                                    <AddToMyNssoButton
                                        key={`${viewer?.id ?? 'guest'}:${user.id}`}
                                        profileUserId={user.id}
                                        isLoggedIn={!!viewer}
                                        initialIsConnected={connectionExists}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Mobile Contact Details (Below Headline) */}
                        {contacts.length > 0 && (
                            <div className="block lg:hidden !mt-10 space-y-2">
                                <GlassCard className="p-4 border-white/70">
                                    <div className="space-y-3">
                                        {contacts.map(renderContactItem)}
                                    </div>
                                </GlassCard>
                            </div>
                        )}

                        {/* Bio Card */}
                        {profile?.bio && (
                            <GlassCard className="p-6 !mt-10">
                                <ExpandableBio
                                    key={user.id}
                                    text={profile.bio}
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

                        <ProfileTimelineDisclosureGroup key={JSON.stringify([user.id, experiences.map(item => item.id), qualifications.map(item => item.id)])}>
                        <div className="grid grid-cols-1 items-stretch md:grid-cols-2 gap-10 !mt-10">
                            {/* Experience Section */}
                            {experiences.length > 0 && (
                                <GlassCard className="p-6 h-full">
                                    <section id="profile-experience" className="scroll-mt-32">
                                        <h2 className="text-slate-950 text-sm uppercase tracking-wider mb-6 font-bold">Experiences</h2>
                                        <ExpandableProfileList key={`${user.id}:experiences`} context="Experiences" className="space-y-6">
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
                                        </ExpandableProfileList>
                                    </section>
                                </GlassCard>
                            )}

                            {/* Qualifications Section */}
                            {qualifications.length > 0 && (
                                <GlassCard className="p-6 h-full">
                                    <section id="profile-qualifications" className="scroll-mt-32">
                                        <h2 className="text-slate-950 text-sm uppercase tracking-wider mb-6 font-bold">Qualifications</h2>
                                        <ExpandableProfileList key={`${user.id}:qualifications`} context="Qualifications" className="space-y-6">
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
                                        </ExpandableProfileList>
                                    </section>
                                </GlassCard>
                            )}
                        </div>
                        </ProfileTimelineDisclosureGroup>
                    </div >

                    {/* Right Column - Navigation & Contacts */}
                    <div className="space-y-6 hidden lg:block">
                        {/* Contact Details */}
                        {
                            contacts.length > 0 && (
                                <div className="space-y-2">

                                    {contacts.map(renderContactItem)}
                                </div>
                            )
                        }

                        {/* Link Buttons */}
                        {
                            links.length > 0 && (
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
                            )
                        }
                    </div >
                </div >

                {/* 2. Visual Portfolio (Projects) */}
                {
                    projects.length > 0 && (
                        <section id="profile-projects" className={`${PROFILE_COLLECTION_SECTION_CLASS} scroll-mt-32`}>
                            <h2 className="text-3xl font-bold text-slate-950 mb-8 lg:mb-10">Projects</h2>
                            <div className={PROFILE_COLLECTION_GRID_CLASS}>
                                {projects.map((project) => {
                                    const projectUrl = safeWebUrl(project.project_url)
                                    const Wrapper = projectUrl ? 'a' : 'div'
                                    const wrapperProps = projectUrl ? {
                                        href: projectUrl,
                                        target: '_blank',
                                        rel: 'noopener noreferrer',
                                        className: 'block cursor-pointer rounded-xl focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950'
                                    } : { className: 'block' }

                                    return (
                                        <GlassCard key={project.id} className="p-6 md:p-7 h-full flex flex-col hover:bg-white/25 transition-colors group">
                                            <Wrapper {...wrapperProps}>
                                                <h3 className="text-2xl font-bold text-slate-950 mb-2 flex items-center gap-2">
                                                    {project.project_name}
                                                    {projectUrl && <ExternalLink size={16} className="text-slate-950" />}
                                                </h3>
                                            </Wrapper>
                                            <div className="text-slate-950 text-sm uppercase tracking-widest mb-4 font-bold">{project.contribution}</div>
                                            <ExpandableProfileText text={project.description || ''} context={`project ${project.project_name}`} className="text-slate-950 leading-relaxed mb-6" />
                                            {project.project_photo_url && (
                                                <Wrapper {...wrapperProps} aria-label={projectUrl ? `Open ${project.project_name}` : undefined}>
                                                    <div className="w-full aspect-video rounded-xl bg-white/30 overflow-hidden">
                                                        <img src={project.project_photo_url} alt={project.project_name} className="w-full h-full object-cover" />
                                                    </div>
                                                </Wrapper>
                                            )}
                                        </GlassCard>
                                    )
                                })}
                            </div>
                        </section>
                    )
                }

                {/* 3. Products & Services */}
                {
                    products.length > 0 && (
                        <section id="profile-products" className={`${PROFILE_COLLECTION_SECTION_CLASS} scroll-mt-32`}>
                            <h2 className="text-3xl font-bold text-slate-950 mb-8 lg:mb-10">Products & Services</h2>
                            <div className={PROFILE_COLLECTION_GRID_CLASS}>
                                {products.map(product => {
                                    const checkout = productCheckoutVisibility(product)
                                    const ProductWrapper = product.sales_page_active && product.sales_page_published !== false ? Link : 'div'
                                    const wrapperProps = product.sales_page_active && product.sales_page_published !== false
                                        ? { href: `/products/${product.id}`, className: "block cursor-pointer rounded-xl focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-slate-950" }
                                        : { className: "block" }

                                    return (
                                        <GlassCard key={product.id} className="p-6 h-full flex flex-col group">
                                            {/* Sales-page link (image, name and price only) */}

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
                                            </ProductWrapper>
                                            <ExpandableProfileText text={product.description || ''} context={`product ${product.name}`} className="text-slate-950 text-sm leading-relaxed mb-6" />

                                            {/* Action Buttons (Separate from Link) */}
                                            <div className="space-y-3 mt-auto">
                                                {checkout.purchaseUrls.map(purchaseUrl => (
                                                    <div key={purchaseUrl} className="w-full flex justify-center">
                                                        <NativeGlassLens as="a"
                                                            href={purchaseUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            data-nsso-control="white"
                                                            className={`${lightButtonClass} min-h-11 w-full max-w-[15rem] whitespace-normal [overflow-wrap:anywhere] px-4 py-2 text-center`}
                                                            aria-label={`${productPurchaseButtonLabel(product, purchaseUrl)}: ${product.name}`}
                                                        >
                                                            <span data-light-button-content="true">{productPurchaseButtonLabel(product, purchaseUrl)}</span>
                                                        </NativeGlassLens>
                                                    </div>
                                                ))}
                                                {product.paypal_active && product.payment_config && (
                                                    <div className="w-full flex justify-center">
                                                        <PayPalSmartButton 
                                                            config={product.payment_config}
                                                            price={product.price}
                                                            productName={product.name}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </GlassCard>
                                    )
                                })}
                            </div>
                        </section>
                    )
                }

                {/* Mobile Contact Section REMOVED (Moved to top) */}

                {/* Footer */}
                {/* Footer - Only for non-logged-in users */}
                {/* Footer - Always visible */}
                <div className="pt-12 flex justify-center pb-1">
                    <CreateProfileButton returnTo={`/${encodeURIComponent(username)}`} />
                </div>
                {pixelId && <MetaPixelConsent pixelId={pixelId} initialConsent={initialPixelConsent} showPrivacyChoices={false} />}
            </div >
            </main >
        </>
    )
}
