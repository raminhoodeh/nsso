'use client'

import { useState, useEffect } from 'react'
import CreatePostCard from './CreatePostCard'
import FeedItemCard from './FeedItemCard'
import { useUser } from '@/components/providers/UserProvider'
import GlassCard from '@/components/ui/GlassCard'
import { useUI } from '@/components/providers/UIProvider'
import Skeleton from '@/components/ui/Skeleton'
import { TahoeGlassButton, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface FeedTabProps {
    initialData?: {
        posts: any[]
        nextCursor: string | null
    }
}

export default function FeedTab({ initialData }: FeedTabProps) {
    const { user } = useUser()
    const { setBackgroundDimmed } = useUI()
    const [posts, setPosts] = useState<any[]>(initialData?.posts || [])
    const [loading, setLoading] = useState(!initialData)
    const [cursor, setCursor] = useState<string | null>(initialData?.nextCursor || null)

    // Handle background dimming
    useEffect(() => {
        setBackgroundDimmed(true)
        return () => setBackgroundDimmed(false)
    }, [setBackgroundDimmed])

    const fetchFeed = async (nextCursor?: string) => {
        try {
            const params = new URLSearchParams()
            if (nextCursor) params.set('cursor', nextCursor)

            const res = await fetch(`/api/news-feed?${params.toString()}`)
            if (res.ok) {
                const data = await res.json()
                if (nextCursor) {
                    setPosts(prev => [...prev, ...data.posts])
                } else {
                    setPosts(data.posts)
                }
                setCursor(data.nextCursor)
            }
        } catch (error) {
            console.error('Failed to fetch feed', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (!initialData) {
            fetchFeed()
        }
    }, [initialData])

    const handleNewPost = (post: any) => {
        setPosts(prev => [post, ...prev])
    }

    if (loading) {
        return (
            <div className="space-y-6">
                <GlassCard className="p-6 lg:p-8 relative pt-[48px]">
                    {/* Header Skeleton */}
                    <div className="text-left space-y-2 mb-8">
                        <Skeleton className="h-8 w-48 bg-white/10" />
                        <Skeleton className="h-4 w-64 bg-white/5" />
                    </div>

                    {/* Create Post Skeleton */}
                    <div className="mb-8">
                        <Skeleton className="h-[140px] w-full rounded-2xl bg-white/5" />
                    </div>

                    {/* Feed Items Skeleton */}
                    <div className="space-y-6">
                        {[1, 2].map((i) => (
                            <Skeleton key={i} className="h-[200px] w-full rounded-2xl bg-white/5" />
                        ))}
                    </div>
                </GlassCard>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <GlassCard className="p-6 lg:p-8 relative pt-[48px]">
                {/* Header */}
                <div className="text-left space-y-2 mb-8">
                    <h2 className="text-3xl font-bold text-white">News Feed</h2>
                    <p className="text-white/60">
                        A positive space for professional growth and updates.
                    </p>
                </div>

                {/* Create Post */}
                <div className="mb-8">
                    <CreatePostCard onPostCreated={handleNewPost} />
                </div>

                {/* Feed Items */}
                <div className="space-y-6">
                    {posts.map(post => (
                        <FeedItemCard
                            key={post.id}
                            post={post}
                            currentUserId={user?.id}
                        />
                    ))}

                    {posts.length === 0 && (
                        <TahoeGlassSurface variant="card" radius={16} tone="light" className="py-12" contentClassName="text-center">
                            <p className="text-white/40">No updates yet. Be the first to share something!</p>
                        </TahoeGlassSurface>
                    )}
                </div>

                {/* Load More */}
                {cursor && (
                    <div className="flex justify-center pt-8">
                        <TahoeGlassButton
                            onClick={() => fetchFeed(cursor)}
                            className="px-6 py-2"
                            contentClassName="text-white/75"
                        >
                            Load more activity
                        </TahoeGlassButton>
                    </div>
                )}
            </GlassCard>
        </div>
    )
}
