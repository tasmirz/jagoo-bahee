"use client";

import { useEffect, useState } from 'react';
import PostCard from '@/components/PostCard';
import FeedControls from '@/components/FeedControls';
import LoadingSkeleton from '@/components/LoadingSkeleton';
import JoinedSubreddits from '@/components/JoinedSubreddits';
import Pagination from '@/components/Pagination';
import { Post } from '@/lib/types';
import { backendFetch } from '@/lib/backend';
import Link from 'next/link';
import { useInfiniteScroll } from '@/lib/hooks/useInfiniteScroll';
import { useAuth } from '@/lib/context/AuthContext';

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'new' | 'top'>('new');
  const [timeRange, setTimeRange] = useState<'hour' | 'day' | 'week' | 'month' | 'year' | 'all'>('day');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [tab, setTab] = useState<'home' | 'explore'>('home');
  const [joinedSubreddits, setJoinedSubreddits] = useState<string[]>([]);

  // Fetch joined subreddits when authenticated
  useEffect(() => {
    async function fetchJoinedSubreddits() {
      if (!isAuthenticated) {
        setJoinedSubreddits([]);
        return;
      }

      try {
        const response = await backendFetch('/users/me/subreddits');
        if (response.ok) {
          const data = await response.json();
          const subredditIds = data.map((sub: any) => sub._id);
          setJoinedSubreddits(subredditIds);
        }
      } catch (err) {
        console.error('Failed to fetch joined subreddits:', err);
      }
    }

    fetchJoinedSubreddits();
  }, [isAuthenticated]);

  useEffect(() => {
    async function fetchPosts() {
      setLoading(true);
      setError(null);
      setPosts([]);
      setPage(0);
      setHasMore(true);
      
      try {
        const params = new URLSearchParams({
          limit: '10',
          skip: '0',
          sort: sortBy,
        });
        
        if (sortBy === 'top') {
          params.append('time', timeRange);
        }
        
        const response = await backendFetch(`/posts?${params}`);
        if (!response.ok) {
          throw new Error('Failed to fetch posts');
        }
        
        const data = await response.json();
        let newPosts = Array.isArray(data) ? data : data.data || [];
        
        // Filter by joined subreddits if on home tab and user is authenticated
        if (tab === 'home' && isAuthenticated && joinedSubreddits.length > 0) {
          newPosts = newPosts.filter((post: Post) => {
            const subredditId = typeof post.subreddit === 'object' ? post.subreddit?._id : post.subredditId;
            return joinedSubreddits.includes(subredditId);
          });
        }
        
        setPosts(newPosts);
        setHasMore(newPosts.length === 10);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load posts');
      } finally {
        setLoading(false);
      }
    }

    fetchPosts();
  }, [sortBy, timeRange, tab, joinedSubreddits, isAuthenticated]);

  const loadMore = async () => {
    if (loading || !hasMore) return;
    
    const nextPage = page + 1;
    await loadPage(nextPage);
  };

  const loadPage = async (pageNum: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: '10',
        skip: String(pageNum * 10),
        sort: sortBy,
      });
      
      if (sortBy === 'top') {
        params.append('time', timeRange);
      }
      
      const response = await backendFetch(`/posts?${params}`);
      if (response.ok) {
        const data = await response.json();
        let newPosts = Array.isArray(data) ? data : data.data || [];
        
        // Filter by joined subreddits if on home tab and user is authenticated
        if (tab === 'home' && isAuthenticated && joinedSubreddits.length > 0) {
          newPosts = newPosts.filter((post: Post) => {
            const subredditId = typeof post.subreddit === 'object' ? post.subreddit?._id : post.subredditId;
            return joinedSubreddits.includes(subredditId);
          });
        }
        
        // For explicit pagination, replace posts; for infinite scroll, append
        if (pageNum === page + 1) {
          // Infinite scroll - append
          setPosts(prev => [...prev, ...newPosts]);
        } else {
          // Explicit pagination - replace
          setPosts(newPosts);
        }
        
        setPage(pageNum);
        setHasMore(newPosts.length === 10);
      }
    } catch (err) {
      console.error('Failed to load posts:', err);
      setError('Failed to load posts');
    } finally {
      setLoading(false);
    }
  };

  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    loading,
  });

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {/* Tabs */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-1 flex gap-1">
              <button
                onClick={() => setTab('home')}
                className={`flex-1 px-4 py-2 rounded transition-colors ${
                  tab === 'home'
                    ? 'bg-[var(--primary)] text-white'
                    : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
                }`}
              >
                <span className="emoji"> 🏠</span> Home
                {isAuthenticated && joinedSubreddits.length > 0 && (
                  <span className="ml-2 text-xs opacity-75">
                    ({joinedSubreddits.length})
                  </span>
                )}
              </button>
              <button
                onClick={() => setTab('explore')}
                className={`flex-1 px-4 py-2 rounded transition-colors ${
                  tab === 'explore'
                    ? 'bg-[var(--primary)] text-white'
                    : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
                }`}
              >
               <span className="emoji"> 🌐</span> Explore
              </button>
            </div>

            {/* Empty State for Home Tab */}
            {tab === 'home' && (!isAuthenticated || joinedSubreddits.length === 0) && !loading && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-8 text-center">
                <h3 className="text-xl font-semibold mb-2">
                  {!isAuthenticated ? 'Sign in to see your home feed' : 'Join some communities!'}
                </h3>
                <p className="text-[var(--text-secondary)] mb-4">
                  {!isAuthenticated
                    ? 'Your personalized home feed shows posts from communities you join.'
                    : 'Your home feed will show posts from communities you join. Explore communities below!'}
                </p>
                {!isAuthenticated ? (
                  <Link
                    href="/auth/"
                    className="inline-block px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
                  >
                    Sign In
                  </Link>
                ) : (
                  <Link
                    href="/subreddits"
                    className="inline-block px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
                  >
                    Explore Communities
                  </Link>
                )}
              </div>
            )}

            {/* Feed Controls */}
            {(tab === 'explore' || (tab === 'home' && isAuthenticated && joinedSubreddits.length > 0)) && (
              <FeedControls
                sort={sortBy}
                timeRange={timeRange}
                onSortChange={setSortBy}
                onTimeRangeChange={setTimeRange}
              />
            )}

            {/* Posts */}
            {loading && (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => <LoadingSkeleton key={i} type="post" />)}
              </div>
            )}

            {error && (
              <div className="bg-[var(--card)] border border-[var(--error)] rounded-md p-6 text-center">
                <p className="text-[var(--error)]">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && posts.length === 0 && (tab === 'explore' || (tab === 'home' && isAuthenticated && joinedSubreddits.length > 0)) && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
                <h3 className="text-xl font-semibold mb-2">No posts yet</h3>
                <p className="text-[var(--text-secondary)] mb-4">Be the first to create a post!</p>
                <Link
                  href="/posts/create"
                  className="inline-block px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
                >
                  Create Post
                </Link>
              </div>
            )}

            {!loading && !error && (tab === 'explore' || (tab === 'home' && isAuthenticated && joinedSubreddits.length > 0)) && posts.map((post) => (
              <PostCard key={post._id} post={post} />
            ))}

            {/* Pagination Controls */}
            {!loading && !error && posts.length > 0 && (tab === 'explore' || (tab === 'home' && isAuthenticated && joinedSubreddits.length > 0)) && (
              <Pagination
                currentPage={page}
                hasMore={hasMore}
                loading={loading}
                itemsPerPage={25}
                onPageChange={loadPage}
              />
            )}

            {/* Infinite Scroll Trigger */}
            {!loading && hasMore && (tab === 'explore' || (tab === 'home' && isAuthenticated && joinedSubreddits.length > 0)) && (
              <div ref={loadMoreRef} className="py-8 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Joined Communities */}
            <JoinedSubreddits />
            
            {/* Welcome Card */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
              <h3 className="font-semibold text-lg mb-2">Welcome to Jagoo Bahee</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                A privacy-first, cryptographically-signed community platform. Every post is verified with cryptographic signatures.
              </p>
              <Link
                href="/posts/create"
                className="block w-full px-4 py-2 bg-[var(--primary)] text-white text-center rounded-md hover:opacity-90 transition-opacity"
              >
                Create Post
              </Link>
              <Link
                href="/subreddits/create"
                className="block w-full mt-2 px-4 py-2 border border-[var(--border)] text-center rounded-md hover:bg-[var(--muted)] transition-colors"
              >
                Create Community
              </Link>
            </div>

            {/* Popular Communities */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
              <h3 className="font-semibold mb-3">Popular Communities</h3>
              <div className="space-y-2">
                <Link href="/r/general" className="block text-sm hover:underline text-[var(--text-secondary)]">
                  r/general
                </Link>
                <Link href="/r/crypto" className="block text-sm hover:underline text-[var(--text-secondary)]">
                  r/crypto
                </Link>
                <Link href="/r/privacy" className="block text-sm hover:underline text-[var(--text-secondary)]">
                  r/privacy
                </Link>
                <Link href="/subreddits" className="block text-sm text-[var(--primary)] hover:underline">
                  View all →
                </Link>
              </div>
            </div>

            {/* Info Card */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 text-xs text-[var(--text-secondary)]">
              <p className="mb-2">🔐 All content is cryptographically signed</p>
              <p className="mb-2">🔍 Verify authenticity of any post or comment</p>
              <p>🔑 Your keys, your content</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
