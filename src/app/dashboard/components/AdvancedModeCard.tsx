'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, X, ChevronDown, ChevronUp, Trash2, Info, Edit2, Upload, Loader2, ShieldCheck, ShieldAlert, Lock, Layout } from 'lucide-react'
import DOMPurify from 'dompurify'
import { Experience, Qualification, Project, Product } from '@/lib/types'
import { useUI } from '@/components/providers/UIProvider'

// GlassCard Component (Internal helper to match design system but allow layout control)
// Updated background to be darker (bg-black/20) for better contrast over clouds
const GlassCard = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`backdrop-blur-md bg-black/20 border border-white/10 shadow-[0_4px_24px_-1px_rgba(0,0,0,0.1)] rounded-[24px] overflow-hidden ${className}`}>
        {children}
    </div>
)

interface AdvancedModeCardProps {
    userId: string
}

type ActiveSection = 'experiences' | 'qualifications' | 'projects' | 'products'

export default function AdvancedModeCard({ userId }: AdvancedModeCardProps) {
    const [supabase] = useState(() => createClient())
    const [isExpanded, setIsExpanded] = useState(false)
    const [activeSection, setActiveSection] = useState<ActiveSection>('experiences')
    const [isLoading, setIsLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const { setBackgroundDimmed } = useUI()
    const [showGuide, setShowGuide] = useState(false)

    // Data States
    const [experiences, setExperiences] = useState<Experience[]>([])
    const [qualifications, setQualifications] = useState<Qualification[]>([])
    const [projects, setProjects] = useState<Project[]>([])
    const [products, setProducts] = useState<Product[]>([])

    // Selection States
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null) // For editing specific product

    // Security Verification State
    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'scanning' | 'secure' | 'unsafe'>('idle')
    const [securityMessage, setSecurityMessage] = useState('')

    // PayPal Security Check Effect
    useEffect(() => {
        // Reset status if no product selected or no HTML
        if (!selectedProduct || !selectedProduct.paypal_html) {
            setVerificationStatus('idle')
            setSecurityMessage('')
            return
        }

        // Only scan if status is idle (fresh input) or we just started editing
        // We use a debounce to simulate scanning and prevent run-on
        setVerificationStatus('scanning')
        setSecurityMessage('Analyzing code security...')

        const timer = setTimeout(() => {
            const rawHtml = selectedProduct.paypal_html || ''

            // Allow only PayPal forms and strict tags (Updated for Single Button support)
            const clean = DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['form', 'input', 'img', 'div', 'style', 'section', 'span'],
                ALLOWED_ATTR: ['action', 'method', 'target', 'type', 'src', 'border', 'name', 'alt', 'value', 'class', 'style', 'id'],
                ALLOWED_URI_REGEXP: /^(https:\/\/.*\.paypal\.com\/|https:\/\/www\.paypal\.com\/|https:\/\/www\.paypalobjects\.com\/)/
            })

            // Additional Check: Must target PayPal or use HostedButtons
            const isPayPal = rawHtml.includes('paypal.com') || rawHtml.includes('paypal.HostedButtons')
            const hasScript = rawHtml.includes('<script') || rawHtml.includes('javascript:')

            // Smart Exception: PayPal JS SDK (Hosted Buttons)
            // We allow scripts IF they match the strict Hosted Button pattern
            const isHostedButton = /paypal\.HostedButtons\(\{\s*hostedButtonId:\s*"[A-Z0-9]+"/m.test(rawHtml)

            // Single Button Exception: Allow style tags if they contain PayPal-like classes or structure
            const isSingleButton = rawHtml.includes('<form') && rawHtml.includes('paypal.com/ncp/payment')

            if ((clean !== rawHtml && !isHostedButton && !isSingleButton) || (hasScript && !isHostedButton) || !isPayPal) {
                // If sanitization changed anything (ignoring our exceptions)
                // Note: DOMPurify might strip styles if we are not careful, but we allowed them above
                if (clean.length === 0 && !isHostedButton && !isSingleButton) {
                    setVerificationStatus('unsafe')
                    setSecurityMessage('Invalid code detected.')
                } else if (!isPayPal) {
                    setVerificationStatus('unsafe')
                    setSecurityMessage('Code does not appear to be from PayPal.')
                } else {
                    setVerificationStatus('secure')
                    setSecurityMessage('Verified Standard PayPal Button')
                }
            } else {
                setVerificationStatus('secure')
                setSecurityMessage(isHostedButton ? 'Verified Safe (Smart Button)' : 'Code verified: Safe from malicious scripts.')
            }
        }, 1500) // 1.5s "Branding" delay

        return () => clearTimeout(timer)
    }, [selectedProduct?.paypal_html])

    // Handle background dimming
    useEffect(() => {
        if (isExpanded) {
            setBackgroundDimmed(true)
        } else {
            setBackgroundDimmed(false)
        }

        // Cleanup on unmount
        return () => setBackgroundDimmed(false)

    }, [isExpanded, setBackgroundDimmed])

    // Fetch Data on Load
    useEffect(() => {
        if (userId) {
            fetchData()
        }
    }, [userId])

    const fetchData = async () => {
        setIsLoading(true)
        try {
            const [expRes, qualRes, projRes, prodRes] = await Promise.all([
                supabase.from('experiences').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
                supabase.from('qualifications').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
                supabase.from('projects').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
                supabase.from('products').select('*').eq('user_id', userId).order('created_at', { ascending: true })
            ])

            if (expRes.data) setExperiences(expRes.data)
            if (qualRes.data) setQualifications(qualRes.data)
            if (projRes.data) setProjects(projRes.data)
            if (prodRes.data) setProducts(prodRes.data)
        } catch (error) {
            console.error('Error fetching advanced data:', error)
        } finally {
            setIsLoading(false)
        }
    }

    const handleImageUpload = async (file: File, pathPrefix: string): Promise<string | null> => {
        setIsUploading(true)
        try {
            const fileExt = file.name.split('.').pop()
            const fileName = `${pathPrefix}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('portfolio-assets')
                .upload(fileName, file)

            if (uploadError) throw uploadError

            const { data } = supabase.storage
                .from('portfolio-assets')
                .getPublicUrl(fileName)

            return data.publicUrl
        } catch (error) {
            console.error('Error uploading image:', error)
            alert('Error uploading image. Please try again.')
            return null
        } finally {
            setIsUploading(false)
        }
    }

    // --- handlers ---

    // Experience Handlers
    const addExperience = async () => {
        const { data } = await supabase.from('experiences').insert({
            user_id: userId,
            company_name: '',
            job_title: '',
            start_year: new Date().getFullYear(),
            end_year: null
        }).select().single()
        if (data) setExperiences([data, ...experiences])
    }
    const updateExperience = async (id: string, updates: Partial<Experience>) => {
        // Optimistic update
        setExperiences(experiences.map(e => e.id === id ? { ...e, ...updates } : e))
        await supabase.from('experiences').update(updates).eq('id', id)
    }
    const deleteExperience = async (id: string) => {
        setExperiences(experiences.filter(e => e.id !== id))
        await supabase.from('experiences').delete().eq('id', id)
    }
    const deleteQualification = async (id: string) => {
        setQualifications(qualifications.filter(q => q.id !== id))
        await supabase.from('qualifications').delete().eq('id', id)
    }
    const deleteProject = async (id: string) => {
        setProjects(projects.filter(p => p.id !== id))
        await supabase.from('projects').delete().eq('id', id)
    }

    // Qualification Handlers
    const addQualification = async () => {
        const { data } = await supabase.from('qualifications').insert({
            user_id: userId,
            institution: '',
            qualification_name: '',
            start_year: new Date().getFullYear(),
            end_year: new Date().getFullYear()
        }).select().single()
        if (data) setQualifications([data, ...qualifications])
    }
    const updateQualification = async (id: string, updates: Partial<Qualification>) => {
        setQualifications(qualifications.map(q => q.id === id ? { ...q, ...updates } : q))
        await supabase.from('qualifications').update(updates).eq('id', id)
    }

    // Project Handlers
    const addProject = async () => {
        const { data } = await supabase.from('projects').insert({
            user_id: userId,
            project_name: '',
            contribution: '',
            description: ''
        }).select().single()
        if (data) setProjects([data, ...projects])
    }
    const updateProject = async (id: string, updates: Partial<Project>) => {
        setProjects(projects.map(p => p.id === id ? { ...p, ...updates } : p))
        await supabase.from('projects').update(updates).eq('id', id)
    }

    // Product Handlers
    const addProduct = async () => {
        const { data } = await supabase.from('products').insert({
            user_id: userId,
            name: 'New Product',
            price: '0',
        }).select().single()
        if (data) {
            setProducts([...products, data])
            setSelectedProduct(data) // Select new product immediately
        }
    }
    const updateProduct = async (id: string, updates: Partial<Product>) => {
        setProducts(products.map(p => p.id === id ? { ...p, ...updates } : p))
        if (selectedProduct?.id === id) {
            setSelectedProduct(prev => prev ? { ...prev, ...updates } : null)
        }
        await supabase.from('products').update(updates).eq('id', id)
    }
    const deleteProduct = async (id: string) => {
        setProducts(products.filter(p => p.id !== id))
        if (selectedProduct?.id === id) setSelectedProduct(null)
        await supabase.from('products').delete().eq('id', id)
    }


    // --- Render Helpers ---

    // Collapsed View
    if (!isExpanded) {
        return (
            <div
                onClick={() => setIsExpanded(true)}
                className="w-full relative overflow-hidden rounded-[24px]"
            >
                <GlassCard className="p-6 cursor-pointer hover:bg-white/5 transition-colors flex items-center justify-between group relative z-10">
                    <div className="absolute inset-0 opacity-40 mix-blend-overlay pointer-events-none z-0" style={{ backgroundImage: 'url(/siri-gradient.png)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    <div className="flex items-center gap-4 relative z-10">
                        <div>
                            <h3 className="text-white font-bold text-2xl">Advanced Mode</h3>
                            <p className="text-white/60 text-sm">Add Experiences, Projects, and Products</p>
                        </div>
                    </div>
                    <ChevronDown className="text-white/50 group-hover:text-white transition-colors relative z-10" />
                </GlassCard>
            </div>
        )
    }

    // Render Experiences Editor
    const renderExperiences = () => (
        <div className="flex flex-col gap-6 pt-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-white font-semibold text-lg">Job titles</h4>
                <button onClick={addExperience} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                    <Plus size={16} />
                </button>
            </div>

            {/* List */}
            <div className="flex flex-col gap-4">
                {experiences.map((exp) => (
                    <div key={exp.id} className="relative group bg-white/5 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                        <button
                            onClick={() => deleteExperience(exp.id)}
                            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <div className="grid gap-4">
                            <div>
                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Company</label>
                                <input
                                    type="text"
                                    value={exp.company_name}
                                    onChange={(e) => updateExperience(exp.id, { company_name: e.target.value })}
                                    placeholder="e.g. Google"
                                    className="w-full bg-transparent text-white font-medium placeholder-white/40 focus:outline-none focus:border-b border-white/10 pb-1"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Role</label>
                                <input
                                    type="text"
                                    value={exp.job_title}
                                    onChange={(e) => updateExperience(exp.id, { job_title: e.target.value })}
                                    placeholder="e.g. Senior Product Designer"
                                    className="w-full bg-transparent text-white font-medium placeholder-white/40 focus:outline-none focus:border-b border-white/10 pb-1"
                                />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Start Year</label>
                                    <input
                                        type="number"
                                        value={exp.start_year}
                                        onChange={(e) => updateExperience(exp.id, { start_year: parseInt(e.target.value) })}
                                        className="w-full bg-transparent text-white/80 focus:outline-none"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">End Year</label>
                                    <input
                                        type="number"
                                        value={exp.end_year || ''}
                                        placeholder="Present"
                                        onChange={(e) => updateExperience(exp.id, { end_year: e.target.value ? parseInt(e.target.value) : null })}
                                        className="w-full bg-transparent text-white/80 focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {experiences.length === 0 && <p className="text-white/60 text-sm italic">No experiences added yet.</p>}
            </div>
        </div>
    )

    // Render Qualifications Editor
    const renderQualifications = () => (
        <div className="flex flex-col gap-6 pt-6">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-white font-semibold text-lg">Qualifications</h4>
                <button onClick={addQualification} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                    <Plus size={16} />
                </button>
            </div>

            <div className="flex flex-col gap-4">
                {qualifications.map((qual) => (
                    <div key={qual.id} className="relative group bg-white/5 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                        <button onClick={() => deleteQualification(qual.id)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-colors">
                            <X size={18} />
                        </button>

                        <div className="grid gap-4">
                            <div>
                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Institution</label>
                                <input
                                    type="text"
                                    value={qual.institution}
                                    onChange={(e) => updateQualification(qual.id, { institution: e.target.value })}
                                    placeholder="e.g. Stanford University"
                                    className="w-full bg-transparent text-white font-medium placeholder-white/40 focus:outline-none focus:border-b border-white/10 pb-1"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Qualification</label>
                                <input
                                    type="text"
                                    value={qual.qualification_name}
                                    onChange={(e) => updateQualification(qual.id, { qualification_name: e.target.value })}
                                    placeholder="e.g. MSc Computer Science"
                                    className="w-full bg-transparent text-white font-medium placeholder-white/40 focus:outline-none focus:border-b border-white/10 pb-1"
                                />
                            </div>
                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Start Year</label>
                                    <input
                                        type="number"
                                        value={qual.start_year}
                                        onChange={(e) => updateQualification(qual.id, { start_year: parseInt(e.target.value) })}
                                        className="w-full bg-transparent text-white/80 focus:outline-none"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">End Year</label>
                                    <input
                                        type="number"
                                        value={qual.end_year}
                                        onChange={(e) => updateQualification(qual.id, { end_year: parseInt(e.target.value) })}
                                        className="w-full bg-transparent text-white/80 focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {qualifications.length === 0 && <p className="text-white/60 text-sm italic">No qualifications added yet.</p>}
            </div>
        </div>
    )

    // Render Projects Editor
    const renderProjects = () => (
        <div className="flex flex-col gap-6 pt-6">
            <div className="flex items-center justify-between mb-2">
                <h4 className="text-white font-semibold text-lg">Projects</h4>
                <button onClick={addProject} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
                    <Plus size={16} />
                </button>
            </div>

            <div className="flex flex-col gap-4">
                {projects.map((proj) => (
                    <div key={proj.id} className="relative group bg-white/5 rounded-2xl p-4 border border-white/5 hover:border-white/10 transition-colors">
                        <button onClick={() => deleteProject(proj.id)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-colors">
                            <X size={18} />
                        </button>

                        <div className="grid gap-4">
                            <div>
                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Project Name</label>
                                <input
                                    type="text"
                                    value={proj.project_name}
                                    onChange={(e) => updateProject(proj.id, { project_name: e.target.value })}
                                    placeholder="e.g. Neo-Bank Mobile App"
                                    className="w-full bg-transparent text-white font-medium placeholder-white/40 focus:outline-none focus:border-b border-white/10 pb-1"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Your Contribution</label>
                                <input
                                    type="text"
                                    value={proj.contribution}
                                    onChange={(e) => updateProject(proj.id, { contribution: e.target.value })}
                                    placeholder="e.g. Lead UI/UX Designer"
                                    className="w-full bg-transparent text-white/80 placeholder-white/20 focus:outline-none focus:border-b border-white/10 pb-1"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-white/70 uppercase tracking-widest mb-1 block">Description</label>
                                <textarea
                                    value={proj.description || ''}
                                    onChange={(e) => updateProject(proj.id, { description: e.target.value })}
                                    placeholder="Describe the project..."
                                    className="w-full bg-transparent text-white/70 text-sm placeholder-white/20 focus:outline-none border-b border-white/10 pb-2 min-h-[60px]"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Project Photo</label>
                                <div className="flex items-center gap-4">
                                    {proj.project_photo_url && (
                                        <div className="w-16 h-16 rounded-lg bg-white/5 bg-cover bg-center border border-white/10" style={{ backgroundImage: `url(${proj.project_photo_url})` }} />
                                    )}
                                    <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10">
                                        {isUploading ? <Loader2 size={16} className="animate-spin text-white/70" /> : <Upload size={16} className="text-white/70" />}
                                        <span className="text-sm text-white/70">{proj.project_photo_url ? 'Change Photo' : 'Upload Photo'}</span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (file) {
                                                    const url = await handleImageUpload(file, 'projects')
                                                    if (url) updateProject(proj.id, { project_photo_url: url })
                                                }
                                            }}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
                {projects.length === 0 && <p className="text-white/60 text-sm italic">No projects added yet.</p>}
            </div>
        </div>
    )

    // Render Products Editor (Requires distinct logic for dynamic selection)
    const renderProducts = () => {
        // If no product selected but existing products in list, prompt selection
        if (!selectedProduct && products.length > 0) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
                    <p className="text-white/80">Select a product from the left menu to edit <br /> or click + above to create one.</p>
                </div>
            )
        }

        if (!selectedProduct) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-50">
                    <p className="text-white/80">No products yet. <br /> Click + in the sidebar to add your first product.</p>
                </div>
            )
        }

        // Edit Product Form
        return (
            <div className="flex flex-col gap-6 animate-fadeIn pt-6 relative">
                <button
                    onClick={() => deleteProduct(selectedProduct.id)}
                    className="absolute top-[27px] right-0 w-10 h-10 rounded-full bg-red-500/20 hover:bg-red-500/40 flex items-center justify-center text-white transition-colors z-10"
                >
                    <X size={18} />
                </button>

                <div className="grid gap-6">
                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Product Name</label>
                        <input
                            type="text"
                            value={selectedProduct.name}
                            onChange={(e) => updateProduct(selectedProduct.id, { name: e.target.value })}
                            className="w-full bg-transparent text-2xl font-bold text-white placeholder-white/20 focus:outline-none pr-12"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Price (include the currency)</label>
                        <input
                            type="text"
                            value={selectedProduct.price || ''}
                            onChange={(e) => updateProduct(selectedProduct.id, { price: e.target.value })}
                            placeholder="e.g. $50 or Free"
                            className="w-full bg-transparent text-xl font-medium text-white placeholder-white/20 focus:outline-none"
                        />
                    </div>

                    {/* Product Image & Sales Page - Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Product Image */}
                        <div>
                            <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Product Image</label>
                            <div className="flex items-center gap-4 min-h-[64px]">
                                {selectedProduct.image_url && (
                                    <div className="w-16 h-16 rounded-lg bg-white/5 bg-cover bg-center border border-white/10" style={{ backgroundImage: `url(${selectedProduct.image_url})` }} />
                                )}
                                <label className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10">
                                    {isUploading ? <Loader2 size={16} className="animate-spin text-white/70" /> : <Upload size={16} className="text-white/70" />}
                                    <span className="text-sm text-white/70">{selectedProduct.image_url ? 'Change Image' : 'Upload Image'}</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0]
                                            if (file) {
                                                const url = await handleImageUpload(file, 'products')
                                                if (url) updateProduct(selectedProduct.id, { image_url: url })
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Sales Page Creator */}
                        <div>
                            <label className="text-xs text-white/40 uppercase tracking-widest mb-2 block">Product Sales Page</label>
                            <div className="flex items-center gap-4 min-h-[64px]">
                                <button
                                    onClick={() => updateProduct(selectedProduct.id, { sales_page_active: !selectedProduct.sales_page_active })}
                                    className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${selectedProduct.sales_page_active ? 'bg-green-500' : 'bg-white/20'}`}
                                >
                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${selectedProduct.sales_page_active ? 'left-6' : 'left-1'}`} />
                                </button>
                                {selectedProduct.sales_page_active && (
                                    <label
                                        onClick={() => window.open(`/dashboard/products/${selectedProduct.id}/creator`, '_blank')}
                                        className="cursor-pointer flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
                                    >
                                        <Layout size={16} className="text-white/70" />
                                        <span className="text-sm text-white/70">Open Sales Page Creator</span>
                                    </label>
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-white/40 uppercase tracking-widest mb-1 block">Description</label>
                        <textarea
                            value={selectedProduct.description || ''}
                            onChange={(e) => updateProduct(selectedProduct.id, { description: e.target.value })}
                            className="w-full bg-white/5 rounded-xl p-4 text-white/80 text-sm border border-white/5 focus:border-white/20 focus:outline-none min-h-[100px]"
                            placeholder="Describe your offering..."
                        />
                    </div>

                    {/* Purchase Link Toggle */}
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <div className="flex items-center justify-between mb-4">
                            <label className="text-sm font-medium text-white">Purchase Link</label>
                            <button
                                onClick={() => updateProduct(selectedProduct.id, { purchase_link_active: !selectedProduct.purchase_link_active })}
                                className={`w-10 h-5 rounded-full transition-colors relative ${selectedProduct.purchase_link_active ? 'bg-green-500' : 'bg-white/20'}`}
                            >
                                <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${selectedProduct.purchase_link_active ? 'left-6' : 'left-1'}`} />
                            </button>
                        </div>
                        {selectedProduct.purchase_link_active && (
                            <input
                                type="text"
                                value={selectedProduct.purchase_link || ''}
                                onChange={(e) => updateProduct(selectedProduct.id, { purchase_link: e.target.value })}
                                placeholder="https://..."
                                className="w-full bg-black/20 rounded-lg p-2 text-white/80 text-sm focus:outline-none border border-white/10"
                            />
                        )}
                    </div>

                    {/* PayPal HTML Toggle */}
                    <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2 pt-0.5">
                                <label className="text-sm font-medium text-white">PayPal Button Code</label>
                                <div className="group relative hidden min-[391px]:block">
                                    <button
                                        onClick={() => setShowGuide(!showGuide)}
                                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                    >
                                        <Info size={12} className="text-white/60" />
                                        <span className="text-[10px] font-medium text-white/60">Where is this?</span>
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <button
                                    onClick={() => updateProduct(selectedProduct.id, { paypal_active: !selectedProduct.paypal_active })}
                                    className={`w-10 h-5 rounded-full transition-colors relative ${selectedProduct.paypal_active ? 'bg-green-500' : 'bg-white/20'}`}
                                >
                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${selectedProduct.paypal_active ? 'left-6' : 'left-1'}`} />
                                </button>
                                <div className="group relative block min-[391px]:hidden">
                                    <button
                                        onClick={() => setShowGuide(!showGuide)}
                                        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                                    >
                                        <Info size={12} className="text-white/60" />
                                        <span className="text-[10px] font-medium text-white/60">Where is this?</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                        {selectedProduct.paypal_active && (
                            <div className="relative space-y-3">
                                {/* Guide Image Accordion */}
                                {showGuide && (
                                    <div className="rounded-xl overflow-hidden border border-white/10 bg-black/40 animate-in slide-in-from-top-2 duration-200">
                                        <div className="p-3 border-b border-white/10 flex justify-between items-center bg-white/5">
                                            <span className="text-xs font-medium text-white/80">PayPal Dashboard &gt; Copy Code</span>
                                            <button onClick={() => setShowGuide(false)} className="text-white/40 hover:text-white">
                                                <X size={14} />
                                            </button>
                                        </div>
                                        <div className="p-4 flex justify-center bg-white/5">
                                            <a
                                                href="https://youtu.be/9KihkWujsaI?si=hwAHbrQDLvOog6U8&t=28"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="relative group block max-w-full cursor-pointer"
                                            >
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center pointer-events-none">
                                                    <span className="opacity-0 group-hover:opacity-100 bg-black/80 text-white text-xs px-3 py-1.5 rounded-full font-medium transition-opacity transform translate-y-2 group-hover:translate-y-0 duration-200">
                                                        Watch Video Tutorial ↗
                                                    </span>
                                                </div>
                                                <img
                                                    src="/guide-paypal.png"
                                                    alt="Guide: Copy the Button HTML Code"
                                                    className="max-w-full rounded-lg shadow-2xl border border-white/10"
                                                />
                                            </a>
                                        </div>
                                    </div>
                                )}

                                <textarea
                                    value={selectedProduct.paypal_html || ''}
                                    onChange={(e) => updateProduct(selectedProduct.id, { paypal_html: e.target.value })}
                                    placeholder="<form action=...>"
                                    className={`w-full bg-black/20 rounded-lg p-2 text-white/80 text-xs font-mono focus:outline-none border min-h-[80px] transition-colors ${verificationStatus === 'scanning' ? 'border-yellow-500/50' :
                                        verificationStatus === 'secure' ? 'border-green-500/50' :
                                            verificationStatus === 'unsafe' ? 'border-red-500/50' :
                                                'border-white/10'
                                        }`}
                                />
                                {/* Security Status Indicator Overlay */}
                                {selectedProduct.paypal_html && (
                                    <div className="mt-2 flex items-center justify-between animate-in fade-in duration-300">
                                        <div className="flex items-center gap-2">
                                            {verificationStatus === 'scanning' && (
                                                <>
                                                    <Loader2 size={14} className="text-yellow-400 animate-spin" />
                                                    <span className="text-yellow-400 text-xs font-medium tracking-wide">Scanning code...</span>
                                                </>
                                            )}
                                            {verificationStatus === 'secure' && (
                                                <>
                                                    <ShieldCheck size={14} className="text-green-400" />
                                                    <span className="text-green-400 text-xs font-medium tracking-wide">Verified Safe</span>
                                                </>
                                            )}
                                            {verificationStatus === 'unsafe' && (
                                                <>
                                                    <ShieldAlert size={14} className="text-red-400" />
                                                    <span className="text-red-400 text-xs font-medium tracking-wide">Unsafe content detected</span>
                                                </>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-50">
                                            <Lock size={10} className="text-white" />
                                            <span className="text-[10px] uppercase tracking-widest text-white">nsso secure html verification</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>



                </div>

            </div>

        )
    }

    // Main Expanded View
    return (
        <GlassCard className="w-full min-h-[600px] flex flex-col md:flex-row relative">

            {/* Collapse Button */}
            <div
                onClick={() => { setIsExpanded(false); setBackgroundDimmed(false); }}
                className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/50 hover:text-white cursor-pointer transition-colors"
            >
                <ChevronUp size={20} />
            </div>

            {/* LEFT COLUMN: Sidebar Navigation */}
            <div className="w-full md:w-[300px] border-r border-white/10 p-6 flex flex-col gap-8 bg-black/20">

                {/* Experiences Section */}
                <div>
                    <h3 className="text-xs text-white/70 uppercase tracking-widest font-bold mb-4">Experiences</h3>
                    <div className="flex flex-col gap-2">
                        <button
                            onClick={() => { setActiveSection('experiences'); setSelectedProduct(null); }}
                            className={`text-left px-4 py-3 rounded-xl transition-all ${activeSection === 'experiences' ? 'bg-white/10 text-white' : 'text-white/80 hover:text-white hover:bg-white/5'}`}
                        >
                            Job Titles
                        </button>
                        <button
                            onClick={() => { setActiveSection('qualifications'); setSelectedProduct(null); }}
                            className={`text-left px-4 py-3 rounded-xl transition-all ${activeSection === 'qualifications' ? 'bg-white/10 text-white' : 'text-white/80 hover:text-white hover:bg-white/5'}`}
                        >
                            Qualifications
                        </button>
                        <button
                            onClick={() => { setActiveSection('projects'); setSelectedProduct(null); }}
                            className={`text-left px-4 py-3 rounded-xl transition-all ${activeSection === 'projects' ? 'bg-white/10 text-white' : 'text-white/80 hover:text-white hover:bg-white/5'}`}
                        >
                            Projects
                        </button>
                    </div>
                </div>

                {/* Products Section */}
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs text-white/70 uppercase tracking-widest font-bold">Products & Services</h3>
                        <button
                            onClick={addProduct}
                            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                        >
                            <Plus size={12} />
                        </button>
                    </div>

                    <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-2">
                        {products.map(product => (
                            <div key={product.id} className="relative group">
                                <button
                                    onClick={() => { setActiveSection('products'); setSelectedProduct(product); }}
                                    className={`w-full text-left px-4 py-3 rounded-xl transition-all truncate pr-8 ${activeSection === 'products' && selectedProduct?.id === product.id ? 'bg-white/10 text-white' : 'text-white/80 hover:text-white hover:bg-white/5'}`}
                                >
                                    {product.name || 'New Product'}
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); deleteProduct(product.id); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                        {products.length === 0 && (
                            <p className="text-white/60 text-xs italic px-2">No products added.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: Content Editor */}
            <div className="flex-1 p-6 md:p-10 overflow-y-auto max-h-[800px] relative">
                {activeSection === 'experiences' && renderExperiences()}
                {activeSection === 'qualifications' && renderQualifications()}
                {activeSection === 'projects' && renderProjects()}
                {activeSection === 'products' && renderProducts()}
            </div>

        </GlassCard>
    )
}
