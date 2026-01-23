'use client'

import { useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import { useUser } from '@/components/providers/UserProvider'
import Image from 'next/image'

interface CreatePostCardProps {
    onPostCreated: (post: any) => void
}

export default function CreatePostCard({ onPostCreated }: CreatePostCardProps) {
    const { user } = useUser()
    const [content, setContent] = useState('')
    const [isExpanded, setIsExpanded] = useState(false)
    const [loading, setLoading] = useState(false)

    const handleSubmit = async () => {
        if (!content.trim()) return

        setLoading(true)
        try {
            const response = await fetch('/api/news-feed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            })

            if (response.ok) {
                const newPost = await response.json()
                // The API returns the post, but might be missing relations (user)
                // We fake the user relation for optimistic UI if needed, or better, 
                // expected the API to return fully hydrated object or re-fetch.
                // For simplicity, let's assume parent will refetch or we construct a basic object
                onPostCreated({
                    ...newPost,
                    user: {
                        username: user?.username,
                        full_name: user?.full_name,
                        avatar_url: user?.avatar_url
                    },
                    likes: [],
                    _count: { feed_comments: 0 }
                })
                setContent('')
                setIsExpanded(false)
            }
        } catch (error) {
            console.error('Failed to post', error)
        } finally {
            setLoading(false)
        }
    }

    if (!user) return null

    return (
        <GlassCard className="p-4 mb-6">
            <div className="flex gap-4">
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                    {user.avatar_url ? (
                        <Image
                            src={user.avatar_url}
                            alt={user.username || ''}
                            fill
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-sm font-bold">
                            {user.full_name?.charAt(0) || user.username?.charAt(0)}
                        </div>
                    )}
                </div>

                <div className="flex-1">
                    {!isExpanded ? (
                        <button
                            onClick={() => setIsExpanded(true)}
                            className="w-full text-left px-4 py-2.5 rounded-full bg-white/5 text-white/40 hover:bg-white/10 transition-colors text-sm"
                        >
                            Share a project idea or update...
                        </button>
                    ) : (
                        <div className="space-y-3">
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                autoFocus
                                placeholder="What are you working on?"
                                className="w-full bg-transparent border-none text-white placeholder:text-white/40 focus:ring-0 resize-none min-h-[100px] p-0 text-base"
                            />
                            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                                <button
                                    onClick={() => setIsExpanded(false)}
                                    className="px-4 py-1.5 text-sm text-white/60 hover:text-white transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={!content.trim() || loading}
                                    className="px-6 py-1.5 bg-white text-black text-sm font-semibold rounded-full hover:bg-white/90 disabled:opacity-50 transition-colors"
                                >
                                    {loading ? 'Posting...' : 'Post'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </GlassCard>
    )
}
