"use client";

import { Comment } from '@/lib/types';
import { useState, useEffect } from 'react';
import VoteButtons from './VoteButtons';
import MoreOptionsMenu from './MoreOptionsMenu';
import ReportModal from './moderation/ReportModal';
import { verifyContent, getCachedVerification, cacheVerificationResult } from '@/lib/verification';
import { useAuth } from '@/lib/context/AuthContext';
import { useUser } from '@/lib/context/UserContext';
import { backendJson } from '@/lib/backend';
import { getPrivateKey, signHash, toB64, toHex } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';

interface CommentTreeProps {
  comment: Comment;
  postId: string;
  subredditId: string;
  depth?: number;
}

export default function CommentTree({ comment, postId, subredditId, depth = 0 }: CommentTreeProps) {
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [replies, setReplies] = useState<Comment[]>(comment.replies || []);
  const [isDeleted, setIsDeleted] = useState(comment.isDeleted || false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [displayContent, setDisplayContent] = useState(comment.content || '');
  const [wasEdited, setWasEdited] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);

  // Check if this is the user's own comment
  const isOwnComment = user?._id === (typeof comment.author === 'object' ? comment.author?._id : comment.author);

  // Update isDeleted state when comment prop changes
  useEffect(() => {
    if (comment.isDeleted) {
      setIsDeleted(true);
    }
  }, [comment.isDeleted]);

  // Debug: log when component renders
  useEffect(() => {
    console.log('[CommentTree] Render:', {
      commentId: comment._id,
      content: comment.content?.substring(0, 30),
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      isDifferent: comment.updatedAt !== comment.createdAt,
      wasEditedState: wasEdited,
      isDeleted: comment.isDeleted,
    });
  }, [comment._id, comment.createdAt, comment.updatedAt, wasEdited]);

  useEffect(() => {
    async function verify() {
      const cached = await getCachedVerification(comment._id);
      if (cached) {
        setVerified(cached.verified);
        return;
      }

      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/users/${comment.authorId}`);
        if (!response.ok) return;
        
        const author = await response.json();
        if (!author.publicKey) return;

        const result = await verifyContent(
          {
            contentHash: comment.contentHash,
            userSignature: comment.userSignature,
          },
          author.publicKey
        );

        setVerified(result.verified);
        await cacheVerificationResult(comment._id, result);
      } catch (error) {
        console.error('Verification failed:', error);
      }
    }

    verify();
  }, [comment._id, comment.authorId, comment.contentHash, comment.userSignature]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAuthenticated || !user) {
      localStorage.setItem('intended:comment', JSON.stringify({
        postId,
        parentId: comment._id,
        content: replyContent,
      }));
      window.location.href = '/auth';
      return;
    }

    if (!replyContent.trim()) return;

    setIsSubmitting(true);
    
    try {
      const pk = getPrivateKey();
      if (!pk) throw new Error('No private key');

      // Calculate hash - must match backend canonical format
      const canonical = JSON.stringify({
        content: replyContent.trim(),
        postId,
        parentId: comment._id,
        attachmentIds: [],
        authorId: user._id,
      });
      const hashBytes = await sha256(canonical);
      const contentHash = toHex(hashBytes);

      // Sign
      const sig = signHash(pk, hashBytes);
      const sigB64 = toB64(sig);

      const response = await backendJson('POST', '/comments', {
        postId,
        subredditId,
        parentId: comment._id,
        content: replyContent.trim(),
        authorId: user._id,
        userSignature: sigB64,
        contentHash,
        attachmentIds: [],
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to post reply');
      }

      const newComment = await response.json();
      setReplies([...replies, newComment]);
      setReplyContent('');
      setShowReply(false);
    } catch (error) {
      console.error('Failed to post reply:', error);
      alert(`Failed to post reply: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSave = async () => {
    if (!editContent.trim()) {
      alert('Comment content cannot be empty');
      return;
    }

    setIsSavingEdit(true);
    try {
      console.log('[handleEditSave] Debug:', {
        commentId: comment._id,
        commentAuthorId: comment.author?._id || comment.authorId,
        userContextId: user?._id,
        userObject: user,
      });

      const response = await backendJson('PATCH', `/comments/${comment._id}`, {
        content: editContent.trim(),
        authorId: user?._id,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update comment');
      }

      setDisplayContent(editContent.trim());
      setWasEdited(true);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update comment:', error);
      alert(`Failed to update comment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleEditCancel = () => {
    setEditContent(displayContent);
    setIsEditing(false);
  };

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
      if (interval >= 1) {
        return `${interval}${name[0]} ago`;
      }
    }
    return 'just now';
  };

  if (isDeleted) {
    return (
      <div className={`${depth > 0 ? 'ml-4 border-l-2 border-[var(--border)] pl-4' : ''} py-2`}>
        <div className="flex items-center gap-2">
          <p className="text-sm text-[var(--text-secondary)] italic">[deleted]</p>
          {replies.length > 0 && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
            >
              {collapsed ? `[show ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}]` : '[hide replies]'}
            </button>
          )}
        </div>
        
        {/* Show nested replies even for deleted comments */}
        {!collapsed && replies.length > 0 && (
          <div className="mt-2">
            {replies.map((reply) => (
              <CommentTree
                key={reply._id}
                comment={reply}
                postId={postId}
                subredditId={subredditId}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${depth > 0 ? 'ml-4 border-l-2 border-[var(--border)] pl-4' : ''} py-2`}>
      <div className="flex gap-2">
        {/* Vote Buttons */}
        <VoteButtons
          targetId={comment._id}
          targetType="comment"
          score={comment.score}
          initialVote={0}
        />

        {/* Comment Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="font-semibold hover:underline"
              >
                u/{comment.author?.username || 'unknown'}
              </button>
              <span>•</span>
              <span>{timeAgo(comment.createdAt)}</span>
              {verified !== null && (
                <>
                  <span>•</span>
                  <span
                    className={verified ? 'text-[var(--success)]' : 'text-[var(--error)]'}
                    title={verified ? 'Verified signature' : 'Invalid signature'}
                  >
                    {verified ? '✓' : '✗'}
                  </span>
                </>
              )}
            </div>
            <MoreOptionsMenu
              type="comment"
              id={comment._id}
              authorId={comment.author?._id || (typeof comment.authorId === 'string' ? comment.authorId : comment.authorId?._id || '')}
              onDelete={() => setIsDeleted(true)}
              onEdit={() => setIsEditing(true)}
            />
          </div>

          {/* Content */}
          {!collapsed && (
            <>
              {isEditing ? (
                <div className="mb-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                    rows={4}
                    disabled={isSavingEdit}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={handleEditSave}
                      disabled={isSavingEdit || !editContent.trim()}
                      className="px-4 py-1.5 bg-[var(--primary)] text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isSavingEdit ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={handleEditCancel}
                      disabled={isSavingEdit}
                      className="px-4 py-1.5 border border-[var(--border)] rounded-full text-sm font-medium hover:bg-[var(--muted)] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-[var(--foreground)] whitespace-pre-wrap break-words mb-2">
                  {displayContent}
                  {(wasEdited || (comment.updatedAt && comment.updatedAt !== comment.createdAt)) && (
                    <span className="text-xs text-[var(--text-secondary)] ml-2">(edited)</span>
                  )}
                </div>
              )}

              {/* Actions */}
              {!isEditing && (
                <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                  <button
                    onClick={() => setShowReply(!showReply)}
                    className="hover:text-[var(--foreground)] transition-colors"
                  >
                    Reply
                  </button>
                  <button className="hover:text-[var(--foreground)] transition-colors">
                    Share
                  </button>
                  <button className="hover:text-[var(--foreground)] transition-colors">
                    Save
                  </button>
                  {/* Report Button - Don't show for own comments */}
                  {!isOwnComment && (
                    <button
                      onClick={() => setShowReportModal(true)}
                      className="hover:text-red-500 transition-colors"
                    >
                      Report
                    </button>
                  )}
                  {comment.replyCount > 0 && (
                    <span className="text-[var(--text-secondary)]">
                      {comment.replyCount} {comment.replyCount === 1 ? 'reply' : 'replies'}
                    </span>
                  )}
                </div>
              )}

              {/* Reply Form */}
              {showReply && (
                <form onSubmit={handleReply} className="mt-3">
                  <textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="What are your thoughts?"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
                    rows={3}
                    disabled={isSubmitting}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting || !replyContent.trim()}
                      className="px-4 py-1.5 bg-[var(--primary)] text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      {isSubmitting ? 'Posting...' : 'Reply'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowReply(false)}
                      className="px-4 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Nested Replies */}
              {replies.length > 0 && (
                <div className="mt-3">
                  {replies.map((reply) => (
                    <CommentTree
                      key={reply._id}
                      comment={reply}
                      postId={postId}
                      subredditId={subredditId}
                      depth={depth + 1}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)]"
            >
              [{comment.replyCount} children]
            </button>
          )}
        </div>
      </div>

      {/* Report Modal */}
      <ReportModal
        targetId={comment._id}
        targetType="comment"
        subredditId={subredditId}
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSuccess={() => {
          setShowReportModal(false);
        }}
      />
    </div>
  );
}
