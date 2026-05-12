'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import backend from '@/lib/backend';
import { getToken, getPublicKey } from '@/lib/auth';
import { applyTheme, themes } from '@/components/theme-toggle';
import { Palette, Server } from 'lucide-react';

export default function UserSettingsPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [theme, setTheme] = useState('system');
  const [homeserver, setHomeserver] = useState('http://localhost:6000');

  useEffect(() => {
    async function load() {
      try {
        const token = getToken();
        if (!token) {
          router.push('/auth');
          return;
        }
        const res = await backend.backendFetch('/users/me/profile');
        if (res.ok) {
          const data = await res.json();
          setUsername(data.username || '');
          setBio(data.bio || '');
          setAvatarUrl(data.avatarUrl || '');
        }
        const storedTheme = window.localStorage.getItem('jb-theme') || 'system';
        setTheme(storedTheme);
        setHomeserver(window.localStorage.getItem('jb-homeserver') || 'http://localhost:6000');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await backend.backendJson('PATCH', '/users/me/profile', {
        username,
        bio,
        avatarUrl,
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

  if (loading) return <div className="p-8 text-center">Loading settings...</div>;

  const pubKey = getPublicKey();

  function saveLocalPreference(nextTheme = theme, nextHomeserver = homeserver) {
    window.localStorage.setItem('jb-theme', nextTheme);
    window.localStorage.setItem('jb-homeserver', nextHomeserver.trim().replace(/\/$/, ''));
    applyTheme(nextTheme);
    setSuccess('Preferences saved.');
  }

  return (
    <div className="max-w-2xl mx-auto p-4 py-8">
      <h1 className="text-2xl font-bold mb-6">User Settings</h1>

      <div className="mb-6">
        <Link href="/settings/comments" className="text-sm font-medium text-[var(--primary)] hover:underline">
          Open Comment Settings
        </Link>
      </div>

      {error && <div className="bg-red-500/10 text-red-500 p-3 rounded-lg mb-4 border border-red-500/20 text-sm">{error}</div>}
      {success && <div className="bg-green-500/10 text-green-500 p-3 rounded-lg mb-4 border border-green-500/20 text-sm">{success}</div>}

      <div className="mb-6 grid gap-4 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Palette size={18} />
          Interface
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            Theme
            <select
              value={theme}
              onChange={(event) => {
                setTheme(event.target.value);
                saveLocalPreference(event.target.value, homeserver);
              }}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            >
              {themes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="flex items-center gap-2"><Server size={16} /> Homeserver</span>
            <input
              value={homeserver}
              onChange={(event) => setHomeserver(event.target.value)}
              onBlur={() => saveLocalPreference(theme, homeserver)}
              className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
            />
          </label>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full p-2 border border-[var(--border)] rounded bg-[var(--card)]" maxLength={30} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Bio</label>
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} className="w-full p-2 border border-[var(--border)] rounded bg-[var(--card)] resize-y" maxLength={500} />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Avatar URL</label>
          <input type="text" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="w-full p-2 border border-[var(--border)] rounded bg-[var(--card)]" />
        </div>

        {pubKey && (
          <div className="text-xs text-[var(--text-secondary)] break-all">
            <span className="font-medium">Public Key: </span>
            {pubKey}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={() => router.back()} className="px-4 py-2 text-sm border border-[var(--border)] rounded-full hover:bg-[var(--muted)]">Cancel</button>
          <button type="submit" disabled={saving} className="px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
