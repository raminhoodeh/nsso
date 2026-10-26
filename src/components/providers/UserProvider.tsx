'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { fetchCurrentAccount } from '@/lib/current-account'
import type { User } from '@/lib/types'

interface UserContextType {
    user: User | null
    loading: boolean
    error: string | null
    refreshUser: () => Promise<void>
}
const UserContext = createContext<UserContextType | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const authSubject = useRef<string | null | undefined>(undefined)
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const supabase = useMemo(() => createClient(), [])
    const generation = useRef(0)
    const currentOwner = useRef<string | null>(null)
    const activeRequest = useRef<AbortController | null>(null)

    const fetchUser = useCallback(async () => {
        const requestGeneration = ++generation.current
        activeRequest.current?.abort()
        const controller = new AbortController()
        activeRequest.current = controller
        try {
            const account = await fetchCurrentAccount(controller.signal)
            if (requestGeneration !== generation.current) return
            currentOwner.current = account?.user.id ?? null
            setUser(account ? { ...account.user, permissions: account.permissions } : null)
            setError(null)
        } catch {
            if (requestGeneration === generation.current && !controller.signal.aborted) {
                // A network failure is not a logout. Keep this identity's draft, while
                // removing UI capabilities; privileged routes still authorize afresh.
                setUser(current => current ? { ...current, permissions: [], user_type: 'standard' } : null)
                setError('Account details could not be refreshed. Your current draft is kept.')
            }
        } finally {
            if (requestGeneration === generation.current) setLoading(false)
        }
    }, [])

    useEffect(() => {
        void fetchUser()
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const nextOwner = session?.user.id ?? null
            const previousSubject = authSubject.current
            authSubject.current = nextOwner
            if (previousSubject !== undefined && previousSubject !== nextOwner && _event !== 'INITIAL_SESSION') queueMicrotask(() => router.refresh())
            if (_event === 'SIGNED_OUT' || nextOwner !== currentOwner.current) {
                ++generation.current
                activeRequest.current?.abort()
                currentOwner.current = nextOwner
                setUser(null)
                setError(null)
                setLoading(Boolean(nextOwner))
            }
            if (nextOwner) queueMicrotask(() => { void fetchUser() })
        })
        return () => {
            ++generation.current
            activeRequest.current?.abort()
            subscription.unsubscribe()
        }
    }, [supabase, fetchUser, router])

    return <UserContext.Provider value={{ user, loading, error, refreshUser: fetchUser }}>
        {children}
        {error && user && <div role="status" className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-white/20 bg-slate-950 px-4 py-3 text-sm text-white shadow-xl">
            <p className="flex-1">{error}</p>
            <button type="button" onClick={() => { void fetchUser() }} className="min-h-11 rounded-xl border border-white/30 px-3">Retry</button>
        </div>}
    </UserContext.Provider>
}

export function useUser() {
    const context = useContext(UserContext)
    if (context === undefined) throw new Error('useUser must be used within a UserProvider')
    return context
}
