"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { backendFetch } from '@/lib/backend';

export default function SettingsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Preferences
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [mentionNotifications, setMentionNotifications] = useState(true);
  const [replyNotifications, setReplyNotifications] = useState(true);
  const [awardNotifications, setAwardNotifications] = useState(true);
  const [autoplayVideos, setAutoplayVideos] = useState(true);
  const [compactView, setCompactView] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchSettings() {
      try {
        const res = await backendFetch('/users/me/settings');
        if (res.ok) {
          const data = await res.json();
          // Set preferences from backend
          setEmailNotifications(data.emailNotifications || false);
          setMentionNotifications(data.mentionNotifications !== false);
          setReplyNotifications(data.replyNotifications !== false);
          setAwardNotifications(data.awardNotifications !== false);
          setAutoplayVideos(data.autoplayVideos !== false);
          setCompactView(data.compactView || false);
          setDarkMode(data.darkMode || false);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, [isAuthenticated, router]);

  const handleSave = async () => {
    setSaving(true);

    try {
      const res = await backendFetch('/users/me/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailNotifications,
          mentionNotifications,
          replyNotifications,
          awardNotifications,
          autoplayVideos,
          compactView,
          darkMode,
        }),
      });

      if (res.ok) {
        alert('Settings saved successfully!');
      } else {
        alert('Failed to save settings');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
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
      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold mb-6">Settings</h1>

        <div className="space-y-6">
          {/* Notifications */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Notifications</h2>
            
            <div className="space-y-4">

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Mention notifications</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    When someone mentions you
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={mentionNotifications}
                  onChange={(e) => setMentionNotifications(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Reply notifications</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    When someone replies to your posts or comments
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={replyNotifications}
                  onChange={(e) => setReplyNotifications(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Award notifications</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    When you receive an award
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={awardNotifications}
                  onChange={(e) => setAwardNotifications(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>
            </div>
          </div>

          {/* Content Preferences */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Content Preferences</h2>
            
            <div className="space-y-4">

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Autoplay videos</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Automatically play videos in feed
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoplayVideos}
                  onChange={(e) => setAutoplayVideos(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Appearance</h2>
            
            <div className="space-y-4">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Compact view</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Show more posts on screen with reduced spacing
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={compactView}
                  onChange={(e) => setCompactView(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="font-medium">Dark mode</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Use dark theme (experimental)
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={darkMode}
                  onChange={(e) => setDarkMode(e.target.checked)}
                  className="w-5 h-5"
                />
              </label>
            </div>
          </div>

          {/* Privacy & Security */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Privacy & Security</h2>
            
            <div className="space-y-3">
              <button className="w-full text-left px-4 py-3 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors">
                <div className="font-medium">Export your data</div>
                <div className="text-sm text-[var(--text-secondary)]">
                  Download all your posts, comments, and activity
                </div>
              </button>

              <button className="w-full text-left px-4 py-3 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors">
                <div className="font-medium">Blocked users</div>
                <div className="text-sm text-[var(--text-secondary)]">
                  Manage your blocked users list
                </div>
              </button>

              <button className="w-full text-left px-4 py-3 border border-red-200 rounded-md hover:bg-red-50 transition-colors text-red-600">
                <div className="font-medium">Delete account</div>
                <div className="text-sm">
                  Permanently delete your account and all data
                </div>
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 bg-[var(--primary)] text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-3 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
