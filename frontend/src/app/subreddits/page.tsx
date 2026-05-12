"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { getToken } from "@/lib/auth";
import { Subreddit, User } from "@/lib/types";

export default function SubredditsListPage() {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "popular" | "alphabetical">(
    "popular",
  );
  const [filter, setFilter] = useState<"all" | "joined" | "public">("all");

  const token = getToken();

  useEffect(() => {
    loadSubreddits();
  }, [sortBy, filter]);

  async function loadSubreddits() {
    try {
      setLoading(true);
      setError(null);
      const backend = await import("@/lib/backend");

      const params = new URLSearchParams({
        sort: sortBy,
        limit: "50",
      });

      if (filter === "joined" && token) {
        params.append("joined", "true");
      } else if (filter === "public") {
        params.append("public", "true");
      }

      const res = await backend.backendFetch(`/subreddits?${params}`);
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Please sign in to view communities");
        }
        throw new Error(`Failed to load communities (${res.status})`);
      }

      const data = await res.json();
      // Handle different response formats
      const subredditsArray = Array.isArray(data)
        ? data
        : data.subreddits || data.data || [];
      setSubreddits(subredditsArray);
    } catch (err) {
      console.error("SubredditsPage load error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load communities",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin(subredditId: string, isJoined: boolean) {
    if (!token) {
      window.location.href = "/auth";
      return;
    }

    try {
      const backend = await import("@/lib/backend");
      const res = await backend.backendJson(
        isJoined ? "DELETE" : "POST",
        `/subreddits/${subredditId}/join`,
      );

      if (res.ok) {
        setSubreddits((prev) =>
          prev.map((sub) =>
            sub._id === subredditId
              ? {
                  ...sub,
                  isJoined: !isJoined,
                  memberCount: sub.memberCount + (isJoined ? -1 : 1),
                }
              : sub,
          ),
        );
      }
    } catch (err) {
      console.error("Join/leave error:", err);
    }
  }

  const filteredSubreddits = subreddits.filter(
    (sub) =>
      sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sub.description.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 relative">
            <Image src="/jagoo-bahee.svg" alt="jagoo-bahee" fill sizes="56px" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Communities</h1>
            <div className="text-sm text-[var(--text-secondary)]">
              Create and discover communities
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search communities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
            />
          </div>

          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="popular">Popular</option>
              <option value="newest">Newest</option>
              <option value="alphabetical">A-Z</option>
            </select>

            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              className="px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              <option value="all">All</option>
              <option value="public">Public</option>
              {token && <option value="joined">Joined</option>}
            </select>
          </div>
        </div>

        {token && (
          <div className="mb-6">
            <Link
              href="/subreddits/create"
              className="inline-flex items-center gap-2 bg-[var(--primary)] text-white px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
            >
              <span>+</span>
              Create Community
            </Link>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="text-[var(--text-secondary)]">
              Loading communities...
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="text-[var(--error)]">{error}</div>
            <button
              onClick={loadSubreddits}
              className="mt-4 px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90"
            >
              Try Again
            </button>
          </div>
        ) : filteredSubreddits.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-[var(--text-secondary)]">
              {searchTerm
                ? "No communities found matching your search."
                : "No communities found."}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSubreddits.map((subreddit) => (
              <div
                key={subreddit._id}
                className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <Link href={`/r/${subreddit.name}`} className="block">
                      <h3 className="font-semibold text-[var(--foreground)] hover:text-[var(--primary)] transition-colors">
                        r/{subreddit.name}
                      </h3>
                      <p className="text-sm text-[var(--text-secondary)] mt-1">
                        {subreddit.displayName}
                      </p>
                    </Link>
                  </div>
                  {subreddit.isPrivate && (
                    <span className="text-xs bg-[var(--warning)]/10 text-[var(--warning)] px-2 py-1 rounded">
                      Private
                    </span>
                  )}
                </div>

                <p className="text-sm text-[var(--text-secondary)] mb-3 line-clamp-2">
                  {subreddit.description || "No description provided."}
                </p>

                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-3">
                  <span>{subreddit.memberCount} members</span>
                  <span>{subreddit.postCount} posts</span>
                  <span>
                    Created {new Date(subreddit.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-[var(--text-secondary)]">
                    by u/{(subreddit.createdBy as User)?.username ?? "unknown"}
                  </div>

                  {token && (
                    <button
                      onClick={() =>
                        handleJoin(subreddit._id, subreddit.isJoined || false)
                      }
                      className={`px-3 py-1 text-xs rounded-md transition-colors ${
                        subreddit.isJoined
                          ? "bg-[var(--muted)] text-[var(--text-secondary)] hover:bg-[var(--error)]/10 hover:text-[var(--error)]"
                          : "bg-[var(--primary)] text-white hover:opacity-90"
                      }`}
                    >
                      {subreddit.isJoined ? "Leave" : "Join"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
