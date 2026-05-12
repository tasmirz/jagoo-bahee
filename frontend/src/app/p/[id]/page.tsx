'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import backend from '@/lib/backend';
import { Post, Comment, User, Subreddit } from '@/lib/types';
import { getAuthIdFromToken, getPrivateKey, signHash, toB64 } from '@/lib/auth';
import { sha256 } from '@/lib/crypto';
import { Download } from 'lucide-react';

export default function SinglePostPage() {
  const params = useParams();
  const id = params.id as string;
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [proofStatus, setProofStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [postRes, commentsRes] = await Promise.all([
          backend.backendFetch(`/posts/${id}`),
          backend.backendFetch(`/posts/${id}/comments`),
        ]);
        if (postRes.ok) {
          const postData = await postRes.json();
          setPost(postData);
        }
        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          setComments(Array.isArray(commentsData) ? commentsData : []);
        }
      } catch (err) {
        console.error('Failed to load post:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <div className="p-8 text-center">Loading post...</div>;
  if (!post) return <div className="p-8 text-center">Post not found.</div>;

  const author = post.authorId as User;
  const sub = post.subredditId as Subreddit;

  async function downloadProof() {
    if (!post) return;
    setProofStatus(null);
    try {
      const res = await backend.backendFetch(`/posts/${post._id}/verify`);
      if (!res.ok) throw new Error('Unable to load proof');
      const proof = await res.json();
      const blob = new Blob([JSON.stringify(proof, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `jagoo-proof-post-${post._id}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setProofStatus('Proof downloaded.');
    } catch (error) {
      setProofStatus(error instanceof Error ? error.message : 'Unable to download proof');
    }
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!post || !commentText.trim()) return;

    const authorId = getAuthIdFromToken();
    const privateKey = getPrivateKey();
    if (!authorId || !privateKey) {
      setCommentError('Please sign in to comment.');
      return;
    }

    const subredditId =
      typeof post.subredditId === 'string'
        ? post.subredditId
        : post.subredditId?._id;
    if (!subredditId) {
      setCommentError('Missing subreddit reference.');
      return;
    }

    setSubmittingComment(true);
    setCommentError(null);

    try {
      const payloadObj = {
        content: commentText,
        postId: post._id,
        parentId: null,
        attachmentIds: [],
        authorId,
      };
      const canonical = JSON.stringify(payloadObj);
      const hash = await sha256(canonical);
      const userSignature = toB64(signHash(privateKey, hash));
      const contentHash = toB64(hash);

      const res = await backend.backendJson('POST', '/comments', {
        postId: post._id,
        subredditId,
        authorId,
        content: commentText,
        attachmentIds: [],
        userSignature,
        contentHash,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to add comment');
      }

      setCommentText('');
      const commentsRes = await backend.backendFetch(`/posts/${id}/comments`);
      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        setComments(Array.isArray(commentsData) ? commentsData : []);
      }
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : 'Failed to add comment');
    } finally {
      setSubmittingComment(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      {/* Post content */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 mb-6">
        <div className="text-xs text-[var(--text-secondary)] mb-2">
          {sub?.name && (
            <>
              <Link href={`/r/${sub.name}`} className="font-bold hover:underline">
                r/{sub.name}
              </Link>
              <span className="mx-1">•</span>
            </>
          )}
          <span>Posted by u/{author?.username ?? 'unknown'}</span>
          <span className="mx-1">•</span>
          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
        </div>
        <h1 className="text-2xl font-bold mb-4">{post.title}</h1>
        {post.type === 'text' && post.content && (
          <p className="text-sm whitespace-pre-wrap">{post.content}</p>
        )}
        {post.type === 'link' && post.url && (
          <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--secondary)] hover:underline block truncate">
            {post.url}
          </a>
        )}
        <div className="mt-4 flex items-center gap-4 text-xs font-bold text-[var(--text-secondary)]">
          <span>{post.score} points</span>
          <span>{post.commentCount} comments</span>
          <button
            type="button"
            onClick={downloadProof}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 hover:bg-[var(--muted)]"
          >
            <Download size={14} />
            Download proof
          </button>
        </div>
        {proofStatus && <div className="mt-2 text-xs text-[var(--text-secondary)]">{proofStatus}</div>}
      </div>

      {/* Comments */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">Comments ({comments.length})</h2>
        <form onSubmit={submitComment} className="mb-6">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment"
            rows={3}
            className="w-full p-3 border border-[var(--border)] rounded-lg bg-[var(--background)]"
          />
          <div className="mt-2 flex items-center justify-between">
            {commentError ? <p className="text-sm text-red-500">{commentError}</p> : <span />}
            <button
              type="submit"
              disabled={submittingComment || !commentText.trim()}
              className="px-4 py-2 text-sm font-bold rounded-full bg-[var(--primary)] text-white disabled:opacity-50"
            >
              {submittingComment ? 'Posting...' : 'Comment'}
            </button>
          </div>
        </form>
        {comments.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] italic">No comments yet.</p>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => {
              const commentAuthor = comment.authorId as User;
              return (
                <div key={comment._id} className="border-l-2 border-[var(--border)] pl-4">
                  <div className="text-xs text-[var(--text-secondary)] mb-1">
                    <span>u/{commentAuthor?.username ?? 'unknown'}</span>
                    <span className="mx-1">•</span>
                    <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm">{comment.content}</p>
                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                    <span>{comment.score} points</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
