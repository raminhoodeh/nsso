'use client'

import { useState } from 'react'
import GlassCard from '@/app/dashboard/components/DashboardGlassCard'
import { useUser } from '@/components/providers/UserProvider'
import { useProfile } from '@/components/providers/ProfileProvider'
import Image from 'next/image'
import { TahoeGlassButton, TahoeGlassField, TahoeGlassSurface } from '@/components/ui/tahoe-glass'

interface CreatePostCardProps {
    onPostCreated: (post: any) => void
}

export default function CreatePostCard({ onPostCreated }: CreatePostCardProps) {
    const { user } = useUser()
    const { profile } = useProfile()
    const [content, setContent] = useState('')
    const [isExpanded, setIsExpanded] = useState(false)
    const [loading, setLoading] = useState(false)

    const avatarUrl = profile?.profile_pic_url || user?.avatar_url
    const displayName = profile?.full_name || user?.full_name || user?.username

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
                // We fake the user relation for optimistic UI if needed
                onPostCreated({
                    ...newPost,
                    user: {
                        username: user?.username,
                        profile: {
                            full_name: displayName,
                            profile_pic_url: avatarUrl
                        }
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
                <TahoeGlassSurface variant="mediaFrame" radius={9999} className="relative h-10 w-10 overflow-hidden flex-shrink-0" contentClassName="block h-full w-full">
                    {avatarUrl ? (
                        <Image
                            src={avatarUrl}
                            alt={user.username || ''}
                            fill
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-sm font-bold">
                            {displayName?.charAt(0)}
                        </div>
                    )}
                </TahoeGlassSurface>

                <div className="flex-1">
                    {!isExpanded ? (
                        <TahoeGlassButton
                            onClick={() => setIsExpanded(true)}
                            className="w-full px-4 py-2.5"
                            contentClassName="w-full justify-start text-left text-white/55 text-sm font-normal"
                        >
                            Share a project idea or update...
                        </TahoeGlassButton>
                    ) : (
                        <div className="space-y-3">
                            <TahoeGlassField tone="light" surfaceClassName="p-0" controlClassName="min-h-[100px] p-4 text-base resize-none">
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    autoFocus
                                    placeholder="What are you working on?"
                                    className="text-white placeholder:text-white/40"
                                />
                            </TahoeGlassField>
                            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                                <TahoeGlassButton
                                    onClick={() => setIsExpanded(false)}
                                    className="px-4 py-1.5"
                                    contentClassName="text-white/70"
                                >
                                    Cancel
                                </TahoeGlassButton>
                                <TahoeGlassButton
                                    onClick={handleSubmit}
                                    disabled={!content.trim() || loading}
                                    className="px-6 py-1.5"
                                    contentClassName="text-white font-semibold"
                                >
                                    {loading ? 'Posting...' : 'Post'}
                                </TahoeGlassButton>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </GlassCard>
    )
}
