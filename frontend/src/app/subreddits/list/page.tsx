"use client";

import { useState, useEffect } from 'react';
import { Subreddit } from '@/lib/types';
import { backendFetch } from '@/lib/backend';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';

export default function SubredditsPage() {
  const { isAuthenticated } = useAuth();
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    async function fetchSubreddits() {
      try {
        const response = await backendFetch('/subreddits?limit=50');
        if (response.ok) {
          const data = await response.json();
          setSubreddits(Array.isArray(data) ? data : data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch subreddits:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSubreddits();
  }, []);

  const filteredSubreddits = subreddits.filter(sub =>
    sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-4">Communities</h1>
          
          {/* Search */}
          <div className="flex gap-3">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search communities..."
              className="flex-1 px-4 py-2 border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            />
            {isAuthenticated && (
              <Link
                href="/subreddits/create"
                className="px-6 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity font-medium"
              >
                Create Community
              </Link>
            )}
          </div>
        </div>

        {/* Subreddits Grid */}
        {filteredSubreddits.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
            <h3 className="text-xl font-semibold mb-2">No communities found</h3>
            <p className="text-[var(--text-secondary)] mb-4">
              {searchTerm ? 'Try a different search term' : 'Be the first to create a community!'}
            </p>
            {isAuthenticated && !searchTerm && (
              <Link
                href="/subreddits/create"
                className="inline-block px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
              >
                Create Community
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSubreddits.map((subreddit) => (
              <Link
                key={subreddit._id}
                href={`/r/${subreddit.name}`}
                className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 hover:border-[var(--primary)] transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="w-12 h-12 bg-[var(--muted)] rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {subreddit.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={subreddit.icon} alt={subreddit.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold">{subreddit.name[0].toUpperCase()}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">r/{subreddit.name}</h3>
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2">
                      {subreddit.description || subreddit.displayName}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                      <span>{subreddit.memberCount.toLocaleString()} members</span>
                      <span>•</span>
                      <span>{subreddit.postCount} posts</span>
                      {subreddit.isNsfw && (
                        <>
                          <span>•</span>
                          <span className="text-[var(--error)]">NSFW</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
