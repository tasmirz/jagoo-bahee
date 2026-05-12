"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Subreddit, Post, User } from "@/lib/types";
import backend from "@/lib/backend";
import Link from "next/link";
import { getAuthIdFromToken } from "@/lib/auth";

export default function SubredditPage() {
  const params = useParams();
  const name = params.name as string;
  const [subreddit, setSubreddit] = useState<Subreddit | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isMod, setIsMod] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const subRes = await backend.backendFetch(`/subreddits/${name}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubreddit(subData);

          const postsRes = await backend.backendFetch(
            `/posts?subreddit=${subData._id}`,
          );
          if (postsRes.ok) {
            const postsData = await postsRes.json();
            setPosts(Array.isArray(postsData) ? postsData : []);
          }

          try {
            const modRes = await backend.backendFetch(`/subreddits/${subData._id}/is-moderator`);
            if (modRes.ok) {
              const modData = await modRes.json();
              setIsMod(modData.isModerator);
            }
          } catch (e) {
            // ignore
          }
        }
      } catch (err) {
        console.error("Failed to load subreddit data:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [name]);

  if (loading)
    return <div className="p-8 text-center">Loading community...</div>;
  if (!subreddit)
    return <div className="p-8 text-center">Community not found.</div>;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Banner */}
      <div className="h-40 bg-[var(--primary)] relative">
        {subreddit.bannerAttachmentId && (
          <img
            src={`/api/attachments/${subreddit.bannerAttachmentId}`}
            alt="banner"
            className="w-full h-full object-cover"
          />
        )}
      </div>

      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-end gap-4 -mt-6 mb-6">
          <div className="w-20 h-20 rounded-full border-4 border-[var(--background)] bg-[var(--card)] overflow-hidden">
            <img
              src={
                subreddit.iconAttachmentId
                  ? `/api/attachments/${subreddit.iconAttachmentId}`
                  : "/jagoo-bahee.svg"
              }
              alt="icon"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="pb-2">
            <h1 className="text-2xl font-bold">{subreddit.displayName}</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              r/{subreddit.name}
            </p>
          </div>
          <div className="flex-1"></div>
          <div className="pb-2 flex items-center space-x-2">
            {isMod && (
              <Link
                href={`/r/${subreddit.name}/settings`}
                className="px-6 py-2 bg-[var(--card)] border border-[var(--border)] rounded-full font-bold hover:bg-base-200 transition-colors"
              >
                Community Settings
              </Link>
            )}
            <Link
              href={`/r/${subreddit.name}/create`}
              className="px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold hover:opacity-90"
            >
              Create Post
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4">
            {posts.length === 0 ? (
              <div className="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
                <p className="text-[var(--text-secondary)]">
                  No posts here yet. Be the first!
                </p>
              </div>
            ) : (
              posts.map((post) => (
                <div
                  key={post._id}
                  className="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)] hover:border-[var(--text-secondary)] transition-colors relative"
                >
                  {isMod && (
                    <button 
                      className="absolute top-4 right-4 text-red-500 text-sm hover:underline"
                      onClick={() => {
                        const moderatorId = getAuthIdFromToken();
                        if (!moderatorId) {
                          alert("Please sign in again.");
                          return;
                        }
                        backend.backendJson('POST', `/posts/${post._id}/mod/remove`, {
                          subredditId: subreddit._id,
                          moderatorId,
                          reason: 'Removed by moderator',
                        }).then(() => {
                           window.location.reload();
                        }).catch(e => alert("Failed to remove post: " + e.message));
                      }}
                    >
                      Remove
                    </button>
                  )}
                  <div className="text-xs text-[var(--text-secondary)] mb-2">
                    <span>
                      Posted by u/
                      {(post.authorId as User)?.username ?? "unknown"}
                    </span>
                    <span className="mx-1">•</span>
                    <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                  </div>
                  <Link href={`/p/${post._id}`} className="hover:underline">
                    <h2 className="text-xl font-medium mb-2">{post.title}</h2>
                  </Link>
                  {post.type === "text" && post.content && (
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-3">
                      {post.content}
                    </p>
                  )}
                  <div className="mt-3">
                    <Link href={`/p/${post._id}`} className="text-sm font-medium text-[var(--primary)] hover:underline">
                      Open discussion
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4">
              <h2 className="font-bold mb-4">About Community</h2>
              <p className="text-sm mb-4">{subreddit.description}</p>
              {isMod && (
                <div className="mb-4 pb-4 border-b border-[var(--border)]">
                  <Link
                    href={`/r/${subreddit.name}/settings`}
                    className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium border border-[var(--border)] hover:bg-[var(--muted)]"
                  >
                    Manage Community
                  </Link>
                </div>
              )}
              <div className="flex items-center gap-4 text-sm font-bold border-t border-[var(--border)] pt-4">
                <div>
                  <div className="text-[var(--foreground)]">
                    {subreddit.memberCount}
                  </div>
                  <div className="text-[var(--text-secondary)] font-normal text-xs">
                    Members
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
