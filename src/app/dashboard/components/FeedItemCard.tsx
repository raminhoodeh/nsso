import { formatDistanceToNow } from 'date-fns'
import Image from 'next/image'
import GlassCard from '@/components/ui/GlassCard'
import { useState } from 'react'
import Link from 'next/link'

interface FeedPost {
    id: string
    user_id: string
    type: 'manual' | 'qualification_added' | 'project_added' | 'product_added' | 'daily_summary'
    content: string
    reference_id?: string
    metadata: any
    created_at: string
    user: {
        username: string
        // Profile data from join
        profile: {
            full_name: string | null
            profile_pic_url: string | null
        } | null
    }
    likes: { user_id: string }[]
    _count: {
        feed_comments: number
    }
}

interface FeedItemCardProps {
    post: FeedPost
    currentUserId?: string
}

interface Comment {
    id: string
    content: string
    created_at: string
    user: {
        username: string
        full_name: string
        avatar_url?: string
    }
}

function toTitleCase(str: string) {
    if (!str) return ''
    return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

export default function FeedItemCard({ post, currentUserId }: FeedItemCardProps) {
    const [liked, setLiked] = useState(post.likes.some(l => l.user_id === currentUserId))
    const [likeCount, setLikeCount] = useState(post.likes.length)

    // Comments State
    const [showComments, setShowComments] = useState(false)
    const [comments, setComments] = useState<Comment[]>([])
    const [commentsLoading, setCommentsLoading] = useState(false)
    const [commentCount, setCommentCount] = useState(post._count?.feed_comments || 0)
    const [newComment, setNewComment] = useState('')
    const [submittingComment, setSubmittingComment] = useState(false)

    // Helper data extraction
    // Handle array or object just in case PostgREST behaves differently
    // user:users!user_id (...) -> profile:profiles(...)
    // If it's a 1-to-1 relationship, likely an object. If not, array.
    // Creating a safe getter.
    const getProfile = () => {
        const p = post.user.profile as any
        if (Array.isArray(p)) return p[0]
        return p
    }
    const profileData = getProfile()

    const displayName = profileData?.full_name ? toTitleCase(profileData.full_name) : post.user.username
    const avatar = profileData?.profile_pic_url
    const username = post.user.username

    const handleLike = async () => {
        // Optimistic update
        const newLiked = !liked
        setLiked(newLiked)
        setLikeCount(prev => newLiked ? prev + 1 : prev - 1)

        try {
            await fetch(`/api/news-feed/${post.id}/like`, { method: newLiked ? 'POST' : 'DELETE' })
        } catch (error) {
            // Revert
            setLiked(!newLiked)
            setLikeCount(prev => newLiked ? prev - 1 : prev + 1)
        }
    }

    const toggleComments = async () => {
        if (!showComments && comments.length === 0) {
            setCommentsLoading(true)
            try {
                const res = await fetch(`/api/news-feed/${post.id}/comments`)
                if (res.ok) {
                    const data = await res.json()
                    setComments(data)
                }
            } catch (error) {
                console.error('Failed to load comments', error)
            } finally {
                setCommentsLoading(false)
            }
        }
        setShowComments(!showComments)
    }

    const handlePostComment = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newComment.trim()) return

        setSubmittingComment(true)
        try {
            const res = await fetch(`/api/news-feed/${post.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newComment }),
            })

            if (res.ok) {
                const comment = await res.json()
                setComments(prev => [...prev, comment])
                setCommentCount(prev => prev + 1)
                setNewComment('')
            }
        } catch (error) {
            console.error('Failed to post comment', error)
        } finally {
            setSubmittingComment(false)
        }
    }

    const renderContent = () => {
        switch (post.type) {
            case 'daily_summary':
                return (
                    <div className="mt-2 space-y-3">
                        {post.metadata.qualifications?.length > 0 && (
                            <div className="bg-white/5 rounded-xl border border-white/10 p-3">
                                <h5 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">Qualifications</h5>
                                <div className="space-y-2">
                                    {post.metadata.qualifications.map((q: any, i: number) => (
                                        <div key={i} className="flex gap-2 items-start">
                                            <div className="w-1 h-1 rounded-full bg-blue-400 mt-2 shrink-0" />
                                            <div>
                                                <div className="text-white font-medium text-sm">{q.qualification_name}</div>
                                                <div className="text-white/40 text-xs">{q.institution}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {post.metadata.projects?.length > 0 && (
                            <div className="bg-white/5 rounded-xl border border-white/10 p-3">
                                <h5 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">New Projects</h5>
                                <div className="grid grid-cols-2 gap-2">
                                    {post.metadata.projects.map((p: any, i: number) => (
                                        <div key={i} className="bg-black/20 rounded-lg p-2">
                                            {p.project_photo_url && (
                                                <div className="relative w-full h-20 rounded-md overflow-hidden mb-2">
                                                    <Image src={p.project_photo_url} alt={p.project_name} fill className="object-cover" unoptimized />
                                                </div>
                                            )}
                                            <div className="text-white font-medium text-sm truncate">{p.project_name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {post.metadata.products?.length > 0 && (
                            <div className="bg-white/5 rounded-xl border border-white/10 p-3">
                                <h5 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-2">New Products</h5>
                                <div className="space-y-2">
                                    {post.metadata.products.map((p: any, i: number) => (
                                        <div key={i} className="flex gap-3 items-center bg-black/20 p-2 rounded-lg">
                                            {p.image_url && (
                                                <div className="relative w-10 h-10 rounded overflow-hidden shrink-0">
                                                    <Image src={p.image_url} alt={p.name} fill className="object-cover" unoptimized />
                                                </div>
                                            )}
                                            <div>
                                                <div className="text-white font-medium text-sm">{p.name}</div>
                                                <div className="text-emerald-400 text-xs">{p.price}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )

            case 'qualification_added':
                return (
                    <div className="mt-2 p-4 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/20 rounded-lg">
                                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path d="M12 14l9-5-9-5-9 5 9 5z" />
                                    <path d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-sm text-white/60">New Qualification</p>
                                <h4 className="text-white font-semibold">{post.metadata.qualification_name}</h4>
                                <p className="text-sm text-white/40">{post.metadata.institution}</p>
                            </div>
                        </div>
                    </div>
                )
            case 'project_added':
                return (
                    <div className="mt-2 rounded-xl overflow-hidden border border-white/10 bg-white/5">
                        {post.metadata.project_photo_url && (
                            <div className="relative h-48 w-full">
                                <Image
                                    src={post.metadata.project_photo_url}
                                    alt={post.metadata.project_name}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            </div>
                        )}
                        <div className="p-4">
                            <p className="text-sm text-white/60">Launched a Project</p>
                            <h4 className="text-white font-bold text-lg">{post.metadata.project_name}</h4>
                            <p className="text-white/80 mt-1 line-clamp-3">{post.metadata.description}</p>
                        </div>
                    </div>
                )
            case 'product_added':
                return (
                    <div className="mt-2 flex gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                        {post.metadata.image_url && (
                            <div className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0">
                                <Image
                                    src={post.metadata.image_url}
                                    alt={post.metadata.name}
                                    fill
                                    className="object-cover"
                                    unoptimized
                                />
                            </div>
                        )}
                        <div>
                            <p className="text-sm text-white/60">New Service / Product</p>
                            <h4 className="text-white font-bold">{post.metadata.name}</h4>
                            {post.metadata.price && (
                                <p className="text-emerald-400 font-medium">{post.metadata.price}</p>
                            )}
                        </div>
                    </div>
                )
            default:
                return <p className="text-white/90 whitespace-pre-wrap">{post.content}</p>
        }
    }

    return (
        <GlassCard className="p-4 hover:bg-white/5 transition-colors">
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
                <Link href={`/${username}`} className="relative w-10 h-10 rounded-full overflow-hidden bg-white/10 shrink-0 hover:ring-2 ring-white/20 transition-all">
                    {avatar ? (
                        <Image
                            src={avatar}
                            alt={username}
                            fill
                            className="object-cover"
                            unoptimized
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-sm font-bold">
                            {displayName.charAt(0)}
                        </div>
                    )}
                </Link>
                <div>
                    <Link href={`/${username}`} className="block group">
                        <h3 className="text-white font-medium text-sm group-hover:underline decoration-white/50">
                            {displayName}
                        </h3>
                    </Link>
                    <div className="flex items-center gap-2">
                        <Link href={`/${username}`} className="text-white/40 text-xs hover:text-white/60 hover:underline">
                            @{username}
                        </Link>
                        <span className="text-white/20 text-xs">•</span>
                        <p className="text-white/40 text-xs">
                            {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="mb-4">
                {renderContent()}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-6 pt-3 border-t border-white/10">
                <button
                    onClick={handleLike}
                    className={`flex items-center gap-2 text-sm transition-colors ${liked ? 'text-pink-500' : 'text-white/40 hover:text-white/60'
                        }`}
                >
                    <svg
                        className={`w-5 h-5 ${liked ? 'fill-current' : 'none'}`}
                        fill={liked ? 'currentColor' : 'none'}
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={liked ? 0 : 2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    <span>{likeCount > 0 ? likeCount : 'Love'}</span>
                </button>

                <button
                    onClick={toggleComments}
                    className={`flex items-center gap-2 text-sm transition-colors ${showComments ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span>{commentCount > 0 ? commentCount : 'Comment'}</span>
                </button>
            </div>

            {/* Comments Section */}
            {showComments && (
                <div className="mt-4 pt-4 border-t border-white/10 space-y-4 animate-in fade-in slide-in-from-top-2">
                    {commentsLoading ? (
                        <div className="flex justify-center p-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white/60"></div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {comments.map((comment) => (
                                <div key={comment.id} className="flex gap-3">
                                    <div className="relative w-8 h-8 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                                        {comment.user.avatar_url ? (
                                            <Image
                                                src={comment.user.avatar_url}
                                                alt={comment.user.username}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-white/40 text-xs font-bold">
                                                {comment.user.full_name?.charAt(0) || comment.user.username?.charAt(0)}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="bg-white/5 rounded-2xl rounded-tl-none p-3 border border-white/5">
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className="text-sm font-semibold text-white/90">
                                                    {comment.user.full_name || comment.user.username}
                                                </span>
                                                <span className="text-[10px] text-white/30">
                                                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                                </span>
                                            </div>
                                            <p className="text-sm text-white/80">{comment.content}</p>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Add Comment Input */}
                            <form onSubmit={handlePostComment} className="flex gap-3 mt-4">
                                <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Write a comment..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 focus:bg-white/10 transition-colors"
                                />
                                <button
                                    type="submit"
                                    disabled={!newComment.trim() || submittingComment}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-sm font-medium text-white transition-colors"
                                >
                                    Post
                                </button>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </GlassCard>
    )
}
