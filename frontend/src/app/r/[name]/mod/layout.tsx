"use client";

import { useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { backendFetch } from '@/lib/backend';
import { useAuth } from '@/lib/context/AuthContext';

export default function ModLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const name = params?.name as string;
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingReports, setPendingReports] = useState(0);

  useEffect(() => {
    async function checkModStatus() {
      if (!isAuthenticated || !name) {
        setLoading(false);
        return;
      }

      try {
        // Check if user is a moderator
        const modRes = await backendFetch(`/subreddits/${name}/is-moderator`);
        if (modRes.ok) {
          const data = await modRes.json();
          setIsModerator(data.isModerator);

          if (data.isModerator) {
            // Fetch pending reports count
            const reportsRes = await backendFetch(`/moderation/subreddits/${name}/reports/count`);
            if (reportsRes.ok) {
              const reportsData = await reportsRes.json();
              setPendingReports(reportsData.pending || 0);
            }
          }
        }
      } catch (error) {
        console.error('Failed to check mod status:', error);
      } finally {
        setLoading(false);
      }
    }

    checkModStatus();
  }, [isAuthenticated, name]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-[var(--text-secondary)] mb-6">You must be logged in to access mod tools.</p>
          <Link
            href="/auth/"
            className="px-6 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  if (!isModerator) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-[var(--text-secondary)] mb-6">
            You must be a moderator of r/{name} to access these tools.
          </p>
          <Link
            href={`/r/${name}`}
            className="px-6 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 transition-opacity"
          >
            Back to r/{name}
          </Link>
        </div>
      </div>
    );
  }

  const isActive = (path: string) => pathname === path;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <Link href={`/r/${name}`} className="text-sm text-[var(--primary)] hover:underline mb-2 inline-block">
            ← Back to r/{name}
          </Link>
          <h1 className="text-3xl font-bold">r/{name} Moderation Tools</h1>
          <p className="text-[var(--text-secondary)] mt-1">Manage your community</p>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-md mb-6">
          <nav className="flex flex-wrap gap-2 p-2">
            <Link
              href={`/r/${name}/mod`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(`/r/${name}/mod`)
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
              }`}
            >
              📊 Dashboard
            </Link>
            <Link
              href={`/r/${name}/mod/queue`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors relative ${
                isActive(`/r/${name}/mod/queue`)
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
              }`}
            >
              🚨 Mod Queue
              {pendingReports > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingReports > 9 ? '9+' : pendingReports}
                </span>
              )}
            </Link>
            <Link
              href={`/r/${name}/mod/reports`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(`/r/${name}/mod/reports`)
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
              }`}
            >
              📝 Reports
            </Link>
            <Link
              href={`/r/${name}/mod/logs`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(`/r/${name}/mod/logs`)
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
              }`}
            >
              📜 Mod Logs
            </Link>
            <Link
              href={`/r/${name}/mod/moderators`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(`/r/${name}/mod/moderators`)
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
              }`}
            >
              👥 Moderators
            </Link>
            <Link
              href={`/r/${name}/mod/bans`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(`/r/${name}/mod/bans`)
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
              }`}
            >
              🚫 Bans
            </Link>
            <Link
              href={`/r/${name}/mod/settings`}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive(`/r/${name}/mod/settings`)
                  ? 'bg-[var(--primary)] text-white'
                  : 'hover:bg-[var(--muted)] text-[var(--text-secondary)]'
              }`}
            >
              ⚙️ Settings
            </Link>
          </nav>
        </div>

        {/* Content */}
        <div>{children}</div>
      </div>
    </div>
  );
}
