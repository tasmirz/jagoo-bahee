"use client";

import React, { useState, useEffect } from "react";
import { Post, User, Subreddit } from "@/lib/types";
import backend from "@/lib/backend";
import Link from "next/link";

export default function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPosts() {
      try {
        const res = await backend.backendFetch("/posts");
        if (res.ok) {
          const data = await res.json();
          setPosts(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load posts:", err);
      } finally {
        setLoading(false);
      }
    }
    loadPosts();
  }, []);

  if (loading) return <div className="p-8 text-center">Loading feed...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="space-y-4">
        {posts.length === 0 ? (
          <div className="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
            <p className="text-[var(--text-secondary)]">
              No posts found. Why not create one?
            </p>
            <Link
              href="/subreddits"
              className="text-[var(--primary)] font-medium mt-2 inline-block"
            >
              Explore Communities
            </Link>
          </div>
        ) : (
          posts.map((post) => (
            <div
              key={post._id}
              className="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)] hover:border-[var(--text-secondary)] transition-colors"
            >
              <div className="text-xs text-[var(--text-secondary)] mb-2">
                <Link
                  href={`/r/${(post.subredditId as Subreddit)?.name}`}
                  className="font-bold text-[var(--foreground)] hover:underline"
                >
                  r/{(post.subredditId as Subreddit)?.name}
                </Link>
                <span className="mx-1">•</span>
                <span>
                  Posted by u/{(post.authorId as User)?.username ?? "unknown"}
                </span>
                <span className="mx-1">•</span>
                <span>{new Date(post.createdAt).toLocaleDateString()}</span>
              </div>
              <h2 className="text-xl font-medium mb-2">{post.title}</h2>
              {post.type === "text" && post.content && (
                <p className="text-sm text-[var(--text-secondary)] line-clamp-3">
                  {post.content}
                </p>
              )}
              {post.type === "link" && post.url && (
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--secondary)] hover:underline block truncate"
                >
                  {post.url}
                </a>
              )}
              <div className="mt-4 flex items-center gap-4 text-xs font-bold text-[var(--text-secondary)]">
                <div className="flex items-center gap-1 bg-[var(--muted)] px-2 py-1 rounded">
                  <span>{post.score} points</span>
                </div>
                <div className="flex items-center gap-1 hover:bg-[var(--muted)] px-2 py-1 rounded cursor-pointer">
                  <span>{post.commentCount} comments</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
