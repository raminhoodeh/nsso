'use client'

import { useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import ShinyLink from '@/components/ui/ShinyLink'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import ProfileQRCodeToggle from '@/components/ui/ProfileQRCodeToggle'
import CreateProfileButton from '@/components/ui/CreateProfileButton'
import AddToMyNssoButton from '@/components/ui/AddToMyNssoButton'


// INROS Lens Definitions
const INROS_DATA = {
    default: {
        id: 'default',
        label: 'Default',
        headline: "AI Builder | Fiction Author",
        bio: "nsso stands for new sovereign self online.\n\nAt nsso, we want to see you recognise your uniqueness, value, and inherent beauty, so you can unlock the opportunities you deserve. That’s why our mission is to evolve your identity alongside the world, by providing you with the most beautiful way to present yourself online.\n\nWe call this: future-proofing yourself. We future-proof you through a carefully designed profile that seamlessly integrates both your personal and professional identity in one place.",
        order: { top: 1, projects: 2, products: 3 },
        focus: null,
        ctaHighlights: ["cta-hero"]
    },
    corporate: {
        id: 'corporate',
        label: 'Recruiter',
        headline: "Senior Product Manager",
        bio: "Looking for a seasoned Product Leader?\n\nI am an experienced Product Manager specializing in high-growth SaaS and consumer tech. I have a proven track record of leading cross-functional teams to deliver scalable, user-centric solutions across both corporate and startup environments.",
        order: { top: 1, projects: 2, products: 3 },
        focus: "section-experiences",
        ctaHighlights: ["cta-hero"]
    },
    creative: {
        id: 'creative',
        label: 'Collaborator',
        headline: "Digital Creator & Designer",
        bio: "I build things that feel physical and alive.\n\nObsessed with 'Liquid Glass' aesthetics and the intersection of art and technology, I design immersive web experiences. Have a look at my projects below to see how I bring complex ideas to life through software.",
        order: { top: 1, projects: 2, products: 3 },
        focus: "section-projects",
        ctaHighlights: ["cta-hero"]
    },
    commerce: {
        id: 'commerce',
        label: 'Client',
        headline: "Consultant & Strategist",
        bio: "Let's build something incredible together.\n\nI help founders and startups clarify their vision, optimize their product strategy, and design interfaces that convert. You can browse my available services and products below, or book a direct call to discuss your next big idea.",
        order: { top: 1, products: 2, projects: 3 },
        focus: "section-products",
        ctaHighlights: ["cta-products"]
    }
}

type LensType = keyof typeof INROS_DATA

export default function InrosProfileCanvas({
    user,
    viewer,
    profile: initialProfile,
    links,
    contacts,
    experiences,
    qualifications,
    projects,
    products,
    connectionExists,
    isOwner,
    isPlatformOwner,
    introsBios,
}: any) {
    const [currentLens, setCurrentLens] = useState<LensType>('default')
    const [bioFading, setBioFading] = useState(false)
    const activeData = INROS_DATA[currentLens]

    // Map lens keys to intros_bios keys
    const lensToIntroKey: Record<LensType, keyof typeof introsBios | null> = {
        default: null,
        corporate: 'recruiter',
        creative: 'collaborator',
        commerce: 'client',
    }

    // Resolve bio: use DB-generated intro if available, else fall back to INROS_DATA hardcoded
    const resolvedBio = (() => {
        const introKey = lensToIntroKey[currentLens]
        if (introKey && introsBios?.[introKey]) return introsBios[introKey]
        return activeData.bio
    })()

    const handleLensSwitch = (lens: LensType) => {
        if (lens === currentLens) return
        setBioFading(true)
        setTimeout(() => {
            setCurrentLens(lens)
            setBioFading(false)
        }, 150)
    }

    const renderContactItem = (contact: any) => {
        const method = contact.method === 'Other' ? contact.custom_method_name : contact.method
        let href = ''
        let isExternal = false

        switch (contact.method.toLowerCase()) {
            case 'email':
                href = `mailto:${contact.value}`
                break
            case 'whatsapp':
                href = `https://wa.me/${contact.value.replace(/\D/g, '')}`
                isExternal = true
                break
            case 'telegram':
                href = `https://t.me/${contact.value.replace('@', '')}`
                isExternal = true
                break
        }

        const content = (
            <div className="text-white flex items-center justify-center lg:justify-start gap-2">
                <span className="text-white/70">{method}:</span>
                <span className={href ? "hover:underline hover:text-white transition-colors" : ""}>
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
                    className="block hover:opacity-80 transition-opacity"
                >
                    {content}
                </a>
            )
        }

        return <div key={contact.id}>{content}</div>
    }

    const getFocusStyles = (sectionId: string) => {
        if (activeData.focus === sectionId) {
            return "scale-[1.02] shadow-[0_0_40px_rgba(90,200,245,0.2)] z-10 transition-all duration-500 ring-2 ring-[#5ac8f5]/50"
        }
        return "transition-all duration-500 opacity-90"
    }

    return (
        <div className="px-6 lg:px-10 max-w-[1800px] mx-auto flex flex-col gap-12">

            {/* Top Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12" style={{ order: activeData.order.top }}>
                {/* Left Column */}
                <div className="space-y-6">
                    {/* Profile Picture */}
                    {initialProfile?.profile_pic_url && (
                        <div className={`transition-all duration-500 ${activeData.focus === 'profile-hero' ? getFocusStyles('profile-hero') : ''}`}>
                            <ProfileQRCodeToggle
                                profilePicUrl={initialProfile.profile_pic_url}
                                username={user.username}
                                fullName={initialProfile.full_name || 'Profile'}
                            />
                        </div>
                    )}

                    {/* Name and Headline */}
                    <div className={`text-center lg:text-left ${activeData.focus === 'profile-hero' ? getFocusStyles('profile-hero') : ''}`}>
                        <h1 className="text-4xl lg:text-5xl font-bold text-white mb-2">
                            <span className="font-normal">I'm </span>{initialProfile?.full_name || 'Anonymous'}
                        </h1>
                        <p className="text-xl lg:text-2xl text-[#5ac8f5] font-medium mb-6">
                            {initialProfile?.headline || ''}
                        </p>

                        {/* Add to My nsso Button */}
                        {user.id !== viewer?.id && (
                            <div className="flex justify-center lg:justify-start">
                                <div className={activeData.ctaHighlights.includes('cta-hero') ? 'ring-2 ring-[#5ac8f5] rounded-full shadow-[0_0_20px_rgba(90,200,245,0.4)]' : ''}>
                                    <AddToMyNssoButton
                                        profileUserId={user.id}
                                        isLoggedIn={!!viewer}
                                        initialIsConnected={connectionExists}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mobile Contact Details */}
                    {contacts.length > 0 && (
                        <div className="block lg:hidden !mt-10 space-y-2">
                            <GlassCard className="p-4 bg-white/5 border-white/10">
                                <div className="space-y-3">
                                    {contacts.map(renderContactItem)}
                                </div>
                            </GlassCard>
                        </div>
                    )}

                    {/* Bio Card — chips live inside the card */}
                    <GlassCard className={`p-6 !mt-10 ${activeData.focus === 'profile-hero' ? getFocusStyles('profile-hero') : ''}`}>
                        {/* Chip row */}
                        <div className="flex flex-wrap gap-2 mb-5">
                            {(Object.keys(INROS_DATA) as LensType[]).map((lensId) => {
                                const isActive = currentLens === lensId
                                return (
                                    <button
                                        key={lensId}
                                        onClick={() => handleLensSwitch(lensId)}
                                        aria-pressed={isActive}
                                        className="relative flex items-center justify-center px-4 py-1.5 rounded-full text-[13px] tracking-wide transition-all duration-200 ease-out select-none overflow-hidden"
                                        style={{
                                            background: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                                            border: isActive ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.08)',
                                            backdropFilter: isActive ? 'blur(8px)' : 'none',
                                            WebkitBackdropFilter: isActive ? 'blur(8px)' : 'none',
                                            boxShadow: isActive ? 'inset 1px 1px 1px rgba(255,255,255,0.18), 0 2px 8px rgba(0,0,0,0.15)' : 'none',
                                            color: isActive ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.4)',
                                            fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                                            fontWeight: isActive ? 590 : 400,
                                        }}
                                    >
                                        {/* Specular highlight on active chip */}
                                        {isActive && (
                                            <span
                                                aria-hidden="true"
                                                className="absolute inset-0 rounded-full pointer-events-none"
                                                style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, transparent 60%)' }}
                                            />
                                        )}
                                        <span className="relative z-10">{INROS_DATA[lensId].label}</span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Bio text — cross-fades on lens switch */}
                        <p
                            className="text-white/90 text-lg leading-relaxed whitespace-pre-wrap"
                            style={{ opacity: bioFading ? 0 : 1, transition: 'opacity 150ms ease' }}
                        >
                            {resolvedBio}
                        </p>
                    </GlassCard>

                    {/* Mobile Links */}
                    {links.length > 0 && (
                        <div className={`space-y-3 block lg:hidden !mt-10 ${getFocusStyles('section-links')}`}>
                            {links.map((link: any) => (
                                <a key={link.id} href={link.link_url} target="_blank" rel="noopener noreferrer" className="block">
                                    <GlassCard className="p-4 hover:scale-[1.02] transition-transform cursor-pointer">
                                        <div className="flex items-center justify-between">
                                            <span className="text-white font-medium text-lg">{link.link_name || 'Untitled Link'}</span>
                                            <span className="text-white/50">→</span>
                                        </div>
                                    </GlassCard>
                                </a>
                            ))}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 !mt-10">
                        {/* Experiences */}
                        {experiences.length > 0 && (
                            <div className={getFocusStyles('section-experiences')}>
                                <GlassCard className="p-6 h-full max-h-[85vh]">
                                    <div className="h-full overflow-y-auto custom-scrollbar pr-2">
                                        <h3 className="text-white/50 text-sm uppercase tracking-wider mb-6 font-bold">Experiences</h3>
                                        <div className="space-y-6">
                                            {experiences.map((exp: any) => (
                                                <div key={exp.id} className="relative pl-6 border-l border-white/10">
                                                    <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-white/20" />
                                                    <h4 className="text-white font-semibold text-lg leading-tight mb-1">{exp.job_title}</h4>
                                                    <p className="text-white/70 font-medium mb-1">{exp.company_name}</p>
                                                    <p className="text-white/40 text-sm">{exp.start_year} — {exp.end_year || 'Present'}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </GlassCard>
                            </div>
                        )}

                        {/* Qualifications */}
                        {qualifications.length > 0 && (
                            <div className={getFocusStyles('section-qualifications')}>
                                <GlassCard className="p-6 h-full max-h-[85vh]">
                                    <div className="h-full overflow-y-auto custom-scrollbar pr-2">
                                        <h3 className="text-white/50 text-sm uppercase tracking-wider mb-6 font-bold">Qualifications</h3>
                                        <div className="space-y-6">
                                            {qualifications.map((qual: any) => (
                                                <div key={qual.id} className="relative pl-6 border-l border-white/10">
                                                    <div className="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-white/20" />
                                                    <h4 className="text-white font-semibold text-lg leading-tight mb-1">{qual.qualification_name}</h4>
                                                    <p className="text-white/70 font-medium mb-1">{qual.institution}</p>
                                                    <p className="text-white/40 text-sm">{qual.start_year} — {qual.end_year}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </GlassCard>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column - Navigation & Contacts */}
                <div className={`space-y-6 hidden lg:block ${getFocusStyles('section-links')}`}>
                    {contacts.length > 0 && (
                        <div className="space-y-2">
                            {contacts.map(renderContactItem)}
                        </div>
                    )}
                    {links.length > 0 && (
                        <div className="space-y-3">
                            {links.map((link: any) => (
                                <a key={link.id} href={link.link_url} target="_blank" rel="noopener noreferrer" className="block">
                                    <GlassCard className="p-4 hover:scale-[1.02] transition-transform cursor-pointer">
                                        <div className="flex items-center justify-between">
                                            <span className="text-white font-medium text-lg">{link.link_name || 'Untitled Link'}</span>
                                            <span className="text-white/50">→</span>
                                        </div>
                                    </GlassCard>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Projects Section */}
            {projects.length > 0 && (
                <section className={getFocusStyles('section-projects')} style={{ order: activeData.order.projects }}>
                    <h2 className="text-3xl font-bold text-white mb-8">Projects</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {projects.map((project: any) => {
                            const Wrapper = project.project_url ? 'a' : 'div'
                            const wrapperProps = project.project_url ? {
                                href: project.project_url,
                                target: '_blank',
                                rel: 'noopener noreferrer',
                                className: 'block h-full cursor-pointer transition-opacity hover:opacity-80'
                            } : { className: 'h-full' }

                            return (
                                <Wrapper key={project.id} {...wrapperProps}>
                                    <GlassCard className="p-6 md:p-8 flex flex-col h-full hover:bg-white/10 transition-colors group">
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

            {/* Products & Services Section */}
            {products.length > 0 && (
                <section className={getFocusStyles('section-products')} style={{ order: activeData.order.products }}>
                    <h2 className="text-3xl font-bold text-white mb-8">Products & Services</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {products.map((product: any) => {
                            const ProductWrapper = product.sales_page_active ? Link : 'div'
                            const wrapperProps = product.sales_page_active
                                ? { href: `/products/${product.id}`, className: "block flex-grow cursor-pointer transition-opacity hover:opacity-80" }
                                : { className: "block flex-grow" }

                            return (
                                <GlassCard key={product.id} className="p-6 flex flex-col h-full group">
                                    {/* @ts-ignore */}
                                    <ProductWrapper {...wrapperProps}>
                                        {product.image_url && (
                                            <div className="w-full aspect-square rounded-xl bg-black/20 overflow-hidden mb-6">
                                                <img src={product.image_url} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                            </div>
                                        )}
                                        <div className="flex items-start justify-between gap-4 mb-2">
                                            <h3 className="text-xl font-bold text-white">{product.name}</h3>
                                            {product.price !== null && (
                                                <div className="text-white font-medium bg-white/10 px-3 py-1 rounded-full">
                                                    {product.price}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-white/60 text-sm leading-relaxed mb-6">{product.description}</p>
                                    </ProductWrapper>

                                    <div className="space-y-3 mt-auto">
                                        {product.purchase_link_active && product.purchase_link && (
                                            <div className={`w-full flex justify-center ${activeData.ctaHighlights.includes('cta-products') ? 'ring-2 ring-[#5ac8f5] rounded-full shadow-[0_0_20px_rgba(90,200,245,0.4)]' : ''}`}>
                                                <ShinyLink href={product.purchase_link} target="_blank" rel="noopener noreferrer" className="w-[11.625rem]">
                                                    Link to Purchase
                                                </ShinyLink>
                                            </div>
                                        )}
                                        {product.paypal_active && product.paypal_html && (
                                            <div className={`w-full flex justify-center ${activeData.ctaHighlights.includes('cta-products') ? 'ring-2 ring-[#5ac8f5] rounded-xl shadow-[0_0_20px_rgba(90,200,245,0.4)]' : ''}`}>
                                                <PayPalSmartButton 
                                                    html={product.paypal_html} 
                                                    isPlatformOwner={isPlatformOwner} 
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
            )}

            {/* Footer */}
            <div className="pt-12 flex justify-center pb-1" style={{ order: 99 }}>
                <CreateProfileButton />
            </div>
        </div>
    )
}
