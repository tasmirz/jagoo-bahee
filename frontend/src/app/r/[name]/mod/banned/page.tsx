"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import Link from 'next/link';

interface BannedMember {
  _id: string;
  userId: {
    _id: string;
    username: string;
  };
  bannedUntil?: string;
  banReason?: string;
  createdAt: string;
}

export default function BannedPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  const [bannedMembers, setBannedMembers] = useState<BannedMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subredditId, setSubredditId] = useState<string>('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    fetchSubredditAndBanned();
  }, [isAuthenticated, router, subredditName]);

  const fetchSubredditAndBanned = async () => {
    try {
      // First get subreddit ID
      const subRes = await backendFetch(`/subreddits/${subredditName}`);
      if (subRes.ok) {
        const subData = await subRes.json();
        setSubredditId(subData._id);
        
        // Fetch banned members
        const bannedRes = await backendFetch(`/subreddits/${subData._id}/members?type=banned`);
        if (bannedRes.ok) {
          const data = await bannedRes.json();
          // Transform the data to match our interface
          const transformed = data.map((item: any) => ({
            _id: item._id,
            userId: item.user,
            bannedUntil: item.bannedUntil,
            banReason: item.banReason,
            createdAt: item.createdAt
          }));
          setBannedMembers(transformed);
        }
      }
    } catch (error) {
      console.error('Failed to fetch banned members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnban = async (userId: string) => {
    if (!confirm('Are you sure you want to unban this user?')) return;

    try {
      const res = await backendFetch(`/subreddits/${subredditId}/ban/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        alert('✅ User unbanned successfully');
        fetchSubredditAndBanned();
      } else {
        const error = await res.json();
        alert(`Failed to unban user: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to unban user:', error);
      alert('Failed to unban user');
    }
  };

  const filteredMembers = bannedMembers.filter(m =>
    m.userId?.username?.toLowerCase().includes(search.toLowerCase())
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
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Banned Users</h1>
            <p className="text-[var(--text-secondary)]">r/{subredditName}</p>
          </div>
          <Link
            href={`/r/${subredditName}/mod`}
            className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
          >
            Back to Mod Tools
          </Link>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search banned users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>

        {/* Banned List */}
        {filteredMembers.length === 0 ? (
          <div className="text-center py-12 bg-[var(--card)] border border-[var(--border)] rounded-lg">
            <div className="text-[var(--text-secondary)]">
              {search ? 'No banned users found matching your search.' : 'No banned users yet.'}
            </div>
          </div>
        ) : (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Until
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredMembers.map((member) => (
                  <tr key={member._id} className="hover:bg-[var(--muted)]">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium">u/{member.userId?.username || 'Unknown'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-[var(--text-secondary)]">
                        {member.banReason || 'No reason provided'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[var(--text-secondary)]">
                        {member.bannedUntil
                          ? new Date(member.bannedUntil).toLocaleDateString()
                          : 'Permanent'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleUnban(member.userId._id)}
                        className="text-[var(--primary)] hover:text-[var(--secondary)] transition-colors"
                      >
                        Unban
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
