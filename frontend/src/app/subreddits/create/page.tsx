"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { backendJson } from "@/lib/backend";

export default function CreateSubredditPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [nsfw, setNsfw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await backendJson("POST", "/subreddits", {
        name,
        displayName: displayName || name,
        description,
        nsfw,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to create subreddit.");
      }

      router.push(`/r/${name}`);
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Create a Community</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Create a new community and bring people together around a topic you love.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Name <span className="text-red-500">*</span>
          </label>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            Community names cannot be changed. No spaces or special characters.
          </p>
          <div className="flex items-center">
            <span className="mr-2 text-xl text-[var(--text-secondary)]">r/</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              placeholder="programming"
              maxLength={21}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Display Name</label>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            The name that will be displayed on the subreddit header.
          </p>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Programming Discussions"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Description</label>
          <p className="mb-2 text-xs text-[var(--text-secondary)]">
            This is how new members come to understand your community.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A place to discuss anything related to programming..."
            rows={4}
            className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
          ></textarea>
        </div>

        <div>
           <label className="flex cursor-pointer items-center space-x-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 transition-colors hover:bg-[var(--muted)]">
            <input
              type="checkbox"
              checked={nsfw}
              onChange={(e) => setNsfw(e.target.checked)}
              className="checkbox checkbox-primary"
            />
            <div>
              <span className="font-bold block">18+ year old community</span>
              <span className="text-sm text-[var(--text-secondary)]">
                Are you creating a 18+ (NSFW) community?
              </span>
            </div>
          </label>
        </div>

        <div className="flex justify-end space-x-4 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="rounded-full border border-[var(--border)] px-6 py-2 transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name}
            className="rounded-full bg-[var(--primary)] px-6 py-2 text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Community"}
          </button>
        </div>
      </form>
    </div>
  );
}
