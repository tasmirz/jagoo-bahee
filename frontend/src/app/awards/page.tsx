"use client";

import { useEffect, useState } from 'react';
import { backendFetch } from '@/lib/backend';
import { Award } from '@/lib/types';

export default function AwardsPage() {
  const [awards, setAwards] = useState<Award[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'popular' | 'recent'>('all');

  useEffect(() => {
    async function fetchAwards() {
      try {
        const res = await backendFetch('/awards');
        if (res.ok) {
          const data = await res.json();
          setAwards(Array.isArray(data) ? data : data.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch awards:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchAwards();
  }, []);

  const filteredAwards = [...awards].sort((a, b) => {
    if (filter === 'popular') {
      // Sort by coin cost as a proxy for popularity
      return b.coinCost - a.coinCost;
    }
    if (filter === 'recent') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return 0;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold mb-6">Awards</h1>

        <div className="mb-6">
          <p className="text-[var(--text-secondary)] mb-4">
            Give awards to posts and comments you love. Awards show appreciation and grant special recognition.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 mb-6 border-b border-[var(--border)]">
          <button
            onClick={() => setFilter('all')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              filter === 'all'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            All Awards
          </button>
          <button
            onClick={() => setFilter('popular')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              filter === 'popular'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Most Popular
          </button>
          <button
            onClick={() => setFilter('recent')}
            className={`px-6 py-3 font-medium transition-colors border-b-2 ${
              filter === 'recent'
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
            }`}
          >
            Recently Created
          </button>
        </div>

        {/* Awards Grid */}
        {filteredAwards.length === 0 ? (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
            <p className="text-[var(--text-secondary)]">No awards available yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAwards.map((award) => (
              <div
                key={award._id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="text-4xl flex-shrink-0">
                    {award.icon || '🏆'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg mb-1">{award.name}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                      {award.description}
                    </p>

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)] mb-3">
                      <span>💰 {award.coinCost} coins</span>
                      {award.isPremium && <span>⭐ Premium</span>}
                    </div>

                    {/* Scope Badge */}
                    <div className="inline-block px-2 py-1 bg-[var(--muted)] rounded text-xs">
                      {award.subredditId ? 'Subreddit Award' : 'Platform-wide'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-[var(--muted)] border border-[var(--border)] rounded-lg p-6">
          <h3 className="font-bold mb-2">About Awards</h3>
          <ul className="text-sm text-[var(--text-secondary)] space-y-2">
            <li>• Awards are verified and cryptographically signed</li>
            <li>• Each award has a unique cost in coins</li>
            <li>• Awards can be platform-wide or subreddit-specific</li>
            <li>• Giving awards shows appreciation and supports content creators</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
