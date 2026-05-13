"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { getToken } from "@/lib/auth";

interface Subreddit {
  _id: string;
  name: string;
  displayName: string;
  description: string;
  memberCount: number;
  postCount: number;
  isPrivate: boolean;
  createdAt: string;
  createdBy?: {
    _id: string;
    username: string;
  };
  isJoined?: boolean;
}

const categories = [
  "All",
  "Most Visited",
  "Internet Culture",
  "Games",
  "Q&As & Stories",
  "Movies & TV",
  "Technology",
  "Places & Travel",
  "Pop Culture",
  "Sports",
  "Business & Finance",
];

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

export default function SubredditsListPage() {
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "popular" | "alphabetical">("popular");
  const [filter, setFilter] = useState<"all" | "joined" | "public">("all");
  const [activeCategory, setActiveCategory] = useState("All");
  const token = getToken();

  const loadSubreddits = useCallback(async function loadSubreddits() {
    try {
      setLoading(true);
      setError(null);
      const backend = await import("@/lib/backend");

      const params = new URLSearchParams({
        sort: sortBy,
        limit: "60",
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
      setSubreddits(Array.isArray(data) ? data : data.subreddits || data.data || []);
    } catch (err) {
      console.error("SubredditsPage load error:", err);
      setError(err instanceof Error ? err.message : "Failed to load communities");
    } finally {
      setLoading(false);
    }
  }, [filter, sortBy, token]);

  useEffect(() => {
    const id = window.setTimeout(() => void loadSubreddits(), 0);
    return () => window.clearTimeout(id);
  }, [loadSubreddits]);

  async function handleJoin(subredditId: string, isJoined: boolean) {
    if (!token) {
      window.location.href = "/auth";
      return;
    }

    try {
      const backend = await import("@/lib/backend");
      const res = await backend.backendJson("POST", `/subreddits/${subredditId}/${isJoined ? "leave" : "join"}`);

      if (res.ok) {
        setSubreddits((prev) =>
          prev.map((sub) =>
            sub._id === subredditId
              ? { ...sub, isJoined: !isJoined, memberCount: Math.max(0, sub.memberCount + (isJoined ? -1 : 1)) }
              : sub,
          ),
        );
      }
    } catch (err) {
      console.error("Join/leave error:", err);
    }
  }

  const filteredSubreddits = useMemo(() => {
    return subreddits.filter((sub) => {
      const matchesSearch =
        sub.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.description.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      if (activeCategory === "All" || activeCategory === "Most Visited") return true;
      return sub.description.toLowerCase().includes(activeCategory.split(" ")[0].toLowerCase());
    });
  }, [activeCategory, searchTerm, subreddits]);

  const sections = [
    { title: "Recommended for you", items: filteredSubreddits.slice(0, 6) },
    { title: "Games", items: filteredSubreddits.slice(6, 12) },
    { title: "Q&As & Stories", items: filteredSubreddits.slice(12, 18) },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-normal">Explore Communities</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Find active spaces, join them, and post with your existing backend identity.</p>
        </div>
        {token && (
          <Link href="/subreddits/create" className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">
            <Plus size={18} />
            Start a community
          </Link>
        )}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
              activeCategory === category
                ? "border-[var(--muted)] bg-[var(--muted)]"
                : "border-[var(--border)] hover:bg-[var(--muted)]"
            }`}
          >
            {category}
          </button>
        ))}
        <ChevronRight size={18} className="text-[var(--text-secondary)]" />
      </div>

      <div className="mb-8 flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" size={18} />
          <input
            type="text"
            placeholder="Search communities"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-full border border-[var(--border)] bg-[var(--muted)] py-2 pl-10 pr-4 text-sm outline-none focus:border-[var(--primary)]"
          />
        </label>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        >
          <option value="popular">Popular</option>
          <option value="newest">Newest</option>
          <option value="alphabetical">A-Z</option>
        </select>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
          className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
        >
          <option value="all">All</option>
          <option value="public">Public</option>
          {token && <option value="joined">Joined</option>}
        </select>
      </div>

      {loading ? (
        <div className="py-16 text-center text-[var(--text-secondary)]">Loading communities...</div>
      ) : error ? (
        <div className="py-16 text-center">
          <div className="text-[var(--error)]">{error}</div>
          <button onClick={loadSubreddits} className="mt-4 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">
            Try Again
          </button>
        </div>
      ) : filteredSubreddits.length === 0 ? (
        <div className="py-16 text-center text-[var(--text-secondary)]">
          {searchTerm ? "No communities found matching your search." : "No communities found."}
        </div>
      ) : (
        <div className="space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-xl font-semibold text-[var(--text-secondary)]">{section.title}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {section.items.map((subreddit) => (
                  <CommunityCard key={subreddit._id} subreddit={subreddit} token={token} onJoin={handleJoin} />
                ))}
              </div>
              {section.items.length >= 6 && (
                <div className="mt-4 flex justify-center">
                  <button className="rounded-full bg-[var(--muted)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted-hover)]">Show more</button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function CommunityCard({
  subreddit,
  token,
  onJoin,
}: {
  subreddit: Subreddit;
  token: string | null;
  onJoin: (subredditId: string, isJoined: boolean) => void;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 transition-colors hover:bg-[var(--muted)]/40">
      <div className="flex items-start gap-3">
        <Link
          href={`/r/${subreddit.name}`}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-white"
        >
          {initials(subreddit.name)}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/r/${subreddit.name}`} className="min-w-0">
              <h3 className="truncate font-semibold hover:text-[var(--primary)]">r/{subreddit.name}</h3>
              <p className="text-xs text-[var(--text-secondary)]">{subreddit.memberCount.toLocaleString()} members</p>
            </Link>
            {token && (
              <button
                onClick={() => onJoin(subreddit._id, subreddit.isJoined || false)}
                className={`rounded-full px-4 py-2 text-xs font-bold ${
                  subreddit.isJoined ? "bg-[var(--muted)] text-[var(--foreground)]" : "bg-[var(--primary)] text-white"
                }`}
              >
                {subreddit.isJoined ? "Joined" : "Join"}
              </button>
            )}
          </div>
          <p className="mt-2 line-clamp-2 text-sm text-[var(--text-secondary)]">
            {subreddit.description || subreddit.displayName || "A community on Jagoo Bahee."}
          </p>
        </div>
      </div>
    </article>
  );
}
