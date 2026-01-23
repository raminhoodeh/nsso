import { formatDistanceToNow } from 'date-fns'
import Image from 'next/image'
import GlassCard from '@/components/ui/GlassCard'
import { useState } from 'react'

interface FeedPost {
    id: string
    user_id: string
    type: 'manual' | 'qualification_added' | 'project_added' | 'product_added'
    content: string
    reference_id?: string
    metadata: any
    created_at: string
    user: {
        username: string
        full_name: string
        avatar_url?: string
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
                <div className="relative w-10 h-10 rounded-full overflow-hidden bg-white/10">
                    {post.user.avatar_url ? (
                        <Image
                            src={post.user.avatar_url}
                            alt={post.user.username}
                            fill
                            className="object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-sm font-bold">
                            {post.user.full_name?.charAt(0) || post.user.username?.charAt(0)}
                        </div>
                    )}
                </div>
                <div>
                    <h3 className="text-white font-medium text-sm">
                        {post.user.full_name || post.user.username}
                    </h3>
                    <p className="text-white/40 text-xs">
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                    </p>
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
