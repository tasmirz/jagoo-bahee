'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import backend from '@/lib/backend';
import { Subreddit } from '@/lib/types';

export default function CommunitySettingsPage() {
  const params = useParams();
  const router = useRouter();
  const name = params.name as string;

  const [subreddit, setSubreddit] = useState<Subreddit | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await backend.backendFetch(`/subreddits/${name}`);
        if (res.status === 401) {
          router.push('/auth');
          return;
        }
        if (!res.ok) throw new Error('Community not found');
        const data = await res.json();
        setSubreddit(data);
        setDisplayName(data.displayName || '');
        setDescription(data.description || '');
        setRules(data.rules || '');
        setIsPrivate(data.isPrivate || false);

        const modRes = await backend.backendFetch(`/subreddits/${data._id}/is-moderator`);
        if (modRes.ok) {
          const modData = await modRes.json();
          setIsMod(modData.isModerator);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [name, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!subreddit) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await backend.backendJson('PUT', `/subreddits/${subreddit._id}`, {
        displayName,
        description,
        rules,
        isPrivate,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(errData.message || 'Failed to save'));
      }
      setSuccess('Settings saved successfully.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-8 text-center">Loading community settings...</div>;
  if (!subreddit) return <div className="p-8 text-center">Community not found.</div>;
  if (!isMod) return <div className="p-8 text-center text-[var(--error)]">You must be a moderator to access this page.</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Community Settings</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">r/{subreddit.name}</p>

      {error && <div className="bg-red-500/10 text-red-500 p-3 rounded-lg mb-4 border border-red-500/20 text-sm">{error}</div>}
      {success && <div className="bg-green-500/10 text-green-500 p-3 rounded-lg mb-4 border border-green-500/20 text-sm">{success}</div>}

      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full p-2 border border-[var(--border)] rounded bg-[var(--card)]" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full p-2 border border-[var(--border)] rounded bg-[var(--card)] resize-y" />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Rules (Markdown)</label>
          <textarea value={rules} onChange={(e) => setRules(e.target.value)} rows={6} className="w-full p-2 border border-[var(--border)] rounded bg-[var(--card)] resize-y" />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="isPrivate" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="w-4 h-4" />
          <label htmlFor="isPrivate" className="text-sm font-medium">Private community</label>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm border border-[var(--border)] rounded-full hover:bg-[var(--muted)]">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
