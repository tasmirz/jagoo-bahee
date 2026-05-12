"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Subreddit } from "@/lib/types";
import backend from "@/lib/backend";
import {
  getPrivateKey,
  getPublicKey,
  getAuthIdFromToken,
  toB64,
  signHash,
} from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

export default function CreatePostPage() {
  const params = useParams();
  const router = useRouter();
  const name = params.name as string;
  const [subreddit, setSubreddit] = useState<Subreddit | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSubreddit() {
      const res = await backend.backendFetch(`/subreddits/${name}`);
      if (res.ok) setSubreddit(await res.json());
    }
    loadSubreddit();
  }, [name]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!subreddit) throw new Error("Subreddit not loaded");
      const privKey = getPrivateKey();
      const pubKey = getPublicKey();
      const authorId = getAuthIdFromToken();

      if (!privKey || !pubKey || !authorId) {
        router.push("/auth");
        return;
      }

      // 1. Prepare content hash
      // Canonical payload for posts
      const payloadObj = {
        title,
        content,
        type: "text",
        subredditId: subreddit._id,
        authorId: authorId,
      };
      const canonical = JSON.stringify(payloadObj);
      const hash = await sha256(canonical);
      const contentHash = toB64(hash);

      // 2. Sign the hash
      // We sign the canonical string, same as CommentsService
      const sig = signHash(privKey, hash);
      const userSignature = toB64(sig);

      // 3. Post to backend
      const res = await backend.backendJson("POST", "/posts", {
        subredditId: subreddit._id,
        authorId: authorId,
        title,
        type: "text",
        content,
        userSignature,
        contentHash,
      });

      if (res.ok) {
        router.push(`/r/${subreddit.name}`);
      } else {
        const errData = await res.json();
        setError(errData.message || "Failed to create post");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (!subreddit) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">
        Create a post in r/{subreddit.name}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <input
            type="text"
            placeholder="Title"
            className="w-full p-2 border border-[var(--border)] rounded bg-[var(--card)]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={300}
          />
        </div>
        <div>
          <textarea
            placeholder="Text (optional)"
            className="w-full p-2 border border-[var(--border)] rounded bg-[var(--card)] min-h-[200px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        {error && <div className="text-[var(--error)] text-sm">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--muted)] rounded-full"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !title}
            className="px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Posting..." : "Post"}
          </button>
        </div>
      </form>
    </div>
  );
}
