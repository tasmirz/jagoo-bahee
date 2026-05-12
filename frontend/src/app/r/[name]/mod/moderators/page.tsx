"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import Link from 'next/link';

interface Moderator {
  user: {
    _id: string;
    username: string;
  };
  role: {
    _id: string;
    name: string;
    isSystemRole?: boolean;
  };
  createdAt: string;
}

interface Role {
  _id: string;
  name: string;
}

export default function ModeratorsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  const [moderators, setModerators] = useState<Moderator[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [subredditId, setSubredditId] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    fetchData();
  }, [isAuthenticated, router, subredditName]);

  const fetchData = async () => {
    try {
      // Get subreddit ID
      const subRes = await backendFetch(`/subreddits/${subredditName}`);
      if (subRes.ok) {
        const subData = await subRes.json();
        setSubredditId(subData._id);
      }

      // Fetch moderators
      const modRes = await backendFetch(`/roles/subreddit/${subredditName}/moderators`);
      if (modRes.ok) {
        const data = await modRes.json();
        setModerators(data);
      }

      // Fetch available roles
      const rolesRes = await backendFetch(`/roles/subreddit/${subredditName}`);
      if (rolesRes.ok) {
        const rolesData = await rolesRes.json();
        setRoles(rolesData.filter((r: any) => r._id !== 'owner')); // Exclude owner role
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async () => {
    if (!selectedUserId || !selectedRoleId) {
      alert('Please select both user and role');
      return;
    }

    try {
      const res = await backendFetch(`/roles/${selectedRoleId}/assign/${selectedUserId}`, {
        method: 'POST',
      });

      if (res.ok) {
        alert('✅ Role assigned successfully');
        setShowAddModal(false);
        setSelectedUserId('');
        setSelectedRoleId('');
        fetchData();
      } else {
        const error = await res.json();
        alert(`Failed to assign role: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to assign role:', error);
      alert('Failed to assign role');
    }
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    if (!confirm('Are you sure you want to remove this moderator role?')) return;

    try {
      const res = await backendFetch(`/roles/${roleId}/revoke/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        alert('✅ Moderator removed successfully');
        fetchData();
      } else {
        const error = await res.json();
        alert(`Failed to remove moderator: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to remove moderator:', error);
      alert('Failed to remove moderator');
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
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Moderators</h1>
            <p className="text-[var(--text-secondary)]">r/{subredditName}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity"
            >
              Assign Role
            </button>
            <Link
              href={`/r/${subredditName}/mod`}
              className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
            >
              Back to Mod Tools
            </Link>
          </div>
        </div>

        {/* Moderators List */}
        {moderators.length === 0 ? (
          <div className="text-center py-12 bg-[var(--card)] border border-[var(--border)] rounded-lg">
            <div className="text-[var(--text-secondary)]">
              No moderators assigned yet.
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
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Since
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {moderators.map((mod) => (
                  <tr key={`${mod.user._id}-${mod.role._id}`} className="hover:bg-[var(--muted)]">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium">u/{mod.user.username}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        {mod.role.name}
                        {mod.role.isSystemRole && (
                          <span className="ml-2 text-xs text-[var(--text-secondary)]">(System)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-[var(--text-secondary)]">
                        {new Date(mod.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {!mod.role.isSystemRole && (
                        <button
                          onClick={() => handleRemoveRole(mod.user._id, mod.role._id)}
                          className="text-[var(--error)] hover:text-red-700 transition-colors"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Moderator Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold mb-4">Assign Moderator Role</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">User ID</label>
                  <input
                    type="text"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    placeholder="Enter user ID"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    You can find user IDs in the Members page
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Role</label>
                  <select
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <option value="">Select a role</option>
                    {roles.map((role) => (
                      <option key={role._id} value={role._id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedUserId('');
                    setSelectedRoleId('');
                  }}
                  className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignRole}
                  className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity"
                >
                  Assign Role
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
