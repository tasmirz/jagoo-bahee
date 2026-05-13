"use client";

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { backendFetch } from '@/lib/backend';
import { useAuth } from '@/lib/context/AuthContext';
import ModToolsShell from '@/components/ModToolsShell';

export default function ModLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const { isAuthenticated } = useAuth();
  const name = params?.name as string;
  const [isModerator, setIsModerator] = useState(false);
  const [loading, setLoading] = useState(true);

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

  return (
    <ModToolsShell name={name}>{children}</ModToolsShell>
  );
}
