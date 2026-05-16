"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, LayoutList, Plus, SlidersHorizontal } from "lucide-react";
import PostCard from "@/components/PostCard";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { Post } from "@/lib/types";
import { backendFetch } from "@/lib/backend";
import { useInfiniteScroll } from "@/lib/hooks/useInfiniteScroll";
import { useAuth } from "@/lib/context/AuthContext";

type SortOption = "best" | "hot" | "new" | "top" | "rising";

const sortLabels: Record<SortOption, string> = {
  best: "Best",
  hot: "Hot",
  new: "New",
  top: "Top",
  rising: "Rising",
};

function backendSort(sort: SortOption): "new" | "top" {
  return sort === "top" ? "top" : "new";
}

export default function HomePage() {
  const { isAuthenticated } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("best");
  const [sortOpen, setSortOpen] = useState(false);
  const [timeRange] = useState<"day">("day");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      setLoading(true);
      setError(null);
      setPosts([]);
      setPage(0);
      setHasMore(true);

      try {
        const params = new URLSearchParams({
          limit: "10",
          skip: "0",
          sort: backendSort(sortBy),
        });

        if (sortBy === "top") {
          params.append("time", timeRange);
        }

        const response = await backendFetch(`/posts?${params}`);
        if (!response.ok) {
          throw new Error("Failed to fetch posts");
        }

        const data = await response.json();
        const nextPosts = Array.isArray(data) ? data : data.data || [];

        setPosts(nextPosts);
        setHasMore(nextPosts.length === 10);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load posts");
      } finally {
        setLoading(false);
      }
    }

    fetchPosts();
  }, [sortBy, timeRange]);

  const loadPage = async (pageNum: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: "10",
        skip: String(pageNum * 10),
        sort: backendSort(sortBy),
      });

      if (sortBy === "top") {
        params.append("time", timeRange);
      }

      const response = await backendFetch(`/posts?${params}`);
      if (response.ok) {
        const data = await response.json();
        const nextPosts = Array.isArray(data) ? data : data.data || [];

        setPosts((prev) => (pageNum === page + 1 ? [...prev, ...nextPosts] : nextPosts));
        setPage(pageNum);
        setHasMore(nextPosts.length === 10);
      }
    } catch (err) {
      console.error("Failed to load posts:", err);
      setError("Failed to load posts");
    } finally {
      setLoading(false);
    }
  };

  const { loadMoreRef } = useInfiniteScroll({
    onLoadMore: () => {
      if (!loading && hasMore) void loadPage(page + 1);
    },
    hasMore,
    loading,
  });

  return (
    <div className="mx-auto grid w-full max-w-[1120px] grid-cols-1 gap-6 px-4 py-4 lg:grid-cols-[736px_1fr]">
      <main className="min-w-0">
        <div className="mb-2 flex items-center gap-2 border-b border-[var(--border)] pb-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortOpen((open) => !open)}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-3 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted-hover)]"
            >
              {sortLabels[sortBy]}
              <ChevronDown size={16} />
            </button>
            {sortOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-md border border-[var(--border)] bg-[var(--card)] py-2 shadow-xl">
                <div className="px-4 pb-2 text-xs font-semibold text-[var(--text-secondary)]">Sort by</div>
                {(Object.keys(sortLabels) as SortOption[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setSortBy(option);
                      setSortOpen(false);
                    }}
                    className={`block w-full px-4 py-3 text-left text-sm hover:bg-[var(--muted)] ${sortBy === option ? "bg-[var(--muted)]" : ""}`}
                  >
                    {sortLabels[option]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="rounded-full p-2 text-[var(--text-secondary)] hover:bg-[var(--muted)]" title="View options">
            <LayoutList size={18} />
          </button>
        </div>

        {!isAuthenticated && !loading && (
          <div className="mb-4 rounded-md bg-[var(--card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
            Sign in to personalize Home, or keep browsing all public posts.
            <Link href="/auth" className="ml-2 font-semibold text-[var(--primary)] hover:underline">
              Log in
            </Link>
          </div>
        )}

        {loading && posts.length === 0 && (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <LoadingSkeleton key={i} type="post" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-[var(--error)] bg-[var(--card)] p-6 text-center">
            <p className="text-[var(--error)]">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="py-28 text-center">
            <h2 className="text-2xl font-semibold">No posts here yet</h2>
            <p className="mt-2 text-[var(--text-secondary)]">Create a post or explore communities to build your feed.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Link href="/posts/create" className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">
                Create Post
              </Link>
              <Link href="/subreddits" className="rounded-full bg-[var(--muted)] px-4 py-2 text-sm font-semibold">
                Explore
              </Link>
            </div>
          </div>
        )}

        {!error && posts.length > 0 && (
          <div className="space-y-3">
            {posts.map((post) => (
              <PostCard key={post._id} post={post} />
            ))}
          </div>
        )}

        {!loading && hasMore && posts.length > 0 && (
          <div ref={loadMoreRef} className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--primary)]" />
          </div>
        )}
      </main>

      <aside className="hidden lg:block">
        <div className="sticky top-16 space-y-4">
          <div className="reddit-side-card">
            <div className="mb-3 text-sm font-semibold">Home</div>
            <p className="text-sm text-[var(--text-secondary)]">
              Your feed shows all public posts. Sort the feed or explore communities to narrow what you see.
            </p>
            <Link href="/posts/create" className="reddit-side-action-strong mt-4">
              <Plus size={16} />
              Create Post
            </Link>
            <Link href="/subreddits/create" className="reddit-side-action mt-2">
              Start Community
            </Link>
          </div>

          <div className="reddit-side-card">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <SlidersHorizontal size={15} />
              Backend Features
            </div>
            <div className="grid gap-2 text-sm">
              <Link href="/acknowledgements" className="reddit-side-link">Proofs & audit trail</Link>
              <Link href="/settings" className="reddit-side-link">Account settings</Link>
              <Link href="/admin" className="reddit-side-link">Server admin</Link>
              <Link href="/subreddits" className="reddit-side-link">Explore communities</Link>
            </div>
          </div>

          <div className="px-2 text-xs leading-6 text-[var(--text-secondary)]">
            Reddit Rules&nbsp;&nbsp; Privacy Policy&nbsp;&nbsp; User Agreement&nbsp;&nbsp; Accessibility
            <br />
            Jagoo Bahee, Inc. © 2026. All rights reserved.
          </div>
        </div>
      </aside>
    </div>
  );
}
