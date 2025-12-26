import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import GlassCard from '@/components/ui/GlassCard'
import PayPalSmartButton from '@/components/ui/PayPalSmartButton'
import ShinyLink from '@/components/ui/ShinyLink'
import Link from 'next/link'
import CreateProfileButton from '@/components/ui/CreateProfileButton'
import type { Metadata } from 'next'

interface PageProps {
    params: Promise<{ username: string }>
}

// Generate metadata for SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { username } = await params
    const supabase = await createClient()

    const { data: user } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single()

    if (!user) {
        return { title: 'Profile Not Found | nsso' }
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, headline')
        .eq('user_id', user.id)
        .single()

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
    const supabase = await createClient()

    // Find user by username
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single()

    if (userError || !user) {
        notFound()
    }

    // Load profile, links, contacts, and V2 data
    const [profileResult, linksResult, contactsResult, expResult, qualResult, projResult, prodResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).single(),
        supabase.from('links').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('contacts').select('*').eq('user_id', user.id).order('created_at'),
        supabase.from('experiences').select('*').eq('user_id', user.id).order('start_year', { ascending: false }),
        supabase.from('qualifications').select('*').eq('user_id', user.id).order('end_year', { ascending: false }),
        supabase.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('products').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    ])

    // Check if the viewer is logged in
    const { data: { user: viewer } } = await supabase.auth.getUser()

    const profile = profileResult.data
    const links = linksResult.data || []
    const contacts = contactsResult.data || []
    const experiences = expResult.data || []
    const qualifications = qualResult.data || []
    const projects = projResult.data || []
    const products = prodResult.data || []

    return (
        <main className="min-h-screen pt-12 pb-40">
            {/* Profile Content */}
            <div className="px-6 lg:px-[165px] max-w-[1470px] mx-auto space-y-24">

                {/* 1. Identity & Resume Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

                    {/* Left Column - Primary Identity & Resume */}
                    <div className="space-y-6">
                        {/* Profile Picture */}
                        {profile?.profile_pic_url && (
                            <div className="w-full max-w-[200px] aspect-square rounded-3xl overflow-hidden mx-auto lg:mx-0">
                                <img
                                    src={profile.profile_pic_url}
                                    alt={profile.full_name || 'Profile'}
                                    className="w-full h-full object-cover"
                                />
                            </div>
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

                        {/* Bio Card */}
                        {profile?.bio && (
                            <GlassCard className="p-6 !mt-10">
                                <p className="text-white/90 text-lg leading-relaxed whitespace-pre-wrap">
                                    {profile.bio}
                                </p>
                            </GlassCard>
                        )}

                        {/* Mobile Links Section */}
                        {links.length > 0 && (
                            <div className="space-y-3 block lg:hidden !mt-10">
                                <h3 className="text-white/50 text-sm uppercase tracking-wider mb-4 font-bold text-center">Links</h3>
                                {links.map((link) => (
                                    <a
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
                                    </a>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 !mt-24">
                            {/* Experience Section */}
                            {experiences.length > 0 && (
                                <GlassCard className="p-6 h-full">
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
                                </GlassCard>
                            )}

                            {/* Qualifications Section */}
                            {qualifications.length > 0 && (
                                <GlassCard className="p-6 h-full">
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
                                    <h3 className="text-white/50 text-sm uppercase tracking-wider mb-4">Contact</h3>
                                    {contacts.map((contact) => (
                                        <div key={contact.id} className="text-white">
                                            <span className="text-white/70">
                                                {contact.method === 'Other' ? contact.custom_method_name : contact.method}:
                                            </span>{' '}
                                            <span>{contact.value}</span>
                                        </div>
                                    ))}
                                </div>
                            )
                        }

                        {/* Link Buttons */}
                        {
                            links.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-white/50 text-sm uppercase tracking-wider mb-4">Links</h3>
                                    {links.map((link) => (
                                        <a
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
                                        </a>
                                    ))}
                                </div>
                            )
                        }
                    </div >
                </div >

                {/* 2. Visual Portfolio (Projects) */}
                {
                    projects.length > 0 && (
                        <section>
                            <h2 className="text-3xl font-bold text-white mb-8">Projects</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {projects.map(project => (
                                    <GlassCard key={project.id} className="p-6 md:p-8 flex flex-col h-full hover:bg-white/10 transition-colors">
                                        <h3 className="text-2xl font-bold text-white mb-2">{project.project_name}</h3>
                                        <div className="text-white/50 text-sm uppercase tracking-widest mb-4 font-bold">{project.contribution}</div>
                                        <p className="text-white/70 leading-relaxed mb-6 flex-grow">{project.description}</p>
                                        {project.project_photo_url && (
                                            <div className="w-full aspect-video rounded-xl bg-black/20 overflow-hidden">
                                                <img src={project.project_photo_url} alt={project.project_name} className="w-full h-full object-cover" />
                                            </div>
                                        )}
                                    </GlassCard>
                                ))}
                            </div>
                        </section>
                    )
                }

                {/* 3. Products & Services */}
                {
                    products.length > 0 && (
                        <section>
                            <h2 className="text-3xl font-bold text-white mb-8">Products & Services</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {products.map(product => {
                                    const ProductWrapper = product.sales_page_active ? Link : 'div'
                                    const wrapperProps = product.sales_page_active
                                        ? { href: `/products/${product.id}`, className: "block flex-grow cursor-pointer transition-opacity hover:opacity-80" }
                                        : { className: "block flex-grow" }

                                    return (
                                        <GlassCard key={product.id} className="p-6 flex flex-col h-full group">
                                            {/* Clickable Area (Image, Name, Price, Desc) */}
                                            // @ts-expect-error - Conditional component type issue
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

                                            {/* Action Buttons (Separate from Link) */}
                                            <div className="space-y-3 mt-auto">
                                                {product.purchase_link_active && product.purchase_link && (
                                                    <div className="w-full flex justify-center">
                                                        <ShinyLink
                                                            href={product.purchase_link}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="w-[11.625rem]"
                                                        >
                                                            Link to Purchase
                                                        </ShinyLink>
                                                    </div>
                                                )}
                                                {product.paypal_active && product.paypal_html && (
                                                    <div className="w-full flex justify-center">
                                                        <PayPalSmartButton html={product.paypal_html} />
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

                {/* Mobile Contact Section */}
                {
                    contacts.length > 0 && (
                        <section className="block lg:hidden mt-20">
                            <GlassCard className="p-6">
                                <h2 className="text-3xl font-bold text-white mb-8 text-center">Contact</h2>
                                <div className="space-y-2">
                                    {contacts.map((contact) => (
                                        <div key={contact.id} className="text-white text-center">
                                            <span className="text-white/70">
                                                {contact.method === 'Other' ? contact.custom_method_name : contact.method}:
                                            </span>{' '}
                                            <span>{contact.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </GlassCard>
                        </section>
                    )
                }

                {/* Footer */}
                {/* Footer - Only for non-logged-in users */}
                {
                    !viewer && (
                        <div className="pt-12 flex justify-center pb-1">
                            <CreateProfileButton />
                        </div>
                    )
                }
            </div >
        </main >
    )
}
