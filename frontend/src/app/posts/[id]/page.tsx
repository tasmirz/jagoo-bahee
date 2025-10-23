"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Post, Comment } from "@/lib/types";
import { backendFetch, backendJson } from "@/lib/backend";
import VoteButtons from "@/components/VoteButtons";
import CommentTree from "@/components/CommentTree";
import MoreOptionsMenu from "@/components/MoreOptionsMenu";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import { useAuth } from "@/lib/context/AuthContext";
import { useUser } from "@/lib/context/UserContext";
import { getPrivateKey, signHash, toB64, toHex } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import Link from "next/link";

// Helper to safely extract subreddit name
function getSubredditName(post: Post): string {
  if (typeof post.subreddit === 'object' && post.subreddit?.name) {
    return post.subreddit.name;
  }
  if (typeof post.subredditId === 'string') {
    return post.subredditId;
  }
  if (typeof post.subredditId === 'object' && post.subredditId !== null) {
    // If subredditId is also populated as an object
    return (post.subredditId as any).name || (post.subredditId as any)._id || 'unknown';
  }
  return 'unknown';
}

export default function PostPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentContent, setCommentContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch post
        const postRes = await backendFetch(`/posts/${id}`);
        if (!postRes.ok) throw new Error('Post not found');
        const postData = await postRes.json();
        setPost(postData);

        // Fetch comments
        const commentsRes = await backendFetch(`/comments?postId=${id}`);
        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          setComments(Array.isArray(commentsData) ? commentsData : commentsData.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch:', error);
        setPost(null);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  // Fetch attachment presigned URL
  useEffect(() => {
    async function fetchAttachmentUrl() {
      if (!post?.attachmentIds || post.attachmentIds.length === 0) return;

      try {
        const presignedResponse = await backendFetch(`/attachments/${post.attachmentIds[0]}/presigned-get`);
        if (presignedResponse.ok) {
          const { url } = await presignedResponse.json();
          setAttachmentUrl(url);
        }
      } catch (error) {
        console.error('[PostPage] Error fetching attachment URL:', error);
      }
    }

    fetchAttachmentUrl();
  }, [post?.attachmentIds]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAuthenticated || !user) {
      alert('Please log in to comment');
      return;
    }

    if (!commentContent.trim()) return;
    
    if (!post || !post.subredditId) {
      alert('Post data not loaded yet');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const pk = getPrivateKey();
      if (!pk) throw new Error('No private key');
      
      // Extract subreddit ID from post
      const subredditId = typeof post.subredditId === 'string' 
        ? post.subredditId 
        : (post.subredditId as any)?._id || '';

      // Calculate hash according to backend canonical format
      const canonical = JSON.stringify({
        content: commentContent.trim(),
        postId: id,
        parentId: null,
        attachmentIds: [],
        authorId: user._id,
      });
      const hashBytes = await sha256(canonical);
      const contentHash = toHex(hashBytes);

      // Sign
      const sig = signHash(pk, hashBytes);
      const sigB64 = toB64(sig);

      const response = await backendFetch('/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postId: id,
          subredditId: subredditId,
          content: commentContent.trim(),
          authorId: user._id,
          userSignature: sigB64,
          contentHash,
          attachmentIds: [],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to post comment');
      }

      const newComment = await response.json();
      setComments([newComment, ...comments]);
      setCommentContent('');
    } catch (error) {
      console.error('Failed to post comment:', error);
      alert(`Failed to post comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Post not found</h2>
          <Link href="/" className="text-[var(--primary)] hover:underline">
            Go back home
          </Link>
        </div>
      </div>
    );
  }

  const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };
    for (const [name, secondsInInterval] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInInterval);
      if (interval >= 1) return `${interval}${name[0]} ago`;
    }
    return 'just now';
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Post Card */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-md">
          <div className="flex gap-3 p-4">
            {/* Vote Buttons */}
            <VoteButtons
              targetId={post._id}
              targetType="post"
              score={post.score}
              initialVote={0}
            />

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Header */}
              <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Link
                    href={`/r/${getSubredditName(post)}`}
                    className="font-semibold hover:underline"
                  >
                    r/{getSubredditName(post)}
                  </Link>
                  <span>•</span>
                  <span>Posted by u/{post.author?.username || 'unknown'}</span>
                  <span>•</span>
                  <span>{timeAgo(post.createdAt)}</span>
                </div>
                <MoreOptionsMenu
                  type="post"
                  id={post._id}
                  authorId={post.author?._id || post.authorId}
                  onDelete={() => router.push('/')}
                  onEdit={() => {
                    setEditContent(post.content || '');
                    setIsEditing(true);
                  }}
                />
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-[var(--foreground)] mb-3">
                {post.title}
              </h1>

              {/* Content */}
              {post.content && !isEditing && (
                <div className="text-[var(--foreground)] mb-4">
                  <MarkdownRenderer content={post.content} />
                </div>
              )}

              {/* Edit Mode */}
              {isEditing && (
                <div className="mb-4 p-4 border border-[var(--border)] rounded-md bg-[var(--muted)]">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Edit your post... (Markdown supported)"
                    className="w-full px-4 py-3 border border-[var(--border)] rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                    rows={6}
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 bg-[var(--primary)] text-white rounded-full font-medium hover:opacity-90 transition-opacity"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Link */}
              {post.type === 'link' && post.url && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--primary)] hover:underline mb-4 block"
                >
                  {post.url}
                </a>
              )}

              {/* Image/Video */}
              {(post.type === 'image' || post.type === 'video') && post.attachmentIds && post.attachmentIds.length > 0 && (
                <div className="mb-4 rounded-md overflow-hidden">
                  {post.type === 'image' && attachmentUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachmentUrl}
                      alt={post.title}
                      className="w-full h-auto"
                    />
                  )}
                  {post.type === 'video' && attachmentUrl && (
                    <video
                      src={attachmentUrl}
                      controls
                      className="w-full h-auto"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Comment Form */}
        <div className="mt-4 bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
          <form onSubmit={handleCommentSubmit}>
            <textarea
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              placeholder="What are your thoughts?"
              className="w-full px-4 py-3 border border-[var(--border)] rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              rows={4}
              disabled={isSubmitting}
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={isSubmitting || !commentContent.trim()}
                className="px-6 py-2 bg-[var(--primary)] text-white rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isSubmitting ? 'Posting...' : 'Comment'}
              </button>
            </div>
          </form>
        </div>

        {/* Comments */}
        <div className="mt-4 bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
          <h2 className="text-lg font-semibold mb-4">
            Comments ({comments.length})
          </h2>
          
          {comments.length === 0 ? (
            <p className="text-[var(--text-secondary)] text-center py-8">
              No comments yet. Be the first to comment!
            </p>
          ) : (
            <div className="space-y-4">
              {comments.filter(c => !c.parentId).map((comment) => (
                <CommentTree
                  key={comment._id}
                  comment={comment}
                  postId={post._id}
                  subredditId={typeof post.subredditId === 'string' ? post.subredditId : (post.subredditId as any)?._id || ''}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
