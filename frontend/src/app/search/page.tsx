"use client";

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { backendFetch } from '@/lib/backend';
import PostCard from '@/components/PostCard';
import Pagination from '@/components/Pagination';
import Link from 'next/link';
import { Post, User, Subreddit, Comment } from '@/lib/types';

type SearchType = 'posts' | 'comments' | 'subreddits' | 'users';

const ITEMS_PER_PAGE = 25;

export default function SearchPage() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams?.get('q') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [searchType, setSearchType] = useState<SearchType>('posts');
  const [allResults, setAllResults] = useState<{
    posts: Post[];
    comments: Comment[];
    subreddits: Subreddit[];
    users: User[];
  }>({
    posts: [],
    comments: [],
    subreddits: [],
    users: [],
  });
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Get paginated results for current type
  const getCurrentTypeResults = useCallback(() => {
    const typeResults = allResults[searchType];
    const startIdx = currentPage * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    return typeResults.slice(startIdx, endIdx);
  }, [allResults, searchType, currentPage]);

  const performSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setHasSearched(true);
    setCurrentPage(0);

    try {
      const encodedQuery = encodeURIComponent(searchQuery.trim());
      
      // Fetch with backend search filtering
      const [postsRes, commentsRes, subredditsRes, usersRes] = await Promise.all([
        backendFetch(`/posts?limit=100&skip=0&q=${encodedQuery}`),
        backendFetch(`/comments?limit=100&skip=0&q=${encodedQuery}`),
        backendFetch(`/subreddits?limit=100&skip=0&q=${encodedQuery}`),
        backendFetch(`/users?limit=100&skip=0&q=${encodedQuery}`),
      ]);

      const postsData = postsRes.ok ? await postsRes.json() : [];
      const commentsData = commentsRes.ok ? await commentsRes.json() : [];
      const subredditsData = subredditsRes.ok ? await subredditsRes.json() : [];
      const usersData = usersRes.ok ? await usersRes.json() : [];

      // Handle different response formats
      const posts = Array.isArray(postsData) ? postsData : postsData.data || [];
      const comments = Array.isArray(commentsData) ? commentsData : commentsData.data || [];
      const subreddits = Array.isArray(subredditsData) ? subredditsData : subredditsData.data || [];
      const users = Array.isArray(usersData) ? usersData : usersData.data || [];

      setAllResults({
        posts: posts as Post[],
        comments: comments as Comment[],
        subreddits: subreddits as Subreddit[],
        users: users as User[],
      });
    } catch (error) {
      console.error('Search error:', error);
      setAllResults({
        posts: [],
        comments: [],
        subreddits: [],
        users: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  // Dynamic search as user types (with debounce)
  useEffect(() => {
    if (!query.trim()) {
      // Clear results if query is empty
      if (hasSearched) {
        setAllResults({
          posts: [],
          comments: [],
          subreddits: [],
          users: [],
        });
        setHasSearched(false);
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch(query);
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [query, performSearch]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handleSearchTypeChange = (newType: SearchType) => {
    setSearchType(newType);
    setCurrentPage(0);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentResults = getCurrentTypeResults();
  const totalResults = Object.values(allResults).reduce((sum, arr) => sum + arr.length, 0);
  const totalPages = Math.ceil(allResults[searchType].length / ITEMS_PER_PAGE);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Search Bar */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search posts, communities, users..."
                className="w-full px-4 py-3 pr-12 bg-[var(--card)] border border-[var(--border)] rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                autoFocus
              />
              {loading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="animate-spin h-5 w-5 border-2 border-[var(--primary)] border-t-transparent rounded-full"></div>
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-8 py-3 bg-[var(--primary)] text-white rounded-full hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {hasSearched && (
          <>
            {/* Filter Tabs */}
            <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
              <button
                onClick={() => handleSearchTypeChange('posts')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  searchType === 'posts'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                Posts ({allResults.posts.length})
              </button>
              <button
                onClick={() => handleSearchTypeChange('comments')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  searchType === 'comments'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                Comments ({allResults.comments.length})
              </button>
              <button
                onClick={() => handleSearchTypeChange('subreddits')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  searchType === 'subreddits'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                Communities ({allResults.subreddits.length})
              </button>
              <button
                onClick={() => handleSearchTypeChange('users')}
                className={`px-6 py-3 font-medium transition-colors border-b-2 ${
                  searchType === 'users'
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
                }`}
              >
                Users ({allResults.users.length})
              </button>
            </div>

            {/* Results */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
              </div>
            ) : totalResults === 0 ? (
              <div className="text-center py-12">
                <p className="text-lg text-[var(--text-secondary)]">
                  No results found for &quot;{query}&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {searchType === 'posts' && (
                  <>
                    {(allResults.posts as Post[]).slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE).map((post) => (
                      <PostCard key={post._id} post={post} />
                    ))}
                    {totalPages > 1 && (
                      <div className="mt-6">
                        <Pagination
                          currentPage={currentPage}
                          hasMore={currentPage < totalPages - 1}
                          loading={false}
                          totalItems={allResults.posts.length}
                          itemsPerPage={ITEMS_PER_PAGE}
                          onPageChange={handlePageChange}
                        />
                      </div>
                    )}
                  </>
                )}

                {searchType === 'comments' && (
                  <>
                    {(allResults.comments as Comment[]).slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE).map((comment) => (
                      <div key={comment._id} className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
                        <Link href={`/posts/${comment.postId}`} className="text-sm text-[var(--text-secondary)] hover:underline mb-2 block">
                          View in post →
                        </Link>
                        <p className="text-[var(--foreground)] mb-2">{comment.content}</p>
                        <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                          <span>{comment.score} points</span>
                          <span>•</span>
                          <Link href={`/users/${comment.authorId}`} className="hover:underline">
                            u/{comment.authorId}
                          </Link>
                          <span>•</span>
                          <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))}
                    {totalPages > 1 && (
                      <div className="mt-6">
                        <Pagination
                          currentPage={currentPage}
                          hasMore={currentPage < totalPages - 1}
                          loading={false}
                          totalItems={allResults.comments.length}
                          itemsPerPage={ITEMS_PER_PAGE}
                          onPageChange={handlePageChange}
                        />
                      </div>
                    )}
                  </>
                )}

                {searchType === 'subreddits' && (
                  <>
                    {(allResults.subreddits as Subreddit[]).slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE).map((subreddit) => (
                      <div key={subreddit._id} className="bg-[var(--card)] border border-[var(--border)] rounded-md p-6">
                        <div className="flex items-start gap-4">
                          {subreddit.icon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={subreddit.icon} alt={subreddit.name} className="w-16 h-16 rounded-full" />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-[var(--muted)] flex items-center justify-center text-2xl font-bold">
                              {subreddit.name[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1">
                            <Link href={`/r/${subreddit.name}`} className="text-xl font-bold hover:underline">
                              r/{subreddit.name}
                            </Link>
                            <p className="text-[var(--text-secondary)] mt-1">{subreddit.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-sm text-[var(--text-secondary)]">
                              <span>{subreddit.memberCount.toLocaleString()} members</span>
                            </div>
                          </div>
                          <Link
                            href={`/r/${subreddit.name}`}
                            className="px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    ))}
                    {totalPages > 1 && (
                      <div className="mt-6">
                        <Pagination
                          currentPage={currentPage}
                          hasMore={currentPage < totalPages - 1}
                          loading={false}
                          totalItems={allResults.subreddits.length}
                          itemsPerPage={ITEMS_PER_PAGE}
                          onPageChange={handlePageChange}
                        />
                      </div>
                    )}
                  </>
                )}

                {searchType === 'users' && (
                  <>
                    {(allResults.users as User[]).slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE).map((user) => (
                      <div key={user._id} className="bg-[var(--card)] border border-[var(--border)] rounded-md p-6">
                        <div className="flex items-center gap-4">
                          {user.avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={user.avatar} alt={user.username} className="w-16 h-16 rounded-full" />
                          ) : (
                            <div className="w-16 h-16 rounded-full bg-[var(--muted)] flex items-center justify-center text-2xl font-bold">
                              {user.username[0].toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1">
                            <Link href={`/users/${user.username}`} className="text-xl font-bold hover:underline">
                              u/{user.username}
                            </Link>
                            {user.bio && (
                              <p className="text-[var(--text-secondary)] mt-1">{user.bio}</p>
                            )}
                            <div className="text-sm text-[var(--text-secondary)] mt-1">
                              {user.karma.toLocaleString()} karma
                            </div>
                          </div>
                          <Link
                            href={`/users/${user.username}`}
                            className="px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
                          >
                            View Profile
                          </Link>
                        </div>
                      </div>
                    ))}
                    {totalPages > 1 && (
                      <div className="mt-6">
                        <Pagination
                          currentPage={currentPage}
                          hasMore={currentPage < totalPages - 1}
                          loading={false}
                          totalItems={allResults.users.length}
                          itemsPerPage={ITEMS_PER_PAGE}
                          onPageChange={handlePageChange}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}

        {!hasSearched && (
          <div className="text-center py-12">
            <p className="text-lg text-[var(--text-secondary)]">
              Enter a search term to find posts, comments, communities, and users
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
