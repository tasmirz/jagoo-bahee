"use client";

import CreateSubreddit from "../../components/CreateSubreddit";
import Link from "next/link";

export default function CreatePage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <Link href="/" className="text-sm text-[var(--text-secondary)]">← Back</Link>
        </div>

        <CreateSubreddit onCreated={(name) => {
          // navigate to created subreddit if desired
          window.location.href = `/r/${name}`;
        }} />
      </div>
    </div>
  );
}
