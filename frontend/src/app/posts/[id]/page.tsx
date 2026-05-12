"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Post, Comment } from "@/lib/types";
import { backendFetch, backendJson } from "@/lib/backend";
import VoteButtons from "@/components/VoteButtons";
import CommentTree from "@/components/CommentTree";
import MoreOptionsMenu from "@/components/MoreOptionsMenu";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import ShareButton from "@/components/ShareButton";
import ReportModal from "@/components/moderation/ReportModal";
import { useAuth } from "@/lib/context/AuthContext";
import { useUser } from "@/lib/context/UserContext";
import { getPrivateKey, signHash, toB64, toHex } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { StoredAcknowledgement, getAcknowledgementsByContentId } from "@/lib/indexeddb";
import { downloadProof } from "@/lib/proofVerification";
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
  const [isSaved, setIsSaved] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [hasProof, setHasProof] = useState(false);
  const [proofData, setProofData] = useState<StoredAcknowledgement | null>(null);

  // Get attachments array (populated by backend with viewUrls)
  const attachments = (post as any)?.attachments || [];

  // Check if current user is the post author
  const postAuthorId = post?.author?._id || post?.authorId;
  const currentUserId = user?._id;
  const isOwnPost = currentUserId && postAuthorId && String(currentUserId) === String(postAuthorId);

  // Get subreddit ID for reporting
  const subredditId = typeof post?.subreddit === 'object'
    ? post?.subreddit?._id
    : typeof post?.subredditId === 'string'
      ? post.subredditId
      : post?.subredditId?._id;

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

  // Check if post is saved
  useEffect(() => {
    async function checkSaved() {
      if (!isAuthenticated || !id) return;
      
      try {
        const res = await backendFetch(`/users/me/is-saved/${id}`);
        if (res.ok) {
          const data = await res.json();
          setIsSaved(data.saved);
        }
      } catch (error) {
        console.error('Failed to check saved status:', error);
      }
    }

    checkSaved();
  }, [id, isAuthenticated]);

  // Check if post has proof in IndexedDB
  useEffect(() => {
    async function checkProof() {
      if (!isOwnPost || !id) return;

      try {
        const acknowledgements = await getAcknowledgementsByContentId(id);
        const proofAck = acknowledgements.find(
          (ack) => ack.proofHash && ack.proofSignature
        );

        if (proofAck) {
          setHasProof(true);
          setProofData(proofAck);
        }
      } catch (error) {
        console.error('[PostPage] Error checking proof:', error);
      }
    }

    checkProof();
  }, [id, isOwnPost]);

  // Save/unsave handler
  const handleSaveToggle = async () => {
    if (!isAuthenticated) {
      alert('Please log in to save posts');
      return;
    }

    setSavingPost(true);
    
    try {
      if (isSaved) {
        // Unsave
        const res = await backendFetch('/users/me/unsave', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetId: id,
            targetType: 'post',
          }),
        });

        if (res.ok) {
          setIsSaved(false);
        } else {
          alert('Failed to unsave post');
        }
      } else {
        // Save
        const res = await backendFetch('/users/me/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetId: id,
            targetType: 'post',
          }),
        });

        if (res.ok) {
          setIsSaved(true);
        } else {
          alert('Failed to save post');
        }
      }
    } catch (error) {
      console.error('Save/unsave error:', error);
      alert('Failed to save/unsave post');
    } finally {
      setSavingPost(false);
    }
  };

  // Download proof handler
  const handleDownloadProof = () => {
    if (!proofData) {
      alert('No proof data available');
      return;
    }

    downloadProof({
      userId: proofData.userId,
      postId: proofData.contentId,
      proofHash: proofData.proofHash,
      proofSignature: proofData.proofSignature,
      serverPublicKey: proofData.serverPublicKey,
      postTitle: proofData.postTitle,
      createdAt: proofData.createdAt,
    });
  };

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
                  authorId={post.author?._id || (typeof post.authorId === 'string' ? post.authorId : post.authorId?._id || '')}
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

              {/* Image/Video - Support Multiple Attachments */}
              {(post.type === 'image' || post.type === 'video') && attachments && attachments.length > 0 && (
                <div className="mb-4 space-y-2">
                  {attachments.map((attachment: any, index: number) => (
                    <div key={attachment._id || index} className="rounded-md overflow-hidden">
                      {post.type === 'image' && attachment.viewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={attachment.viewUrl}
                          alt={`${post.title} - Image ${index + 1}`}
                          className="w-full h-auto"
                        />
                      )}
                      {post.type === 'video' && attachment.viewUrl && (
                        <video
                          src={attachment.viewUrl}
                          controls
                          className="w-full h-auto"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 sm:gap-4 mt-4 text-xs text-[var(--text-secondary)] flex-wrap border-t border-[var(--border)] pt-3">
                <div className="flex items-center gap-1">
                  <ShareButton
                    title={post.title}
                    url={`${typeof window !== 'undefined' ? window.location.origin : ''}/posts/${post._id}`}
                    text={post.title}
                  />
                </div>

                <button
                  onClick={handleSaveToggle}
                  disabled={savingPost}
                  className={`flex items-center gap-1 hover:bg-[var(--muted)] px-2 py-1 rounded transition-colors ${
                    isSaved ? 'text-[var(--primary)]' : ''
                  } ${savingPost ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <svg 
                    className="w-5 h-5" 
                    fill={isSaved ? 'currentColor' : 'none'}
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  <span>{isSaved ? 'Saved' : 'Save'}</span>
                </button>

                {/* Download Proof Button - Only show for own posts with proof */}
                {isOwnPost && hasProof && (
                  <button
                    onClick={handleDownloadProof}
                    className="flex items-center gap-1 hover:bg-[var(--muted)] px-2 py-1 rounded transition-colors text-purple-500 hover:text-purple-600"
                    title="Download ownership proof"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <span>Proof</span>
                  </button>
                )}

                {/* Report Button - Don't show for own posts */}
                {!isOwnPost && (
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="flex items-center gap-1 hover:bg-[var(--muted)] px-2 py-1 rounded transition-colors text-red-500 hover:text-red-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                    </svg>
                    <span>Report</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Report Modal */}
        {subredditId && (
          <ReportModal
            targetId={post._id}
            targetType="post"
            subredditId={subredditId}
            isOpen={showReportModal}
            onClose={() => setShowReportModal(false)}
            onSuccess={() => {
              setShowReportModal(false);
            }}
          />
        )}

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
