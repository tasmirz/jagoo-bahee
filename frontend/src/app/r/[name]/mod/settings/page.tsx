"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { backendFetch } from '@/lib/backend';
import { Subreddit } from '@/lib/types';
import FileUploader from '@/components/FileUploader';

export default function SubredditSettingsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  const [subreddit, setSubreddit] = useState<Subreddit | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [allowImages, setAllowImages] = useState(true);
  const [allowVideos, setAllowVideos] = useState(true);
  const [allowPolls, setAllowPolls] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [iconAttachmentId, setIconAttachmentId] = useState<string>('');
  const [bannerAttachmentId, setBannerAttachmentId] = useState<string>('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchSubreddit() {
      try {
        const res = await backendFetch(`/subreddits/${subredditName}`);
        if (res.ok) {
          const data = await res.json();
          setSubreddit(data);
          setDescription(data.description || '');
          setRules(data.rules || '');
          setIsPublic(data.isPublic !== false);
          setIconAttachmentId(data.iconAttachmentId || '');
          setBannerAttachmentId(data.bannerAttachmentId || '');
          // These would come from backend settings
          setAllowImages(true);
          setAllowVideos(true);
          setAllowPolls(true);
          setRequireApproval(false);
        }
      } catch (error) {
        console.error('Failed to fetch subreddit:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchSubreddit();
  }, [isAuthenticated, router, subredditName]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await backendFetch(`/subreddits/${subreddit?._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim(),
          rules: rules.trim(),
          isPublic,
          iconAttachmentId: iconAttachmentId || undefined,
          bannerAttachmentId: bannerAttachmentId || undefined,
          // Additional settings would be sent here
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

  if (!subreddit) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Subreddit not found</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Subreddit Settings</h1>
          <p className="text-[var(--text-secondary)]">r/{subredditName}</p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Basic Information</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your subreddit..."
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                  rows={4}
                  maxLength={500}
                />
                <div className="text-xs text-[var(--text-secondary)] mt-1">
                  {description.length}/500 characters
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Rules
                </label>
                <textarea
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  placeholder="List your subreddit rules..."
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] resize-none"
                  rows={6}
                  maxLength={2000}
                />
                <div className="text-xs text-[var(--text-secondary)] mt-1">
                  {rules.length}/2000 characters
                </div>
              </div>
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Appearance</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Subreddit Icon
                </label>
                <p className="text-xs text-[var(--text-secondary)] mb-2">
                  Upload a square image for your subreddit icon (max 2MB)
                </p>
                <FileUploader
                  onUploadComplete={(fileId) => setIconAttachmentId(fileId)}
                  acceptedTypes="image/*"
                  maxSizeMB={2}
                  label="Upload Icon"
                />
                {iconAttachmentId && (
                  <div className="mt-2 text-xs text-green-600">
                    ✓ Icon uploaded
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Banner Image
                </label>
                <p className="text-xs text-[var(--text-secondary)] mb-2">
                  Upload a banner image for your subreddit (recommended: 1920x384px, max 5MB)
                </p>
                <FileUploader
                  onUploadComplete={(fileId) => setBannerAttachmentId(fileId)}
                  acceptedTypes="image/*"
                  maxSizeMB={5}
                  label="Upload Banner"
                />
                {bannerAttachmentId && (
                  <div className="mt-2 text-xs text-green-600">
                    ✓ Banner uploaded
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Privacy</h2>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Public</div>
                <div className="text-sm text-[var(--text-secondary)]">
                  Anyone can view and subscribe to this community
                </div>
              </div>
            </label>
          </div>

          {/* Content Settings */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Content Settings</h2>
            
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowImages}
                  onChange={(e) => setAllowImages(e.target.checked)}
                  className="w-5 h-5"
                />
                <div>
                  <div className="font-medium">Allow image posts</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Members can upload images
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowVideos}
                  onChange={(e) => setAllowVideos(e.target.checked)}
                  className="w-5 h-5"
                />
                <div>
                  <div className="font-medium">Allow video posts</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Members can upload videos
                  </div>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowPolls}
                  onChange={(e) => setAllowPolls(e.target.checked)}
                  className="w-5 h-5"
                />
                <div>
                  <div className="font-medium">Allow polls</div>
                  <div className="text-sm text-[var(--text-secondary)]">
                    Members can create polls
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Moderation */}
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Moderation</h2>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireApproval}
                onChange={(e) => setRequireApproval(e.target.checked)}
                className="w-5 h-5"
              />
              <div>
                <div className="font-medium">Require post approval</div>
                <div className="text-sm text-[var(--text-secondary)]">
                  All posts must be approved by moderators before appearing
                </div>
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-[var(--primary)] text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-3 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
