"use client";

import { useCallback, useEffect, useState } from 'react';
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

interface UserOption {
  _id: string;
  username: string;
  displayName?: string;
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
  const [userQuery, setUserQuery] = useState('');
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');

  const fetchData = useCallback(async () => {
    try {
      // Get subreddit ID
      await backendFetch(`/subreddits/${subredditName}`);

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
        setRoles((Array.isArray(rolesData) ? rolesData : []).filter((role: Role) => role._id !== 'owner')); // Exclude owner role
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [subredditName]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    const timer = window.setTimeout(() => void fetchData(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchData, isAuthenticated, router]);

  useEffect(() => {
    if (!showAddModal) return;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: userQuery.trim(), limit: '8' });
        const res = await backendFetch(`/users?${params}`);
        if (res.ok) {
          const users = await res.json();
          setUserOptions(Array.isArray(users) ? users : []);
        }
      } catch (error) {
        console.error('Failed to search users:', error);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [showAddModal, userQuery]);

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
        setUserQuery('');
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
                  <label className="block text-sm font-medium mb-2">User</label>
                  <input
                    type="text"
                    value={userQuery}
                    onChange={(e) => {
                      setUserQuery(e.target.value);
                      setSelectedUserId('');
                    }}
                    placeholder="Search username"
                    className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  />
                  <div className="mt-2 max-h-44 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)]">
                    {userOptions.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">No users found</div>
                    ) : (
                      userOptions.map((option) => (
                        <button
                          key={option._id}
                          type="button"
                          onClick={() => {
                            setSelectedUserId(option._id);
                            setUserQuery(option.username);
                          }}
                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--muted)] ${selectedUserId === option._id ? 'bg-[var(--muted)]' : ''}`}
                        >
                          <span className="font-medium">u/{option.username}</span>
                          {option.displayName && <span className="ml-2 text-xs text-[var(--text-secondary)]">{option.displayName}</span>}
                        </button>
                      ))
                    )}
                  </div>
                  {selectedUserId && <p className="mt-1 text-xs text-[var(--text-secondary)]">Selected user id: {selectedUserId}</p>}
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
                    setUserQuery('');
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
