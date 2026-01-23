export type UserType = 'standard' | 'admin'
export type AuthProvider = 'google' | 'apple' | 'microsoft' | 'github' | 'email'
export type ContactMethod = 'Email' | 'WhatsApp' | 'Phone' | 'Telegram' | 'Location' | 'Other'
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due'

export interface User {
    id: string
    email: string
    auth_provider: AuthProvider
    username: string
    first_name?: string
    last_name?: string
    full_name?: string // Added for compatibility
    avatar_url?: string // Added for compatibility
    user_type: UserType
    is_premium: boolean
    created_at: string
}

export interface Profile {
    user_id: string
    full_name: string | null
    headline: string | null
    bio: string | null
    profile_pic_url: string | null
}

export interface Link {
    id: string
    user_id: string
    link_name: string
    link_url: string
    created_at: string
}

export interface Contact {
    id: string
    user_id: string
    method: ContactMethod
    custom_method_name: string | null
    value: string
    created_at: string
}

export interface Subscription {
    id: string
    user_id: string
    polar_sub_id: string | null
    status: SubscriptionStatus
    created_at: string
}

export interface Experience {
    id: string
    user_id: string
    company_name: string
    job_title: string
    start_year: number
    end_year: number | null // null = 'Present'
    created_at: string
}

export interface Qualification {
    id: string
    user_id: string
    institution: string
    qualification_name: string
    start_year: number
    end_year: number
    created_at: string
}

export interface Project {
    id: string
    user_id: string
    project_name: string
    contribution: string
    description: string | null
    project_photo_url: string | null
    project_url: string | null
    created_at: string
}

export interface Product {
    id: string
    user_id: string
    name: string
    price: string | null
    image_url: string | null
    description: string | null
    purchase_link: string | null
    purchase_link_active: boolean
    paypal_html: string | null
    paypal_active: boolean
    created_at: string
    // Sales Page Fields
    sales_page_active: boolean
    headline?: string
    tagline?: string
    intro_text?: string
    value_proposition?: string
    video_url?: string
    benefits?: string[]
    testimonials?: { name: string; text: string }[]
}

// Combined type for full user profile data
export interface FullUserProfile {
    user: User
    profile: Profile
    links: Link[]
    contacts: Contact[]
    experiences: Experience[]
    qualifications: Qualification[]
    projects: Project[]
    products: Product[]
}

export interface MyNssoConnection {
    id: string
    connectedUserId: string // The ID of the connected user
    username: string
    fullName: string
    headline: string | null
    profilePicUrl: string | null
    dateMet: string
    location: string
    notes: string
}
