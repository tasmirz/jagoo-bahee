"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { backendFetch } from '@/lib/backend';
import { useAuth } from '@/lib/context/AuthContext';
import { Subreddit } from '@/lib/types';

export default function JoinedSubreddits() {
  const { isAuthenticated } = useAuth();
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchJoinedSubreddits() {
      if (!isAuthenticated) {
        setSubreddits([]);
        setLoading(false);
        return;
      }

      try {
        const response = await backendFetch('/users/me/subreddits');
        if (response.ok) {
          const data = await response.json();
          setSubreddits(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error('Failed to fetch joined subreddits:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchJoinedSubreddits();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
        <h3 className="font-semibold mb-3">Your Communities</h3>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-[var(--muted)] rounded"></div>
          <div className="h-4 bg-[var(--muted)] rounded"></div>
          <div className="h-4 bg-[var(--muted)] rounded"></div>
        </div>
      </div>
    );
  }

  if (subreddits.length === 0) {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
        <h3 className="font-semibold mb-3">Your Communities</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-3">
          You haven't joined any communities yet.
        </p>
        <Link
          href="/subreddits"
          className="text-sm text-[var(--primary)] hover:underline"
        >
          Explore communities
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
      <h3 className="font-semibold mb-3">Your Communities</h3>
      <div className="space-y-2">
        {subreddits.map((subreddit) => (
          <Link
            key={subreddit._id}
            href={`/r/${subreddit.name}`}
            className="flex items-center gap-2 p-2 rounded hover:bg-[var(--muted)] transition-colors"
          >
            {subreddit.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={subreddit.icon}
                alt={subreddit.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white text-sm font-bold">
                {subreddit.name[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">r/{subreddit.name}</div>
              <div className="text-xs text-[var(--text-secondary)]">
                {subreddit.memberCount?.toLocaleString() || 0} members
              </div>
            </div>
          </Link>
        ))}
      </div>
      {subreddits.length > 5 && (
        <Link
          href="/subreddits"
          className="block mt-3 text-sm text-[var(--primary)] hover:underline text-center"
        >
          View all
        </Link>
      )}
    </div>
  );
}
