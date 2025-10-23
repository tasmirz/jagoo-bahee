"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { backendJson, backendFetch } from '@/lib/backend';
import FileUploader from '@/components/FileUploader';

export default function CreateSubredditPage() {
  const router = useRouter();
  const { isAuthenticated, authId } = useAuth();
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [iconAttachmentId, setIconAttachmentId] = useState<string>('');
  const [bannerAttachmentId, setBannerAttachmentId] = useState<string>('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameAvailability, setNameAvailability] = useState<'checking' | 'available' | 'unavailable' | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
    }
  }, [isAuthenticated, router]);

  // Debounced name availability check
  useEffect(() => {
    if (!name) {
      setNameAvailability(null)
      setNameError(null)
      return
    }

    const validationError = validateName(name)
    if (validationError) {
      setNameError(validationError)
      setNameAvailability(null)
      return
    }

    setNameError(null)
    setNameAvailability('checking')

    const timeoutId = setTimeout(async () => {
      try {
        const response = await backendFetch(`/subreddits/check-name/${encodeURIComponent(name)}`)
        if (response.ok) {
          const data = await response.json().catch(() => null)
          if (data && data.available) {
            setNameAvailability('available')
          } else {
            setNameAvailability('unavailable')
          }
        } else if (response.status === 409) {
          // backend throws 409 Conflict when name is taken
          setNameAvailability('unavailable')
        } else {
          // other errors — don't falsely mark available
          setNameAvailability(null)
        }
      } catch (err) {
        // network error — don't show as unavailable
        setNameAvailability(null)
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [name])

  const validateName = (value: string) => {
    if (value.length < 3) return 'Name must be at least 3 characters';
    if (value.length > 21) return 'Name must be at most 21 characters';
    if (!/^[a-zA-Z0-9_]+$/.test(value)) return 'Name can only contain letters, numbers, and underscores';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateName(name);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (nameAvailability === 'unavailable') {
      setError('This community name is already taken');
      return;
    }

    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await backendJson('POST', '/subreddits', {
        name,
        displayName: displayName.trim(),
        description: description.trim() || undefined,
        creatorId: authId,
        iconAttachmentId: iconAttachmentId || undefined,
        bannerAttachmentId: bannerAttachmentId || undefined,
        isPrivate,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || 'Failed to create community');
      }

      const data = await response.json();
      router.push(`/r/${data.name || name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create community');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Create a Community</h1>

        <form onSubmit={handleSubmit} className="bg-[var(--card)] border border-[var(--border)] rounded-md p-6 space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Community Name *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-[var(--text-secondary)]">r/</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                className={`w-full pl-9 pr-10 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent ${
                  nameError ? 'border-red-500' : nameAvailability === 'available' ? 'border-green-500' : nameAvailability === 'unavailable' ? 'border-red-500' : 'border-[var(--border)]'
                }`}
                placeholder="community_name"
                required
                maxLength={21}
              />
              {nameAvailability === 'checking' && (
                <div className="absolute right-3 top-2.5">
                  <div className="animate-spin h-5 w-5 border-2 border-[var(--primary)] border-t-transparent rounded-full"></div>
                </div>
              )}
              {nameAvailability === 'available' && !nameError && (
                <div className="absolute right-3 top-2 text-green-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
              {(nameAvailability === 'unavailable' || nameError) && (
                <div className="absolute right-3 top-2 text-red-500">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
            </div>
            {nameError && (
              <p className="text-xs text-red-500 mt-1">{nameError}</p>
            )}
            {nameAvailability === 'unavailable' && !nameError && (
              <p className="text-xs text-red-500 mt-1">This name is already taken</p>
            )}
            {nameAvailability === 'available' && !nameError && (
              <p className="text-xs text-green-500 mt-1">This name is available!</p>
            )}
            {!nameError && !nameAvailability && (
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                3-21 characters, letters, numbers, and underscores only
              </p>
            )}
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Display Name *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              placeholder="Community Display Name"
              required
              maxLength={100}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none"
              placeholder="Tell people what this community is about..."
              rows={4}
              maxLength={500}
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              {description.length}/500 characters
            </p>
          </div>

          {/* Community Icon */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Community Icon (optional)
            </label>
            <FileUploader
              acceptedTypes="image/*"
              maxSizeMB={2}
              onUploadComplete={(fileId) => setIconAttachmentId(fileId)}
              label="Upload Icon"
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Square image recommended (e.g. 256x256)
            </p>
          </div>

          {/* Community Banner */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Community Banner (optional)
            </label>
            <FileUploader
              acceptedTypes="image/*"
              maxSizeMB={5}
              onUploadComplete={(fileId) => setBannerAttachmentId(fileId)}
              label="Upload Banner"
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Wide banner image recommended (e.g. 1920x384)
            </p>
          </div>

          {/* Options */}


          {/* Error Message */}
          {error && (
            <div className="bg-[var(--error)] bg-opacity-10 border border-[var(--error)] rounded-md p-3 text-sm text-[var(--error)]">
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 font-medium"
            >
              {isSubmitting ? 'Creating...' : 'Create Community'}
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="px-6 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
