"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import Link from 'next/link';

interface Member {
  user: {
    _id: string;
    username: string;
  };
  role?: {
    _id: string;
    name: string;
  };
  createdAt: string;
}

export default function MembersPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [banReason, setBanReason] = useState('');
  const [banType, setBanType] = useState<'temporary' | 'permanent'>('temporary');
  const [banDuration, setBanDuration] = useState('7');
  const [subredditId, setSubredditId] = useState<string>('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    fetchMembers();
  }, [isAuthenticated, router, subredditName]);

  const fetchMembers = async () => {
    try {
      // First get subreddit ID
      const subRes = await backendFetch(`/subreddits/${subredditName}`);
      if (subRes.ok) {
        const subData = await subRes.json();
        setSubredditId(subData._id);
        
        // Fetch all members from the members endpoint
        const membersRes = await backendFetch(`/subreddits/${subData._id}/members?limit=100`);
        if (membersRes.ok) {
          const data = await membersRes.json();
          // Transform the data to match our interface
          const transformed = data.map((item: any) => ({
            user: item.user || { _id: item.userId, username: 'Unknown' },
            role: item.role,
            createdAt: item.createdAt
          }));
          setMembers(transformed);
        }
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: string) => {
    if (!banReason.trim()) {
      alert('Please provide a ban reason');
      return;
    }

    try {
      const body: any = {
        userId,
        reason: banReason.trim(),
        type: banType
      };

      if (banType === 'temporary') {
        body.duration = parseInt(banDuration);
      }

      const res = await backendFetch(`/subreddits/${subredditId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        alert('✅ User banned successfully');
        setSelectedUser(null);
        setBanReason('');
        fetchMembers();
      } else {
        const error = await res.json();
        alert(`Failed to ban user: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to ban user:', error);
      alert('Failed to ban user');
    }
  };

  const filteredMembers = members.filter(m =>
    m.user.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href={`/r/${subredditName}`}
              className="text-[var(--text-secondary)] hover:text-[var(--foreground)]"
            >
              r/{subredditName}
            </Link>
            <span className="text-[var(--text-secondary)]">/</span>
            <Link
              href={`/r/${subredditName}/mod`}
              className="text-[var(--text-secondary)] hover:text-[var(--foreground)]"
            >
              Mod Tools
            </Link>
            <span className="text-[var(--text-secondary)]">/</span>
            <span className="font-semibold">Members</span>
          </div>
          <h1 className="text-2xl font-bold">Manage Members</h1>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members by username..."
            className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>

        {/* Members List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)] mx-auto"></div>
          </div>
        ) : (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-md">
            {filteredMembers.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-secondary)]">
                No members found
              </div>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {filteredMembers.map((member) => (
                  <div key={member.user._id} className="p-4 hover:bg-[var(--muted)] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/u/${member.user.username}`}
                            className="font-medium hover:underline"
                          >
                            u/{member.user.username}
                          </Link>
                          {member.role && (
                            <span className="px-2 py-0.5 bg-[var(--primary)] text-white text-xs rounded-full">
                              {member.role.name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-secondary)] mt-1 space-y-0.5">
                          <div>Member since {new Date(member.createdAt).toLocaleDateString()}</div>
                          <div className="font-mono">ID: {member.user._id}</div>
                        </div>
                      </div>

                      {member.role?.name !== 'Owner' && (
                        <button
                          onClick={() => setSelectedUser(member.user._id)}
                          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                        >
                          Ban User
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Ban Modal */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 max-w-md w-full">
              <h2 className="text-xl font-bold mb-4">Ban User</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Ban Type</label>
                  <select
                    value={banType}
                    onChange={(e) => setBanType(e.target.value as 'temporary' | 'permanent')}
                    className="w-full px-3 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-md"
                  >
                    <option value="temporary">Temporary</option>
                    <option value="permanent">Permanent</option>
                  </select>
                </div>

                {banType === 'temporary' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Duration (days)</label>
                    <input
                      type="number"
                      value={banDuration}
                      onChange={(e) => setBanDuration(e.target.value)}
                      min="1"
                      className="w-full px-3 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-md"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-2">Reason (required)</label>
                  <textarea
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-md resize-none"
                    placeholder="Explain why you're banning this user..."
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setSelectedUser(null);
                    setBanReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleBanUser(selectedUser)}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Confirm Ban
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
