"use client";

import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import Link from 'next/link';
import { useEffect } from 'react';

export default function ModToolsPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
    }
  }, [isAuthenticated, router]);

  const tools = [
    {
      title: 'Moderation Queue',
      description: 'Review reported posts and comments',
      icon: '📋',
      href: `/r/${subredditName}/mod/queue`,
      color: 'from-red-500 to-orange-500',
    },
    {
      title: 'Mod Log',
      description: 'View all moderation actions',
      icon: '📜',
      href: `/r/${subredditName}/mod/logs`,
      color: 'from-blue-500 to-cyan-500',
    },
    {
      title: 'Banned Users',
      description: 'Manage banned users',
      icon: '🚫',
      href: `/r/${subredditName}/mod/banned`,
      color: 'from-purple-500 to-pink-500',
    },
    {
      title: 'Rules & Settings',
      description: 'Configure subreddit rules',
      icon: '⚙️',
      href: `/r/${subredditName}/mod/settings`,
      color: 'from-green-500 to-emerald-500',
    },
    {
      title: 'Roles & Permissions',
      description: 'Manage roles and permissions',
      icon: '👔',
      href: `/r/${subredditName}/mod/roles`,
      color: 'from-teal-500 to-cyan-500',
    },
    {
      title: 'Moderators',
      description: 'Manage moderator team',
      icon: '👥',
      href: `/r/${subredditName}/mod/moderators`,
      color: 'from-yellow-500 to-amber-500',
    },
    {
      title: 'Auto-Moderator',
      description: 'Configure automatic moderation',
      icon: '🤖',
      href: `/r/${subredditName}/mod/automod`,
      color: 'from-indigo-500 to-blue-500',
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Link
              href={`/r/${subredditName}`}
              className="text-[var(--text-secondary)] hover:text-[var(--foreground)]"
            >
              r/{subredditName}
            </Link>
            <span className="text-[var(--text-secondary)]">/</span>
            <span className="font-semibold">Moderator Tools</span>
          </div>
          <h1 className="text-3xl font-bold">Moderator Tools</h1>
          <p className="text-[var(--text-secondary)] mt-2">
            Manage and moderate r/{subredditName}
          </p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 hover:shadow-lg transition-all hover:-translate-y-1"
            >
              <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${tool.color} flex items-center justify-center text-2xl mb-4`}>
                {tool.icon}
              </div>
              <h3 className="font-bold text-lg mb-2 group-hover:text-[var(--primary)] transition-colors">
                {tool.title}
              </h3>
              <p className="text-sm text-[var(--text-secondary)]">
                {tool.description}
              </p>
            </Link>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
          <h2 className="font-bold text-xl mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button className="px-4 py-3 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors text-left">
              <div className="font-medium">Pin Announcement</div>
              <div className="text-sm text-[var(--text-secondary)]">Pin a post to the top</div>
            </button>
            <button className="px-4 py-3 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors text-left">
              <div className="font-medium">Lock Subreddit</div>
              <div className="text-sm text-[var(--text-secondary)]">Restrict posting temporarily</div>
            </button>
            <button className="px-4 py-3 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors text-left">
              <div className="font-medium">Export Reports</div>
              <div className="text-sm text-[var(--text-secondary)]">Download report data</div>
            </button>
            <button className="px-4 py-3 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors text-left">
              <div className="font-medium">Bulk Actions</div>
              <div className="text-sm text-[var(--text-secondary)]">Perform actions on multiple items</div>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-[var(--primary)]">0</div>
            <div className="text-sm text-[var(--text-secondary)]">Pending Reports</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-[var(--primary)]">0</div>
            <div className="text-sm text-[var(--text-secondary)]">Actions Today</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-[var(--primary)]">0</div>
            <div className="text-sm text-[var(--text-secondary)]">Banned Users</div>
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
            <div className="text-2xl font-bold text-[var(--primary)]">0</div>
            <div className="text-sm text-[var(--text-secondary)]">Moderators</div>
          </div>
        </div>
      </div>
    </div>
  );
}
