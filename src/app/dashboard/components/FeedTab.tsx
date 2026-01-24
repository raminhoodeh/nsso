'use client'

import { useState, useEffect } from 'react'
import CreatePostCard from './CreatePostCard'
import FeedItemCard from './FeedItemCard'
import { useUser } from '@/components/providers/UserProvider'
import GlassCard from '@/components/ui/GlassCard'
import { useUI } from '@/components/providers/UIProvider'

export default function FeedTab() {
    const { user } = useUser()
    const { setBackgroundDimmed } = useUI()
    const [posts, setPosts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [cursor, setCursor] = useState<string | null>(null)

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
        fetchFeed()
    }, [])

    const handleNewPost = (post: any) => {
        setPosts(prev => [post, ...prev])
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-white text-xl text-center">
                    Loading your professional world...
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <GlassCard className="p-6 lg:p-8">
                {/* Header */}
                <div className="text-left space-y-2 mb-8 pt-2">
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
                        <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl bg-white/5">
                            <p className="text-white/40">No updates yet. Be the first to share something!</p>
                        </div>
                    )}
                </div>

                {/* Load More */}
                {cursor && (
                    <div className="flex justify-center pt-8">
                        <button
                            onClick={() => fetchFeed(cursor)}
                            className="px-6 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all text-sm"
                        >
                            Load more activity
                        </button>
                    </div>
                )}
            </GlassCard>
        </div>
    )
}
