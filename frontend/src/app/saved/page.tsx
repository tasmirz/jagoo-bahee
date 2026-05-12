"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { backendFetch } from '@/lib/backend';
import PostCard from '@/components/PostCard';
import { Post, Comment } from '@/lib/types';
import Link from 'next/link';

export default function SavedPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'comments'>('posts');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchSaved() {
      try {
        const [postsRes, commentsRes] = await Promise.all([
          backendFetch('/users/me/saved/posts'),
          backendFetch('/users/me/saved/comments'),
        ]);

        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setPosts(Array.isArray(postsData) ? postsData : postsData.data || []);
        }

        if (commentsRes.ok) {
          const commentsData = await commentsRes.json();
          setComments(Array.isArray(commentsData) ? commentsData : commentsData.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch saved items:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSaved();
  }, [isAuthenticated, router]);

  const handleUnsave = async (type: 'post' | 'comment', id: string) => {
    try {
      const res = await backendFetch(`/${type}s/${id}/unsave`, {
        method: 'POST',
      });

      if (res.ok) {
        if (type === 'post') {
          setPosts(prev => prev.filter(p => p._id !== id));
        } else {
          setComments(prev => prev.filter(c => c._id !== id));
        }
      }
    } catch (error) {
      console.error('Failed to unsave:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold mb-6">Saved</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'posts'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Posts ({posts.length})
          </button>
          <button
            onClick={() => setActiveTab('comments')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'comments'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Comments ({comments.length})
          </button>
        </div>

        {/* Content */}
        {activeTab === 'posts' && (
          <div className="space-y-4">
            {posts.length === 0 ? (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
                <p className="text-[var(--text-secondary)] mb-4">No saved posts yet</p>
                <Link
                  href="/"
                  className="inline-block px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
                >
                  Browse Posts
                </Link>
              </div>
            ) : (
              posts.map((post) => (
                <div key={post._id} className="relative">
                  <PostCard post={post} />
                  <button
                    onClick={() => handleUnsave('post', post._id)}
                    className="absolute top-4 right-4 px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                  >
                    Unsave
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
                <p className="text-[var(--text-secondary)] mb-4">No saved comments yet</p>
              </div>
            ) : (
              comments.map((comment) => (
                <div
                  key={comment._id}
                  className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <Link
                      href={`/posts/${comment.postId}`}
                      className="text-sm text-[var(--primary)] hover:underline"
                    >
                      View in post →
                    </Link>
                    <button
                      onClick={() => handleUnsave('comment', comment._id)}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                    >
                      Unsave
                    </button>
                  </div>
                  <p className="text-[var(--foreground)] mb-2">{comment.content}</p>
                  <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                    <span>{comment.score} points</span>
                    <span>•</span>
                    <span>by u/{typeof comment.authorId === 'string' ? comment.authorId : comment.authorId?.username || comment.authorId?._id}</span>
                    <span>•</span>
                    <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
