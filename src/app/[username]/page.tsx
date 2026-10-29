import { loadPublicProfile, loadPublicProfileMetadata, loadPublicProfileViewer } from '@/lib/public-profile'
import { notFound } from 'next/navigation'
import GlassCard from '@/components/profile/ProfileGlassCard'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import SafeExternalLink from '@/components/ui/SafeExternalLink'
import { safeContactUrl, safeWebUrl } from '@/lib/urls'
import { productCheckoutVisibility, purchaseButtonLabel } from '@/lib/payments/product-presentation'
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
import { getProfileBioPreview } from '@/components/profile/profileBio'
import {
    PROFILE_COLLECTION_GRID_CLASS,
    PROFILE_COLLECTION_SECTION_CLASS,
    PROFILE_PAGE_CONTAINER_CLASS,
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
            <div className="text-white flex flex-wrap items-center justify-center lg:justify-start gap-2 break-words">
                <span className="text-white/70">{method}:</span>
                <span className={`min-w-0 break-all ${href ? 'hover:underline hover:text-white transition-colors' : ''}`}>
                    {contact.value}
                </span>
                {isExternal && <ExternalLink size={12} className="opacity-50" />}
            </div>
        )

        if (href) {
            return (
                <a
                    key={contact.id}
                    href={href}
                    target={isExternal ? "_blank" : undefined}
                    rel={isExternal ? "noopener noreferrer" : undefined}
                    className="flex min-h-11 items-center justify-center lg:justify-start hover:opacity-80 transition-opacity"
                >
                    {content}
                </a>
            )
        }

        return <div key={contact.id}>{content}</div>
    }

    return (
        <>
            <main className="min-h-screen pb-40" style={{ paddingTop: '128px' }}>
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
                <nav id="profile-sections" aria-label="Profile sections" className="flex scroll-mt-32 flex-wrap justify-center gap-2 lg:justify-start">
                    <a href="#profile-about" className={lightButtonClass}>About</a>
                    {experiences.length > 0 && <a href="#profile-experience" className={lightButtonClass}>Experience</a>}
                    {qualifications.length > 0 && <a href="#profile-qualifications" className={lightButtonClass}>Qualifications</a>}
                    {projects.length > 0 && <a href="#profile-projects" className={lightButtonClass}>Projects</a>}
                    {products.length > 0 && <a href="#profile-products" className={lightButtonClass}>Products & Services</a>}
                </nav>

                {/* 1. Identity & Resume Section */}
                <div id="profile-about" className="grid scroll-mt-32 grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

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
                            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2">
                                <span className="font-normal">I'm </span>{profile?.full_name || 'Anonymous'}
                            </h1>
                            {profile?.headline && (
                                <p className="text-xl lg:text-2xl text-white/70 mb-6">
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
                                <GlassCard className="p-4 bg-white/5 border-white/10">
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
                                    text={profile.bio}
                                    collapsedText={getProfileBioPreview(username, profile.bio)}
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 !mt-10">
                            {/* Experience Section */}
                            {experiences.length > 0 && (
                                <GlassCard className="p-6 h-full">
                                    <section id="profile-experience" className="scroll-mt-32">
                                        <h2 className="text-white/70 text-sm uppercase tracking-wider mb-6 font-bold">Experiences</h2>
                                        <div className="space-y-6">
                                            {experiences.map(exp => (
                                                <div key={exp.id} className="relative pl-6 border-l border-white/10">
                                                    <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-white/20" />
                                                    <h4 className="text-white font-semibold text-lg leading-tight mb-1">{exp.job_title}</h4>
                                                    <p className="text-white/70 font-medium mb-1">{exp.company_name}</p>
                                                    <p className="text-white/65 text-sm">
                                                        {exp.start_year} to {exp.end_year || 'Present'}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        <a href="#profile-sections" className="mt-4 inline-flex min-h-11 items-center text-sm text-cyan-200 underline">Back to sections ↑</a>
                                    </section>
                                </GlassCard>
                            )}

                            {/* Qualifications Section */}
                            {qualifications.length > 0 && (
                                <GlassCard className="p-6 h-full">
                                    <section id="profile-qualifications" className="scroll-mt-32">
                                        <h2 className="text-white/70 text-sm uppercase tracking-wider mb-6 font-bold">Qualifications</h2>
                                        <div className="space-y-6">
                                            {qualifications.map(qual => (
                                                <div key={qual.id} className="relative pl-6 border-l border-white/10">
                                                    <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-white/20" />
                                                    <h4 className="text-white font-semibold text-lg leading-tight mb-1">{qual.qualification_name}</h4>
                                                    <p className="text-white/70 font-medium mb-1">{qual.institution}</p>
                                                    <p className="text-white/65 text-sm">
                                                        {qual.start_year} to {qual.end_year}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                        <a href="#profile-sections" className="mt-4 inline-flex min-h-11 items-center text-sm text-cyan-200 underline">Back to sections ↑</a>
                                    </section>
                                </GlassCard>
                            )}
                        </div>
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
                            )
                        }
                    </div >
                </div >

                {/* 2. Visual Portfolio (Projects) */}
                {
                    projects.length > 0 && (
                        <section id="profile-projects" className={`${PROFILE_COLLECTION_SECTION_CLASS} scroll-mt-32`}>
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
                            <a href="#profile-sections" className="mt-4 inline-flex min-h-11 items-center text-sm text-cyan-200 underline">Back to sections ↑</a>
                        </section>
                    )
                }

                {/* 3. Products & Services */}
                {
                    products.length > 0 && (
                        <section id="profile-products" className={`${PROFILE_COLLECTION_SECTION_CLASS} scroll-mt-32`}>
                            <h2 className="text-3xl font-bold text-white mb-8 lg:mb-10">Products & Services</h2>
                            <div className={PROFILE_COLLECTION_GRID_CLASS}>
                                {products.map(product => {
                                    const checkout = productCheckoutVisibility(product)
                                    const ProductWrapper = product.sales_page_active && product.sales_page_published !== false ? Link : 'div'
                                    const wrapperProps = product.sales_page_active && product.sales_page_published !== false
                                        ? { href: `/products/${product.id}`, className: "block flex-grow cursor-pointer transition-opacity hover:opacity-80" }
                                        : { className: "block flex-grow" }

                                    return (
                                        <GlassCard key={product.id} className="p-6 flex flex-col h-full group">
                                            {/* Clickable Area (Image, Name, Price, Desc) */}

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

                                            {/* Action Buttons (Separate from Link) */}
                                            <div className="space-y-3 mt-auto">
                                                {checkout.purchaseUrls.map(purchaseUrl => (
                                                    <div key={purchaseUrl} className="w-full flex justify-center">
                                                        <a
                                                            href={purchaseUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            data-nsso-control="white"
                                                            className={`${lightButtonClass} h-11 w-full max-w-[15rem] whitespace-nowrap`}
                                                            aria-label={`${purchaseButtonLabel(purchaseUrl)}: ${product.name}`}
                                                        >
                                                            <span data-light-button-content="true">{purchaseButtonLabel(purchaseUrl)}</span>
                                                        </a>
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
                            <a href="#profile-sections" className="mt-4 inline-flex min-h-11 items-center text-sm text-cyan-200 underline">Back to sections ↑</a>
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
                {pixelId && <MetaPixelConsent pixelId={pixelId} initialConsent={initialPixelConsent} />}
            </div >
            </main >
        </>
    )
}
