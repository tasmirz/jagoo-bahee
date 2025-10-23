"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { useRouter } from 'next/navigation';
import { backendFetch } from '@/lib/backend';
import { User } from '@/lib/types';

export default function ProfileSettingsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarId, setAvatarId] = useState('');
  const [bannerId, setBannerId] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [bannerPreview, setBannerPreview] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
      return;
    }

    async function fetchProfile() {
      try {
        const res = await backendFetch('/users/me/profile');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
          setUsername(data.username || '');
          setDisplayName(data.displayName || '');
          setBio(data.bio || '');
          setAvatarId((data as any).avatarId || '');
          setBannerId((data as any).bannerId || '');
          setAvatarPreview(data.avatarUrl || '');
          setBannerPreview(''); // Banner URL not in schema, will need to fetch if needed
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [isAuthenticated, router]);

  const handleFileUpload = async (file: File, type: 'avatar' | 'banner') => {
    if (type === 'avatar') {
      setUploadingAvatar(true);
    } else {
      setUploadingBanner(true);
    }

    try {
      // Step 1: Request upload URL
      const uploadUrlRes = await backendFetch('/attachments/presigned-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!uploadUrlRes.ok) {
        throw new Error('Failed to get upload URL');
      }

      const uploadData = await uploadUrlRes.json();
      const uploadUrl = uploadData.uploadUrl;
      const key = uploadData.minioKey || uploadData.key;

      if (!uploadUrl || !key) {
        throw new Error('Invalid upload URL response');
      }

      // Step 2: Upload file to MinIO
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadRes.ok) {
        console.error('MinIO upload failed:', uploadRes.status, uploadRes.statusText);
        const errorText = await uploadRes.text();
        console.error('MinIO error:', errorText);
        throw new Error(`Failed to upload file to MinIO: ${uploadRes.status}`);
      }

      console.log('File uploaded to MinIO successfully');

      // Step 3: Confirm upload
      const confirmRes = await backendFetch('/attachments/confirm-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!confirmRes.ok) {
        const errorText = await confirmRes.text();
        console.error('Confirm upload failed:', confirmRes.status, errorText);
        throw new Error('Failed to confirm upload');
      }

      const confirmed = await confirmRes.json();
      console.log('Upload confirmed:', confirmed);
      
      // Set the attachment ID and preview
      if (type === 'avatar') {
        setAvatarId(confirmed._id);
        setAvatarPreview(URL.createObjectURL(file));
      } else {
        setBannerId(confirmed._id);
        setBannerPreview(URL.createObjectURL(file));
      }

      alert(`${type === 'avatar' ? 'Avatar' : 'Banner'} uploaded successfully!`);
    } catch (error) {
      console.error('Upload error:', error);
      alert(`Failed to upload ${type === 'avatar' ? 'avatar' : 'banner'}`);
    } finally {
      if (type === 'avatar') {
        setUploadingAvatar(false);
      } else {
        setUploadingBanner(false);
      }
    }
  };

  const handleSave = async () => {
    if (!username.trim()) {
      alert('Username is required');
      return;
    }

    if (username.length < 3 || username.length > 30) {
      alert('Username must be between 3 and 30 characters');
      return;
    }

    if (bio.length > 500) {
      alert('Bio must be 500 characters or less');
      return;
    }

    setSaving(true);

    try {
      const payload: any = {
        username: username.trim(),
        displayName: displayName.trim(),
        bio: bio.trim(),
      };

      if (avatarId) payload.avatarId = avatarId;
      if (bannerId) payload.bannerId = bannerId;

      const res = await backendFetch('/users/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const updated = await res.json();
        setUser(updated);
        alert('Profile updated successfully!');
        // Redirect to profile page
        router.push(`/users/${updated.username}`);
      } else {
        const error = await res.json();
        alert(error.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('Failed to update profile');
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
        <h1 className="text-3xl font-bold mb-6">Edit Profile</h1>

        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
          <div className="space-y-6">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                placeholder="Enter username"
                minLength={3}
                maxLength={30}
              />
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                3-30 characters. This will be your unique identifier.
              </p>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Display Name (Optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                placeholder="Enter display name"
                maxLength={50}
              />
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                A friendly name that appears alongside your username.
              </p>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] min-h-[120px]"
                placeholder="Tell us about yourself..."
                maxLength={500}
              />
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                {bio.length}/500 characters
              </p>
            </div>

            {/* Avatar Upload */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Avatar (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'avatar');
                }}
                disabled={uploadingAvatar}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[var(--primary)] file:text-white hover:file:opacity-90"
              />
              {uploadingAvatar && (
                <p className="text-sm text-[var(--primary)] mt-2">Uploading avatar...</p>
              )}
              {avatarPreview && (
                <div className="mt-3">
                  <p className="text-sm text-[var(--text-secondary)] mb-2">Preview:</p>
                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={avatarPreview} 
                      alt="Avatar preview" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Banner Upload */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Banner (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, 'banner');
                }}
                disabled={uploadingBanner}
                className="w-full px-4 py-2 border border-[var(--border)] rounded-lg bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[var(--primary)] file:text-white hover:file:opacity-90"
              />
              {uploadingBanner && (
                <p className="text-sm text-[var(--primary)] mt-2">Uploading banner...</p>
              )}
              {bannerPreview && (
                <div className="mt-3">
                  <p className="text-sm text-[var(--text-secondary)] mb-2">Preview:</p>
                  <div className="w-full h-32 rounded-lg overflow-hidden border-2 border-[var(--border)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={bannerPreview} 
                      alt="Banner preview" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => router.back()}
                disabled={saving}
                className="px-6 py-2 border border-[var(--border)] rounded-lg hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>

        {/* Current Profile Preview */}
        {user && (
          <div className="mt-6 bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Current Profile</h2>
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Username:</span> u/{user.username}</p>
              {user.displayName && <p><span className="font-medium">Display Name:</span> {user.displayName}</p>}
              <p><span className="font-medium">Karma:</span> {user.karma?.toLocaleString() || 0}</p>
              <p><span className="font-medium">Joined:</span> {new Date(user.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
