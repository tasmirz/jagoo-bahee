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
import { RichPostEditor } from "@/components/rich-post-editor";
import { FileText, ImageIcon, LinkIcon, ListChecks, Video } from "lucide-react";

type PostKind = "text" | "link" | "image" | "video" | "poll";

export default function CreatePostPage() {
  const params = useParams();
  const router = useRouter();
  const name = params.name as string;
  const [subreddit, setSubreddit] = useState<Subreddit | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState<PostKind>("text");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);
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

      let attachmentIds: string[] = [];
      if ((type === "image" || type === "video") && file) {
        attachmentIds = [await uploadAttachment(file)];
      }
      const poll = type === "poll"
        ? {
            question: pollQuestion.trim() || title,
            options: pollOptions.map((option) => option.trim()).filter(Boolean),
            multiple: pollMultiple,
          }
        : null;

      const payloadObj = {
        title,
        content: content || "",
        type,
        subredditId: subreddit._id,
        authorId: authorId,
        url: url || "",
        attachmentIds,
        poll,
      };
      const canonical = JSON.stringify(payloadObj);
      const hash = await sha256(canonical);
      const contentHash = Array.from(hash).map((byte) => byte.toString(16).padStart(2, "0")).join("");

      // 2. Sign the hash
      // We sign the canonical string, same as CommentsService
      const sig = signHash(privKey, hash);
      const userSignature = toB64(sig);

      // 3. Post to backend
      const res = await backend.backendJson("POST", "/posts", {
        subredditId: subreddit._id,
        authorId: authorId,
        title,
        type,
        content,
        url: url || undefined,
        attachmentIds,
        poll: poll || undefined,
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

  async function uploadAttachment(selected: File) {
    const requested = await backend.backendJson("POST", "/attachments/upload-url", {
      originalFilename: selected.name,
      mimeType: selected.type,
      sizeBytes: selected.size,
      type,
      signature: "",
      contentHash: "",
    });
    if (!requested.ok) throw new Error("Could not create upload URL");
    const upload = await requested.json();
    const put = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": selected.type },
      body: selected,
    });
    if (!put.ok) throw new Error("Upload failed");
    const confirmed = await backend.backendJson("POST", "/attachments/confirm", {
      key: upload.key || upload.minioKey,
      filename: selected.name,
      contentType: selected.type,
    });
    if (!confirmed.ok) throw new Error("Could not confirm upload");
    const attachment = await confirmed.json();
    return attachment._id || attachment.id;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">
        Create a post in r/{subreddit.name}
      </h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <TypeChip active={type === "text"} onClick={() => setType("text")} icon={<FileText size={16} />} label="Text" />
          <TypeChip active={type === "link"} onClick={() => setType("link")} icon={<LinkIcon size={16} />} label="Link" />
          <TypeChip active={type === "image"} onClick={() => setType("image")} icon={<ImageIcon size={16} />} label="Image" />
          <TypeChip active={type === "video"} onClick={() => setType("video")} icon={<Video size={16} />} label="Video" />
          <TypeChip active={type === "poll"} onClick={() => setType("poll")} icon={<ListChecks size={16} />} label="Poll" />
        </div>
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
        {type === "text" && <RichPostEditor value={content} onChange={setContent} />}
        {type === "link" && (
          <input
            type="url"
            placeholder="https://example.com"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] p-3"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
        )}
        {(type === "image" || type === "video") && (
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--card)] p-4">
            <input
              type="file"
              accept={type === "image" ? "image/*" : "video/*"}
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              required
            />
            <textarea
              placeholder="Caption or context"
              className="mt-3 min-h-24 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
        )}
        {type === "poll" && (
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <input
              value={pollQuestion}
              onChange={(event) => setPollQuestion(event.target.value)}
              placeholder="Poll question"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
            />
            {pollOptions.map((option, index) => (
              <input
                key={index}
                value={option}
                onChange={(event) => setPollOptions((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                placeholder={`Option ${index + 1}`}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-3"
              />
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button type="button" onClick={() => setPollOptions((current) => [...current, ""])} className="rounded-full border border-[var(--border)] px-3 py-2 text-sm font-semibold">
                Add option
              </button>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={pollMultiple} onChange={(event) => setPollMultiple(event.target.checked)} />
                Multiple choice
              </label>
            </div>
          </div>
        )}
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

function TypeChip({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${active ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] hover:bg-[var(--muted)]"}`}
    >
      {icon}
      {label}
    </button>
  );
}
