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
    <div className="max-w-2xl mx-auto p-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create a Subreddit</h1>
        <p className="text-base-content/70">
          Create a new community and bring people together around a topic you love.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-500 p-4 rounded-lg mb-6 border border-red-500/20">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <p className="text-xs text-base-content/60 mb-2">
            Community names cannot be changed. No spaces or special characters.
          </p>
          <div className="flex items-center">
            <span className="text-xl text-base-content/50 mr-2">r/</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              placeholder="programming"
              maxLength={21}
              className="w-full bg-base-200 border border-base-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Display Name</label>
          <p className="text-xs text-base-content/60 mb-2">
            The name that will be displayed on the subreddit header.
          </p>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Programming Discussions"
            className="w-full bg-base-200 border border-base-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <p className="text-xs text-base-content/60 mb-2">
            This is how new members come to understand your community.
          </p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A place to discuss anything related to programming..."
            rows={4}
            className="w-full bg-base-200 border border-base-300 rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-primary resize-y"
          ></textarea>
        </div>

        <div>
           <label className="flex items-center space-x-3 cursor-pointer p-4 border border-base-300 rounded-md bg-base-200/50 hover:bg-base-200 transition-colors">
            <input
              type="checkbox"
              checked={nsfw}
              onChange={(e) => setNsfw(e.target.checked)}
              className="checkbox checkbox-primary"
            />
            <div>
              <span className="font-bold block">18+ year old community</span>
              <span className="text-sm text-base-content/70">
                Are you creating a 18+ (NSFW) community?
              </span>
            </div>
          </label>
        </div>

        <div className="pt-4 flex justify-end space-x-4 border-t border-base-300">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="px-6 py-2 rounded-full border border-base-300 hover:bg-base-200 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name}
            className="px-6 py-2 rounded-full bg-primary text-primary-content hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Community"}
          </button>
        </div>
      </form>
    </div>
  );
}
