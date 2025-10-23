"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import Link from 'next/link';

// Permission bits matching backend
export const RolePermissions = {
  // Content Management
  POSTS_VIEW: 1 << 0,
  POSTS_CREATE: 1 << 1,
  POSTS_EDIT_OWN: 1 << 2,
  POSTS_EDIT_ALL: 1 << 3,
  POSTS_DELETE_OWN: 1 << 4,
  POSTS_DELETE_ALL: 1 << 5,
  POSTS_PIN: 1 << 6,
  POSTS_LOCK: 1 << 7,
  POSTS_APPROVE: 1 << 8,
  POSTS_REMOVE: 1 << 9,
  
  // Comments
  COMMENTS_VIEW: 1 << 10,
  COMMENTS_CREATE: 1 << 11,
  COMMENTS_EDIT_OWN: 1 << 12,
  COMMENTS_EDIT_ALL: 1 << 13,
  COMMENTS_DELETE_ALL: 1 << 14,
  
  // Moderation
  MOD_VIEW_REPORTS: 1 << 15,
  MOD_HANDLE_REPORTS: 1 << 16,
  MOD_VIEW_LOGS: 1 << 17,
  MOD_BAN_USERS: 1 << 18,
  MOD_MUTE_USERS: 1 << 19,
  
  // Members
  MEMBERS_VIEW: 1 << 20,
  MEMBERS_KICK: 1 << 21,
  MEMBERS_INVITE: 1 << 22,
  
  // Settings
  SETTINGS_VIEW: 1 << 23,
  SETTINGS_EDIT: 1 << 24,
  SETTINGS_ROLES: 1 << 25,
  SETTINGS_MODERATORS: 1 << 26,
  SETTINGS_DELETE: 1 << 27,
  
  // Special
  ALL_PERMISSIONS: 1 << 28,
};

const permissionGroups = [
  {
    name: 'Content Management',
    permissions: [
      { bit: RolePermissions.POSTS_VIEW, name: 'View Posts', description: 'Can view posts in the subreddit' },
      { bit: RolePermissions.POSTS_CREATE, name: 'Create Posts', description: 'Can create new posts' },
      { bit: RolePermissions.POSTS_EDIT_OWN, name: 'Edit Own Posts', description: 'Can edit their own posts' },
      { bit: RolePermissions.POSTS_EDIT_ALL, name: 'Edit All Posts', description: 'Can edit any post' },
      { bit: RolePermissions.POSTS_DELETE_OWN, name: 'Delete Own Posts', description: 'Can delete their own posts' },
      { bit: RolePermissions.POSTS_DELETE_ALL, name: 'Delete All Posts', description: 'Can delete any post' },
      { bit: RolePermissions.POSTS_PIN, name: 'Pin Posts', description: 'Can pin posts to top' },
      { bit: RolePermissions.POSTS_LOCK, name: 'Lock Posts', description: 'Can lock posts (prevent comments)' },
      { bit: RolePermissions.POSTS_APPROVE, name: 'Approve Posts', description: 'Can approve posts in mod queue' },
      { bit: RolePermissions.POSTS_REMOVE, name: 'Remove Posts', description: 'Can remove posts' },
    ],
  },
  {
    name: 'Comments',
    permissions: [
      { bit: RolePermissions.COMMENTS_VIEW, name: 'View Comments', description: 'Can view comments' },
      { bit: RolePermissions.COMMENTS_CREATE, name: 'Create Comments', description: 'Can create comments' },
      { bit: RolePermissions.COMMENTS_EDIT_OWN, name: 'Edit Own Comments', description: 'Can edit their own comments' },
      { bit: RolePermissions.COMMENTS_EDIT_ALL, name: 'Edit All Comments', description: 'Can edit any comment' },
      { bit: RolePermissions.COMMENTS_DELETE_ALL, name: 'Delete All Comments', description: 'Can delete any comment' },
    ],
  },
  {
    name: 'Moderation',
    permissions: [
      { bit: RolePermissions.MOD_VIEW_REPORTS, name: 'View Reports', description: 'Can view user reports' },
      { bit: RolePermissions.MOD_HANDLE_REPORTS, name: 'Handle Reports', description: 'Can act on reports' },
      { bit: RolePermissions.MOD_VIEW_LOGS, name: 'View Mod Logs', description: 'Can view moderation history' },
      { bit: RolePermissions.MOD_BAN_USERS, name: 'Ban Users', description: 'Can ban/unban users' },
      { bit: RolePermissions.MOD_MUTE_USERS, name: 'Mute Users', description: 'Can mute/unmute users' },
    ],
  },
  {
    name: 'Members',
    permissions: [
      { bit: RolePermissions.MEMBERS_VIEW, name: 'View Members', description: 'Can view member list' },
      { bit: RolePermissions.MEMBERS_KICK, name: 'Kick Members', description: 'Can kick members from subreddit' },
      { bit: RolePermissions.MEMBERS_INVITE, name: 'Invite Members', description: 'Can invite new members' },
    ],
  },
  {
    name: 'Settings',
    permissions: [
      { bit: RolePermissions.SETTINGS_VIEW, name: 'View Settings', description: 'Can view subreddit settings' },
      { bit: RolePermissions.SETTINGS_EDIT, name: 'Edit Settings', description: 'Can edit subreddit settings' },
      { bit: RolePermissions.SETTINGS_ROLES, name: 'Manage Roles', description: 'Can create/edit roles' },
      { bit: RolePermissions.SETTINGS_MODERATORS, name: 'Manage Moderators', description: 'Can add/remove moderators' },
      { bit: RolePermissions.SETTINGS_DELETE, name: 'Delete Subreddit', description: 'Can delete the subreddit (Owner only)' },
    ],
  },
];

interface Role {
  _id: string;
  name: string;
  subredditId: string;
  permissions: string;
  isSystemRole: boolean;
}

export default function RolesPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [editingPerms, setEditingPerms] = useState<number>(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }
    fetchRoles();
  }, [isAuthenticated, router, subredditName]);

  const fetchRoles = async () => {
    try {
      const res = await backendFetch(`/roles/subreddit/${subredditName}`);
      if (res.ok) {
        const data = await res.json();
        setRoles(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch roles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionToggle = (bit: number) => {
    setEditingPerms(prev => prev ^ bit);
  };

  const hasPermission = (permissions: number, bit: number) => {
    return (permissions & bit) !== 0;
  };

  const saveRole = async () => {
    if (!selectedRole) return;

    try {
      const res = await backendFetch(`/roles/${selectedRole._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: editingPerms.toString(),
        }),
      });

      if (res.ok) {
        alert('✅ Role permissions updated!');
        fetchRoles();
        setSelectedRole(null);
      } else {
        const error = await res.json();
        alert(`Failed to update role: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to save role:', error);
      alert('Failed to save role permissions');
    }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) {
      alert('Please enter a role name');
      return;
    }

    try {
      const res = await backendFetch('/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoleName.trim(),
          subredditName,
          permissions: '0',
        }),
      });

      if (res.ok) {
        alert('✅ Role created!');
        setNewRoleName('');
        setShowCreateModal(false);
        fetchRoles();
      } else {
        const error = await res.json();
        alert(`Failed to create role: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to create role:', error);
      alert('Failed to create role');
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
            <h1 className="text-2xl font-bold">Roles & Permissions</h1>
            <p className="text-[var(--text-secondary)]">r/{subredditName}</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity"
            >
              Create Role
            </button>
            <Link
              href={`/r/${subredditName}/mod`}
              className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
            >
              Back to Mod Tools
            </Link>
          </div>
        </div>

        {/* Roles List */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
              <h3 className="font-semibold mb-4">Roles</h3>
              <div className="space-y-2">
                {roles.map((role) => (
                  <button
                    key={role._id}
                    onClick={() => {
                      setSelectedRole(role);
                      setEditingPerms(Number(role.permissions || 0));
                    }}
                    className={`w-full text-left px-4 py-3 rounded-md transition-colors ${
                      selectedRole?._id === role._id
                        ? 'bg-[var(--primary)] text-white'
                        : 'bg-[var(--muted)] hover:bg-[var(--primary)]/10'
                    }`}
                  >
                    <div className="font-medium">{role.name}</div>
                    {role.isSystemRole && (
                      <div className="text-xs opacity-75">System Role</div>
                    )}
                  </button>
                ))}
                {roles.length === 0 && (
                  <div className="text-center text-[var(--text-secondary)] py-8">
                    No roles yet. Create one!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Permissions Editor */}
          <div className="lg:col-span-2">
            {selectedRole ? (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold">{selectedRole.name}</h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                      Edit permissions for this role
                    </p>
                  </div>
                  <button
                    onClick={saveRole}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                  >
                    Save Changes
                  </button>
                </div>

                <div className="space-y-6">
                  {permissionGroups.map((group) => (
                    <div key={group.name}>
                      <h3 className="font-semibold mb-3 text-lg">{group.name}</h3>
                      <div className="space-y-2">
                        {group.permissions.map((perm) => (
                          <label
                            key={perm.bit}
                            className="flex items-start gap-3 p-3 rounded-md hover:bg-[var(--muted)] cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={hasPermission(editingPerms, perm.bit)}
                              onChange={() => handlePermissionToggle(perm.bit)}
                              className="mt-1 w-4 h-4"
                            />
                            <div className="flex-1">
                              <div className="font-medium">{perm.name}</div>
                              <div className="text-sm text-[var(--text-secondary)]">
                                {perm.description}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-12 text-center">
                <p className="text-[var(--text-secondary)]">
                  Select a role to edit its permissions
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Role Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-[var(--card)] rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Create New Role</h3>
            <input
              type="text"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              placeholder="Role name (e.g., Content Moderator)"
              className="w-full px-4 py-2 border border-[var(--border)] rounded-md mb-4 bg-[var(--background)]"
            />
            <div className="flex gap-3">
              <button
                onClick={createRole}
                className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewRoleName('');
                }}
                className="flex-1 px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
