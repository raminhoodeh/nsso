'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUser } from './UserProvider'
import type { Profile, Link, Contact, Experience, Qualification, Project, Product } from '@/lib/types'
import { validateLinks as validateLinksUtil, type LinkValidation } from '@/lib/deity/linkValidator'

// Profile snapshot for undo history
interface ProfileSnapshot {
    profile: Profile | null
    links: Link[]
    contacts: Contact[]
    experiences: Experience[]
    qualifications: Qualification[]
    projects: Project[]
    products: Product[]
    timestamp: number
}

interface ProfileContextType {
    // Current State
    profile: Profile | null
    links: Link[]
    contacts: Contact[]
    experiences: Experience[]
    qualifications: Qualification[]
    projects: Project[]
    products: Product[]

    // Loading States
    loading: boolean

    // Update Methods (automatically save to Supabase)
    updateField: (field: keyof Profile, value: string) => Promise<void>
    addLink: (name: string, url: string) => Promise<void>
    updateLink: (id: string, field: 'link_name' | 'link_url', value: string) => Promise<void>
    removeLink: (id: string) => Promise<void>
    reorderLinks: (orderedIds: string[]) => Promise<void>
    validateLinks: () => Promise<LinkValidation[]>

    // Deep Profile Sections
    addExperience: (company: string, title: string, startYear: number, endYear: number | null, description?: string) => Promise<void>
    addProject: (name: string, description: string, url?: string) => Promise<void>
    addQualification: (institution: string, degree: string, year: number) => Promise<void>
    addProduct: (name: string, description: string, price?: string, url?: string) => Promise<void>

    // Undo Stack
    undo: () => Promise<void>
    canUndo: boolean

    // Fast Mode
    fastMode: boolean
    setFastMode: (enabled: boolean) => Promise<void>

    // Profile Completeness
    profileCompleteness: number

    // Refresh
    refreshProfile: () => Promise<void>
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined)

export function ProfileProvider({ children }: { children: ReactNode }) {
    const { user } = useUser()
    const supabase = createClient()

    // State
    const [profile, setProfile] = useState<Profile | null>(null)
    const [links, setLinks] = useState<Link[]>([])
    const [contacts, setContacts] = useState<Contact[]>([])
    const [experiences, setExperiences] = useState<Experience[]>([])
    const [qualifications, setQualifications] = useState<Qualification[]>([])
    const [projects, setProjects] = useState<Project[]>([])
    const [products, setProducts] = useState<Product[]>([])
    const [loading, setLoading] = useState(true)
    const [fastMode, setFastModeState] = useState(false)

    // Undo stack (session-based, not persisted)
    const [history, setHistory] = useState<ProfileSnapshot[]>([])

    // Load profile data
    const loadProfileData = async (userId: string) => {
        setLoading(true)

        try {
            // Load profile
            const { data: profileData } = await supabase
                .from('profiles')
                .select('*')
                .eq('user_id', userId)
                .single()

            if (profileData) setProfile(profileData)

            // Load links
            const { data: linksData } = await supabase
                .from('links')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: true })

            if (linksData) setLinks(linksData)

            // Load contacts
            const { data: contactsData } = await supabase
                .from('contacts')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: true })

            if (contactsData) setContacts(contactsData)

            // Load experiences
            const { data: experiencesData } = await supabase
                .from('experiences')
                .select('*')
                .eq('user_id', userId)
                .order('start_year', { ascending: false })

            if (experiencesData) setExperiences(experiencesData)

            // Load qualifications
            const { data: qualificationsData } = await supabase
                .from('qualifications')
                .select('*')
                .eq('user_id', userId)
                .order('end_year', { ascending: false })

            if (qualificationsData) setQualifications(qualificationsData)

            // Load projects
            const { data: projectsData } = await supabase
                .from('projects')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })

            if (projectsData) setProjects(projectsData)

            // Load products
            const { data: productsData } = await supabase
                .from('products')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })

            if (productsData) setProducts(productsData)

            // Load fast mode preference
            const { data: userData } = await supabase
                .from('users')
                .select('deity_fast_mode')
                .eq('id', userId)
                .single()

            if (userData) setFastModeState(userData.deity_fast_mode || false)

        } catch (error) {
            console.error('Error loading profile data:', error)
        } finally {
            setLoading(false)
        }
    }

    // Load data when user changes
    useEffect(() => {
        if (user?.id) {
            loadProfileData(user.id)
        } else {
            setLoading(false)
        }
    }, [user?.id])

    // Calculate profile completeness
    const calculateCompleteness = (): number => {
        if (!profile) return 0

        let score = 0

        // Core Identity (40%)
        if (profile.bio) score += 15
        if (profile.headline) score += 15
        if (profile.profile_pic_url) score += 10

        // Connectivity (20%)
        if (links.length > 0) score += 10
        if (contacts.length > 0) score += 10

        // Professional Depth (30%)
        if (experiences.length > 0) score += 10
        if (projects.length > 0) score += 5
        if (qualifications.length > 0) score += 5

        // Storefront (10%)
        if (products.length > 0) score += 10

        return score
    }

    const profileCompleteness = calculateCompleteness()

    // Save current state to history
    const saveToHistory = () => {
        setHistory(prev => [...prev, {
            profile,
            links,
            contacts,
            experiences,
            qualifications,
            projects,
            products,
            timestamp: Date.now()
        }])
    }

    // Update profile field
    const updateField = async (field: keyof Profile, value: string) => {
        if (!user?.id) return

        // Save current state to history
        saveToHistory()

        // Update local state
        setProfile(prev => prev ? { ...prev, [field]: value } : null)

        // Persist to Supabase
        const { error } = await supabase
            .from('profiles')
            .update({ [field]: value })
            .eq('user_id', user.id)

        if (error) {
            console.error('Error updating profile:', error)
            // Revert on error
            undo()
        }
    }

    // Add link
    const addLink = async (name: string, url: string) => {
        if (!user?.id) return

        saveToHistory()

        const { data, error } = await supabase
            .from('links')
            .insert({
                user_id: user.id,
                link_name: name,
                link_url: url
            })
            .select()
            .single()

        if (data && !error) {
            setLinks(prev => [...prev, data])
        }

        if (error) {
            console.error('Error adding link:', error)
            undo()
        }
    }

    // Update link
    const updateLink = async (id: string, field: 'link_name' | 'link_url', value: string) => {
        saveToHistory()

        setLinks(links.map(l => l.id === id ? { ...l, [field]: value } : l))

        const { error } = await supabase
            .from('links')
            .update({ [field]: value })
            .eq('id', id)

        if (error) {
            console.error('Error updating link:', error)
            undo()
        }
    }

    // Remove link
    const removeLink = async (id: string) => {
        saveToHistory()

        await supabase.from('links').delete().eq('id', id)
        setLinks(links.filter(l => l.id !== id))
    }

    // Reorder links
    const reorderLinks = async (orderedIds: string[]) => {
        if (!user?.id) return

        saveToHistory()

        // Reorder local state
        const reordered = orderedIds
            .map(id => links.find(l => l.id === id))
            .filter((l): l is Link => l !== undefined)

        setLinks(reordered)

        // Update order in database (using array position as order)
        // Note: If we want persistent order, we'd need an 'order' column in links table
        // For now, we'll rely on created_at or add a display_order column later
        for (let i = 0; i < orderedIds.length; i++) {
            await supabase
                .from('links')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', orderedIds[i])
        }
    }

    // Validate all links
    const validateLinks = async (): Promise<LinkValidation[]> => {
        const linksToValidate = links.map(l => ({ id: l.id, url: l.link_url }))
        return validateLinksUtil(linksToValidate)
    }

    // Add experience
    const addExperience = async (company: string, title: string, startYear: number, endYear: number | null, description?: string) => {
        if (!user?.id) return

        saveToHistory()

        const { data, error } = await supabase
            .from('experiences')
            .insert({
                user_id: user.id,
                company,
                title,
                start_year: startYear,
                end_year: endYear,
                description
            })
            .select()
            .single()

        if (data && !error) {
            setExperiences(prev => [data, ...prev])
        }

        if (error) {
            console.error('Error adding experience:', error)
            undo()
        }
    }

    // Add project
    const addProject = async (name: string, description: string, url?: string) => {
        if (!user?.id) return

        saveToHistory()

        const { data, error } = await supabase
            .from('projects')
            .insert({
                user_id: user.id,
                project_name: name,
                project_description: description,
                project_url: url
            })
            .select()
            .single()

        if (data && !error) {
            setProjects(prev => [data, ...prev])
        }

        if (error) {
            console.error('Error adding project:', error)
            undo()
        }
    }

    // Add qualification
    const addQualification = async (institution: string, degree: string, year: number) => {
        if (!user?.id) return

        saveToHistory()

        const { data, error } = await supabase
            .from('qualifications')
            .insert({
                user_id: user.id,
                institution,
                degree,
                end_year: year
            })
            .select()
            .single()

        if (data && !error) {
            setQualifications(prev => [data, ...prev])
        }

        if (error) {
            console.error('Error adding qualification:', error)
            undo()
        }
    }

    // Add product
    const addProduct = async (name: string, description: string, price?: string, url?: string) => {
        if (!user?.id) return

        saveToHistory()

        const { data, error } = await supabase
            .from('products')
            .insert({
                user_id: user.id,
                product_name: name,
                product_description: description,
                price,
                purchase_url: url
            })
            .select()
            .single()

        if (data && !error) {
            setProducts(prev => [data, ...prev])
        }

        if (error) {
            console.error('Error adding product:', error)
            undo()
        }
    }

    // Undo last change
    const undo = async () => {
        if (history.length === 0) return

        const previous = history[history.length - 1]
        setProfile(previous.profile)
        setLinks(previous.links)
        setContacts(previous.contacts)
        setExperiences(previous.experiences)
        setQualifications(previous.qualifications)
        setProjects(previous.projects)
        setProducts(previous.products)
        setHistory(prev => prev.slice(0, -1))

        // Sync with database (restore previous profile state)
        if (user?.id && previous.profile) {
            await supabase
                .from('profiles')
                .update({
                    full_name: previous.profile.full_name,
                    headline: previous.profile.headline,
                    bio: previous.profile.bio,
                    profile_pic_url: previous.profile.profile_pic_url
                })
                .eq('user_id', user.id)
        }
    }

    // Set fast mode
    const setFastMode = async (enabled: boolean) => {
        if (!user?.id) return

        setFastModeState(enabled)

        const { error } = await supabase
            .from('users')
            .update({ deity_fast_mode: enabled })
            .eq('id', user.id)

        if (error) {
            console.error('Error updating fast mode:', error)
            setFastModeState(!enabled) // Revert
        }
    }

    const refreshProfile = async () => {
        if (user?.id) {
            await loadProfileData(user.id)
        }
    }

    return (
        <ProfileContext.Provider value={{
            profile,
            links,
            contacts,
            experiences,
            qualifications,
            projects,
            products,
            loading,
            updateField,
            addLink,
            updateLink,
            removeLink,
            reorderLinks,
            validateLinks,
            addExperience,
            addProject,
            addQualification,
            addProduct,
            undo,
            canUndo: history.length > 0,
            fastMode,
            setFastMode,
            profileCompleteness,
            refreshProfile
        }}>
            {children}
        </ProfileContext.Provider>
    )
}

export function useProfile() {
    const context = useContext(ProfileContext)
    if (context === undefined) {
        throw new Error('useProfile must be used within a ProfileProvider')
    }
    return context
}
