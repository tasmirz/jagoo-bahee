"use client";

import { Post } from '@/lib/types';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { verifyContent, getCachedVerification, cacheVerificationResult, fetchPublicKey } from '@/lib/verification';
import { StoredAcknowledgement, getAcknowledgementsByContentId } from '@/lib/indexeddb';
import { sha256 } from '@/lib/crypto';
import { toHex } from '@/lib/auth';
import { useUser } from '@/lib/context/UserContext';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import { downloadProof } from '@/lib/proofVerification';
import VoteButtons from './VoteButtons';
import ShareButton from './ShareButton';
import MoreOptionsMenu from './MoreOptionsMenu';
import MarkdownRenderer from './MarkdownRenderer';
import ReportModal from './moderation/ReportModal';

interface PostCardProps {
  post: Post;
}

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

export default function PostCard({ post }: PostCardProps) {
  const { user } = useUser();
  const { isAuthenticated } = useAuth();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [hasProof, setHasProof] = useState(false);
  const [proofData, setProofData] = useState<StoredAcknowledgement | null>(null);

  // Get attachments array (populated by backend with viewUrls)
  const attachments = (post as any).attachments || [];

  // Check if current user is the post author
  const postAuthorId = post.author?._id || post.authorId;
  const currentUserId = user?._id;
  const isOwnPost = currentUserId && postAuthorId && String(currentUserId) === String(postAuthorId);

  // Get subreddit ID for reporting
  const subredditId = typeof post.subreddit === 'object'
    ? post.subreddit?._id
    : typeof post.subredditId === 'string'
      ? post.subredditId
      : post.subredditId?._id;

  // Debug logging for post data
  useEffect(() => {
    console.log('[PostCard] Post data:', {
      _id: post._id,
      authorId: post.authorId,
      authorIdType: typeof post.authorId,
      author: post.author?.username,
    });
  }, [post._id, post.authorId, post.author?.username]);

  // Check if post is saved
  useEffect(() => {
    async function checkSaved() {
      if (!isAuthenticated) return;
      
      try {
        const res = await backendFetch(`/users/me/is-saved/${post._id}`);
        if (res.ok) {
          const data = await res.json();
          setIsSaved(data.saved);
        }
      } catch (error) {
        console.error('Failed to check saved status:', error);
      }
    }

    checkSaved();
  }, [post._id, isAuthenticated]);

  // Check if post has proof in IndexedDB
  useEffect(() => {
    async function checkProof() {
      if (!isOwnPost) return;

      try {
        const acknowledgements = await getAcknowledgementsByContentId(post._id);
        const proofAck = acknowledgements.find(
          (ack) => ack.proofHash && ack.proofSignature
        );

        if (proofAck) {
          setHasProof(true);
          setProofData(proofAck);
          console.log('[PostCard] Proof found for post:', post._id);
        }
      } catch (error) {
        console.error('[PostCard] Error checking proof:', error);
      }
    }

    checkProof();
  }, [post._id, isOwnPost]);

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
            targetId: post._id,
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
            targetId: post._id,
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

  useEffect(() => {
    async function verify() {
      console.log('[PostCard] Starting verification for post:', post._id);
      
      // Skip if no content hash or signature
      if (!post.contentHash || !post.userSignature) {
        console.log('[PostCard] Skipping verification - missing hash or signature:', {
          hasHash: !!post.contentHash,
          hasSignature: !!post.userSignature,
        });
        setVerified(null);
        return;
      }

      // Check cache first
      const cached = await getCachedVerification(post._id);
      if (cached) {
        console.log('[PostCard] Using cached verification result:', cached.verified);
        setVerified(cached.verified);
        return;
      }

      // Get author ID (handle both populated and unpopulated)
      const authorId = post.author?._id || post.authorId;
      if (!authorId) {
        console.warn('[PostCard] No author ID found for post:', post._id);
        return;
      }
      console.log('[PostCard] Author ID:', authorId);

      try {
        // Step 1: Reconstruct the canonical payload that was hashed
        // This must match exactly what was done during post creation
        const payload: any = {
          type: post.type,
          title: post.title.trim(),
          subredditId: typeof post.subreddit === 'object' && post.subreddit?._id 
            ? post.subreddit._id 
            : post.subredditId,
          authorId: String(authorId),
        };

        // Add optional fields based on type (matching create logic)
        if (post.type !== "link") {
          if (post.content?.trim()) payload.content = post.content.trim();
          // IMPORTANT: Use raw ObjectId strings, not populated objects
          if (post.attachmentIds && post.attachmentIds.length > 0) {
            payload.attachmentIds = post.attachmentIds.map((att: any) => {
              // If populated (has _id property), extract just the _id
              if (typeof att === 'object' && att._id) {
                return String(att._id);
              }
              // Otherwise use as-is (already a string ID)
              return String(att);
            });
          }
        }

        if (post.type === "link" && post.url?.trim()) {
          payload.url = post.url.trim();
        }

        if (post.flairText) {
          payload.flair = post.flairText;
        }

        console.log('[PostCard] Reconstructed payload:', payload);

        // Step 2: Calculate hash from the canonical payload
        const canonical = JSON.stringify(payload);
        console.log('[PostCard] Canonical JSON:', canonical);
        
        const hashBytes = await sha256(canonical);
        const calculatedHash = toHex(hashBytes);
        console.log('[PostCard] Hash comparison:', {
          calculated: calculatedHash,
          stored: post.contentHash,
          match: calculatedHash === post.contentHash,
        });

        // Step 3: Verify the calculated hash matches the stored hash
        if (calculatedHash !== post.contentHash) {
          console.error('[PostCard] ❌ Content hash mismatch!', {
            postId: post._id,
            calculated: calculatedHash,
            stored: post.contentHash,
            payload,
            canonical,
          });
          setVerified(false);
          await cacheVerificationResult(post._id, {
            verified: false,
            contentHash: calculatedHash,
            error: 'Content hash mismatch - content may have been tampered with',
          });
          return;
        }
        console.log('[PostCard] ✓ Hash matches!');

        // Step 4: Fetch public key using cached function
        const publicKey = await fetchPublicKey(String(authorId));
        if (!publicKey) {
          console.warn('[PostCard] ❌ No public key found for author:', authorId);
          setVerified(false);
          return;
        }
        console.log('[PostCard] ✓ Public key fetched:', publicKey.substring(0, 20) + '...');

        // Step 5: Verify the secp256k1 signature against the content hash
        // The contentHash was signed with the author's private key
        // We verify it using the author's public key
        console.log('[PostCard] Verifying signature...');
        const result = await verifyContent(
          {
            contentHash: post.contentHash,
            userSignature: post.userSignature,
          },
          publicKey
        );

        console.log('[PostCard] Signature verification result:', {
          verified: result.verified,
          error: result.error,
        });

        setVerified(result.verified);
        await cacheVerificationResult(post._id, result);
        
        if (result.verified) {
          console.log('[PostCard] ✅ POST VERIFIED!');
        } else {
          console.log('[PostCard] ❌ Signature verification failed');
        }
      } catch (error) {
        console.warn('[PostCard] ❌ Verification exception:', error);
        setVerified(false);
      }
    }

    verify();
  }, [post._id, post.authorId, post.author?._id, post.contentHash, post.userSignature, post.type, post.title, post.content, post.url, post.attachmentIds, post.flairText, post.subreddit, post.subredditId]);

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

  return (
    <div className={`bg-[var(--card)] border rounded-md hover:border-[var(--primary)] transition-colors ${
      verified === false 
        ? 'border-red-500 dark:border-red-600' 
        : 'border-[var(--border)]'
    }`}>
      <div className="flex gap-2 p-3">
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
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] mb-1">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <Link
                href={`/r/${getSubredditName(post)}`}
                className="font-semibold hover:underline"
              >
                r/{getSubredditName(post)}
              </Link>
              <span>•</span>
              <div className="flex items-center gap-1">
                <span className={verified === false ? 'text-red-500 font-semibold' : ''}>
                  Posted by u/{post.author?.username || 'unknown'}
                </span>
                {/* User Signature Verification */}
                {verified === true && (
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <title>User signature verified</title>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
                {verified === false && (
                  <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                    <title>User signature verification failed</title>
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
                {/* Proof Badge - Only show for own posts with proof */}
                {isOwnPost && hasProof && (
                  <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                    <title>Cryptographic proof available</title>
                    <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span>•</span>
              <span>{timeAgo(post.createdAt)}</span>
            </div>
            <MoreOptionsMenu
              type="post"
              id={post._id}
              authorId={post.author?._id || (typeof post.authorId === 'string' ? post.authorId : post.authorId?._id || '')}
            />
          </div>

          {/* Title */}
          <Link href={`/posts/${post._id}`} className="block group">
            <h3 className="text-lg font-semibold text-[var(--foreground)] group-hover:text-[var(--primary)] transition-colors line-clamp-2">
              {post.title}
            </h3>
          </Link>

          {/* Verification Failed Warning */}
          {verified === false && (
            <div className="mt-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400">
                    ⚠️ Cryptographic Verification Failed
                  </p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                    This post's digital signature could not be verified. The content may have been tampered with or the signature is invalid.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Content Preview */}
          {post.content && (
            <div className="text-sm text-[var(--text-secondary)] mt-2 line-clamp-3 prose prose-sm">
              <MarkdownRenderer content={post.content} />
            </div>
          )}

          {/* Link Preview */}
          {post.type === 'link' && post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[var(--primary)] hover:underline mt-2 block"
            >
              {post.url}
            </a>
          )}

          {/* Image/Video Preview - Support Multiple Attachments */}
          {(post.type === 'image' || post.type === 'video') && attachments && attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {attachments.map((attachment: any, index: number) => (
                <div key={attachment._id || index} className="rounded-md overflow-hidden max-h-96">
                  {post.type === 'image' && attachment.viewUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.viewUrl}
                      alt={`${post.title} - Image ${index + 1}`}
                      className="w-full h-auto object-cover"
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

          {/* Footer */}
          <div className="flex items-center gap-2 sm:gap-4 mt-3 text-xs text-[var(--text-secondary)] flex-wrap">
            <Link
              href={`/posts/${post._id}`}
              className="flex items-center gap-1 hover:bg-[var(--muted)] px-2 py-1 rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="hidden sm:inline">{post.commentCount} comments</span>
              <span className="sm:hidden">{post.commentCount}</span>
            </Link>

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
              <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
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
                <span className="hidden sm:inline">Proof</span>
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
    </div>
  );
}
