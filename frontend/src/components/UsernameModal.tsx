"use client";

import { useState } from 'react';
import { backendFetch } from '@/lib/backend';

interface UsernameModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

export default function UsernameModal({ isOpen, onComplete }: UsernameModalProps) {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Validate username format
      if (username.length < 3) {
        setError('Username must be at least 3 characters');
        setLoading(false);
        return;
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        setError('Username can only contain letters, numbers, underscores, and hyphens');
        setLoading(false);
        return;
      }

      const response = await backendFetch('/users/me/create', {
        method: 'POST',
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        const data = await response.json();
        setError(data.message || 'Failed to create username');
        setLoading(false);
        return;
      }

      onComplete();
    } catch (err) {
      setError('Failed to create username. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg max-w-md w-full p-6">
        <h2 className="text-2xl font-bold mb-4">Choose Your Username</h2>
        <p className="text-[var(--text-secondary)] mb-6">
          Welcome! Please choose a username to complete your profile.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium mb-2">
              Username
            </label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="your_username"
              disabled={loading}
              autoFocus
            />
            {error && (
              <p className="text-[var(--error)] text-sm mt-2">{error}</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !username}
              className="flex-1 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating...' : 'Create Username'}
            </button>
          </div>
        </form>

        <div className="mt-4 text-xs text-[var(--text-secondary)]">
          <p>• Username must be at least 3 characters</p>
          <p>• Can only contain letters, numbers, _, and -</p>
          <p>• Cannot be changed later</p>
        </div>
      </div>
    </div>
  );
}
