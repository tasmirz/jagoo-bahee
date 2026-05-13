"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bold, Code, Image as ImageIcon, Italic, Link2, List, ListOrdered, MoreHorizontal, PlayCircle, Strikethrough } from "lucide-react";
import { backendFetch } from "@/lib/backend";
import { useAuth } from "@/lib/context/AuthContext";
import { useUser } from "@/lib/context/UserContext";
import { getPrivateKey, signHash, toB64, toHex } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import FileUploader from "@/components/FileUploader";

interface Subreddit {
  _id: string;
  name: string;
  displayName?: string;
  flairs?: string[];
}

type PostType = "text" | "link" | "image" | "video" | "audio" | "crosspost";

export default function CreatePostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { user } = useUser();

  const [subredditId, setSubredditId] = useState(searchParams?.get("subreddit") || "");
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<PostType>("text");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [flair, setFlair] = useState("");
  const [crosspostSourceId, setCrosspostSourceId] = useState("");
  const [availableFlairs, setAvailableFlairs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const fetchSubreddits = async () => {
      try {
        const response = await backendFetch("/users/me/subreddits");
        if (response.ok) {
          const data = await response.json();
          setSubreddits(data);
          if (subredditId && data.length > 0) {
            const selected = data.find((sub: Subreddit) => sub._id === subredditId);
            setAvailableFlairs(selected?.flairs || []);
          }
        }
      } catch (error) {
        console.error("Failed to fetch subreddits:", error);
      }
    };
    void fetchSubreddits();
  }, [isAuthenticated, subredditId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!user) {
      setMessage("Please complete your profile first");
      return;
    }

    const pk = getPrivateKey();
    if (!pk) {
      setMessage("Missing credentials. Please sign in.");
      router.push("/auth");
      return;
    }

    if (!subredditId) {
      setMessage("Please select a community");
      return;
    }
    if (!title.trim()) {
      setMessage("Title is required");
      return;
    }
    if (type === "link" && !url.trim()) {
      setMessage("URL is required for link posts");
      return;
    }
    if (type === "crosspost" && !crosspostSourceId.trim()) {
      setMessage("Please select a post to crosspost");
      return;
    }

    setLoading(true);
    try {
      const canonicalPayload: Record<string, unknown> = {
        title: title.trim(),
        content: type === "link" ? "" : content.trim() || "",
        type,
        subredditId,
        authorId: user._id,
        url: type === "link" ? url.trim() : "",
        attachmentIds: type !== "link" && type !== "crosspost" ? attachmentIds : [],
        poll: null,
      };

      const hashBytes = await sha256(JSON.stringify(canonicalPayload));
      const contentHash = toHex(hashBytes);
      const userSignature = toB64(signHash(pk, hashBytes));

      const body: Record<string, unknown> = {
        ...canonicalPayload,
        userSignature,
        contentHash,
      };
      if (type === "crosspost" && crosspostSourceId) body.crosspostId = crosspostSourceId;
      if (flair) body.flair = flair;

      const res = await backendFetch("/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Create post failed: ${res.status}`);
      }

      const envelope = await res.json();
      const data = envelope?.data || envelope;

      if (envelope?.receipt && typeof window !== "undefined") {
        const key = "jagoo:audit:receipts";
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        localStorage.setItem(key, JSON.stringify([{ ...envelope.receipt, savedAt: new Date().toISOString() }, ...current].slice(0, 250)));
      }

      if (data.proofHash && data.proofSignature) {
        try {
          const { saveAcknowledgement } = await import("@/lib/indexeddb");
          await saveAcknowledgement({
            id: String(data.contentId || data.id),
            contentId: String(data.contentId || data.id),
            contentType: "post",
            action: data.action || "created",
            contentHash: data.contentHash,
            userSignature: data.userSignature,
            serverSignature: data.serverSignature,
            proofHash: data.proofHash,
            proofSignature: data.proofSignature,
            serverPublicKey: data.serverPublicKey,
            metadata: data.metadata || { serverKeyId: "unknown" },
            createdAt: new Date().toISOString(),
            savedAt: Date.now(),
            verified: true,
            postTitle: title.trim(),
            postContent: content.trim(),
            userId: user._id,
          });
        } catch (error) {
          console.error("[CreatePost] Failed to save proof:", error);
        }
      }

      const id = data?.contentId || data?._id || data?.id || null;
      setMessage("Post created successfully!");
      if (id) {
        router.push(`/posts/${id}`);
      } else {
        setTimeout(() => router.push("/"), 800);
      }
    } catch (err: unknown) {
      console.error("Create post error:", err);
      setMessage((err as Error).message || "Create failed");
    } finally {
      setLoading(false);
    }
  }

  const selectedCommunity = subreddits.find((sub) => sub._id === subredditId);
  const canPost = Boolean(subredditId && title.trim() && !loading);

  return (
    <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-8 px-4 py-6 lg:grid-cols-[700px_1fr]">
      <main>
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-[var(--text-secondary)]">Create post</h1>
          <button type="button" className="text-sm font-semibold hover:underline">Drafts</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <select
            value={subredditId}
            onChange={(e) => {
              setSubredditId(e.target.value);
              const selected = subreddits.find((sub) => sub._id === e.target.value);
              setAvailableFlairs(selected?.flairs || []);
              setFlair("");
            }}
            className="max-w-[280px] rounded-full bg-[var(--muted)] px-4 py-3 text-sm font-semibold outline-none"
            required
          >
            <option value="">r/ Select a community</option>
            {subreddits.map((sub) => (
              <option key={sub._id} value={sub._id}>
                r/{sub.name} {sub.displayName ? `- ${sub.displayName}` : ""}
              </option>
            ))}
          </select>

          <div className="flex gap-7 border-b border-[var(--border)]">
            {[
              ["text", "Text"],
              ["image", "Images & Video"],
              ["link", "Link"],
              ["crosspost", "Crosspost"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value as PostType)}
                className={`pb-3 text-sm font-semibold ${type === value ? "border-b-4 border-blue-500 text-[var(--foreground)]" : "text-[var(--text-secondary)]"}`}
              >
                {label}
              </button>
            ))}
            <button type="button" disabled className="pb-3 text-sm font-semibold text-[var(--text-secondary)] opacity-50">Poll</button>
          </div>

          <div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border)] bg-transparent px-4 py-4 text-lg outline-none focus:border-[var(--primary)]"
              placeholder="Title*"
              maxLength={300}
            />
            <div className="mt-1 text-right text-xs text-[var(--text-secondary)]">{title.length}/300</div>
          </div>

          {availableFlairs.length > 0 ? (
            <select
              value={flair}
              onChange={(e) => setFlair(e.target.value)}
              className="rounded-full bg-[var(--muted)] px-4 py-2 text-sm outline-none"
            >
              <option value="">Add tags</option>
              {availableFlairs.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          ) : (
            <button type="button" disabled className="rounded-full bg-[var(--muted)] px-4 py-2 text-sm text-[var(--text-secondary)] opacity-70">
              Add tags
            </button>
          )}

          {type === "link" && (
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              className="w-full rounded-2xl border border-[var(--border)] bg-transparent px-4 py-4 outline-none focus:border-[var(--primary)]"
              placeholder="URL*"
            />
          )}

          {type === "crosspost" && (
            <input
              value={crosspostSourceId}
              onChange={(e) => setCrosspostSourceId(e.target.value)}
              className="w-full rounded-2xl border border-[var(--border)] bg-transparent px-4 py-4 outline-none focus:border-[var(--primary)]"
              placeholder="Source post ID or URL*"
            />
          )}

          {type !== "link" && type !== "crosspost" && (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
              <div className="flex items-center gap-5 border-b border-[var(--border)] px-4 py-3 text-[var(--text-secondary)]">
                <Bold size={17} />
                <Italic size={17} />
                <Strikethrough size={17} />
                <span className="text-sm font-semibold">x²</span>
                <Link2 size={17} />
                <ImageIcon size={17} />
                <PlayCircle size={17} />
                <List size={17} />
                <ListOrdered size={17} />
                <span className="text-sm font-semibold">66</span>
                <Code size={17} />
                <MoreHorizontal className="ml-auto" size={18} />
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="min-h-36 w-full resize-y bg-transparent px-4 py-4 outline-none"
                placeholder={type === "text" ? "Body text (optional)" : "Caption (optional)"}
              />
            </div>
          )}

          {type !== "link" && type !== "crosspost" && (
            <div className="rounded-2xl border border-[var(--border)] p-4">
              <FileUploader
                acceptedTypes={type === "image" ? "image/*" : type === "video" ? "video/*" : type === "audio" ? "audio/*" : "image/*,video/*,audio/*"}
                maxSizeMB={type === "video" ? 500 : type === "audio" ? 100 : 10}
                onUploadComplete={(fileId) => setAttachmentIds((prev) => [...prev, fileId])}
                label={type === "text" ? "Add Images, Videos, or Audio" : type === "image" ? "Upload Images" : type === "video" ? "Upload Videos" : type === "audio" ? "Upload Audio" : "Upload"}
              />
              {attachmentIds.length > 0 && (
                <div className="mt-3 flex items-center justify-between text-sm text-[var(--text-secondary)]">
                  <span>{attachmentIds.length} file(s) uploaded</span>
                  <button type="button" onClick={() => setAttachmentIds([])} className="font-semibold text-[var(--error)]">Clear all</button>
                </div>
              )}
            </div>
          )}

          {message && (
            <div className={`rounded-md p-3 text-sm ${message.includes("successfully") ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-600"}`}>
              {message}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" disabled={!title.trim()} className="rounded-full bg-[var(--muted)] px-5 py-3 text-sm font-semibold disabled:opacity-40">
              Save Draft
            </button>
            <button type="submit" disabled={!canPost} className="rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">
              {loading ? "Posting..." : "Post"}
            </button>
          </div>
        </form>
      </main>

      <aside className="hidden lg:block">
        <div className="sticky top-16 space-y-4 pt-12">
          <div className="reddit-side-card">
            <div className="text-sm font-semibold">Posting to</div>
            <div className="mt-3 text-xl font-semibold">{selectedCommunity ? `r/${selectedCommunity.name}` : "Select a community"}</div>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Posts are signed locally before they are submitted, then stored with server proof data for verification.
            </p>
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
