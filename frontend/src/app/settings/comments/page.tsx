'use client';

import React from 'react';
import Link from 'next/link';

export default function CommentSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto p-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Comment Settings</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Control how you write and view comments.
      </p>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Collapse long threads by default</p>
            <p className="text-sm text-[var(--text-secondary)]">Keep comment pages shorter.</p>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">Coming soon</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Show NSFW comments</p>
            <p className="text-sm text-[var(--text-secondary)]">Filter sensitive content in discussions.</p>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">Coming soon</span>
        </div>
      </div>

      <div className="mt-6">
        <Link href="/settings" className="text-sm font-medium text-[var(--primary)] hover:underline">
          Back to Settings
        </Link>
      </div>
    </div>
  );
}
