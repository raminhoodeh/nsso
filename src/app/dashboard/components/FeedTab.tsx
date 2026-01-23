'use client'

import { useState, useEffect } from 'react'
import CreatePostCard from './CreatePostCard'
import FeedItemCard from './FeedItemCard'
import { useUser } from '@/components/providers/UserProvider'

export default function FeedTab() {
    const { user } = useUser()
    const [posts, setPosts] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [cursor, setCursor] = useState<string | null>(null)

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
            <div className="flex justify-center pt-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
        )
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6 pb-20">
            {/* Header / Intro */}
            <div className="text-center mb-8 pt-8">
                <h2 className="text-3xl font-bold text-white mb-2">News Feed</h2>
                <p className="text-white/60">
                    A positive space for professional growth and updates.
                </p>
            </div>

            {/* Create Post */}
            <CreatePostCard onPostCreated={handleNewPost} />

            {/* Feed Items */}
            <div className="space-y-4">
                {posts.map(post => (
                    <FeedItemCard
                        key={post.id}
                        post={post}
                        currentUserId={user?.id}
                    />
                ))}

                {posts.length === 0 && (
                    <div className="text-center py-10 text-white/40">
                        <p>No updates yet. Be the first to post!</p>
                    </div>
                )}
            </div>

            {/* Load More */}
            {cursor && (
                <div className="flex justify-center pt-4">
                    <button
                        onClick={() => fetchFeed(cursor)}
                        className="text-white/60 hover:text-white text-sm"
                    >
                        Load more activity
                    </button>
                </div>
            )}
        </div>
    )
}
