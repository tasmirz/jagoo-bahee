"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';

interface SubredditStats {
  memberCount: number;
  postCount: number;
  commentCount: number;
  activeUsers: number;
  growthRate: number;
  topContributors: Array<{
    userId: string;
    username: string;
    postCount: number;
    commentCount: number;
    karma: number;
  }>;
  postsByDay: Array<{
    date: string;
    count: number;
  }>;
  engagementRate: number;
}

export default function SubredditStatsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  const [stats, setStats] = useState<SubredditStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchStats() {
      try {
        const res = await backendFetch(`/subreddits/${subredditName}/stats`);
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [isAuthenticated, router, subredditName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Stats not available</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Community Stats</h1>
          <p className="text-[var(--text-secondary)]">r/{subredditName}</p>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <div className="text-3xl font-bold text-[var(--primary)] mb-2">
              {stats.memberCount.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Total Members</div>
            {stats.growthRate > 0 && (
              <div className="text-xs text-green-600 mt-1">
                +{stats.growthRate.toFixed(1)}% this month
              </div>
            )}
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <div className="text-3xl font-bold text-[var(--primary)] mb-2">
              {stats.postCount.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Total Posts</div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <div className="text-3xl font-bold text-[var(--primary)] mb-2">
              {stats.commentCount.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Total Comments</div>
          </div>

          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <div className="text-3xl font-bold text-[var(--primary)] mb-2">
              {stats.activeUsers.toLocaleString()}
            </div>
            <div className="text-sm text-[var(--text-secondary)]">Active Now</div>
          </div>
        </div>

        {/* Engagement */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Engagement Rate</h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="h-4 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--primary)] rounded-full"
                  style={{ width: `${Math.min(stats.engagementRate * 100, 100)}%` }}
                />
              </div>
            </div>
            <div className="text-2xl font-bold">
              {(stats.engagementRate * 100).toFixed(1)}%
            </div>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            Percentage of members who posted or commented this week
          </p>
        </div>

        {/* Posts by Day */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Posts Over Time</h2>
          <div className="space-y-2">
            {stats.postsByDay.slice(0, 7).map((day, idx) => (
              <div key={idx} className="flex items-center gap-4">
                <div className="w-24 text-sm text-[var(--text-secondary)]">
                  {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <div className="flex-1">
                  <div className="h-6 bg-[var(--muted)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)] rounded-full"
                      style={{ width: `${(day.count / Math.max(...stats.postsByDay.map(d => d.count))) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="w-16 text-right font-semibold">{day.count}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Contributors */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Top Contributors</h2>
          <div className="space-y-3">
            {stats.topContributors.slice(0, 10).map((contributor, idx) => (
              <div key={contributor.userId} className="flex items-center gap-4 p-3 bg-[var(--muted)] rounded-md">
                <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-white flex items-center justify-center font-bold">
                  {idx + 1}
                </div>
                <div className="flex-1">
                  <div className="font-semibold">u/{contributor.username}</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    {contributor.postCount} posts • {contributor.commentCount} comments
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">{contributor.karma.toLocaleString()}</div>
                  <div className="text-xs text-[var(--text-secondary)]">karma</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
