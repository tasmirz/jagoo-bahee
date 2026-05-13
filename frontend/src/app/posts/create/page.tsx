"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

interface Post {
  _id: string;
  title: string;
  subredditId: string;
}

export default function CreatePostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  
  const [subredditId, setSubredditId] = useState(searchParams?.get('subreddit') || "");
  const [subreddits, setSubreddits] = useState<Subreddit[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"text" | "link" | "image" | "video" | "audio" | "crosspost">("text");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [flair, setFlair] = useState("");
  const [isCrosspost, setIsCrosspost] = useState(false);
  const [crosspostSourceId, setCrosspostSourceId] = useState("");
  const [availableFlairs, setAvailableFlairs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // Require authentication
    if (!isAuthenticated) {
      router.push("/auth");
    }
  }, [isAuthenticated, router]);

  // Fetch joined subreddits for dropdown
  useEffect(() => {
    if (isAuthenticated) {
      const fetchSubreddits = async () => {
        try {
          const response = await backendFetch('/users/me/subreddits');
          if (response.ok) {
            const data = await response.json();
            setSubreddits(data);
            // If subreddit pre-selected, load its flairs
            if (subredditId && data.length > 0) {
              const selected = data.find((sub: Subreddit) => sub._id === subredditId);
              if (selected?.flairs) {
                setAvailableFlairs(selected.flairs);
              }
            }
          }
        } catch (error) {
          console.error('Failed to fetch subreddits:', error);
        }
      };
      fetchSubreddits();
    }
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
      setMessage("Missing credentials — please sign in");
      router.push("/auth");
      return;
    }

    if (!subredditId) {
      setMessage("Please select a subreddit");
      return;
    }
    if (!title.trim()) {
      setMessage("Title is required");
      return;
    }

    // Validate based on post type
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
      // Build canonical payload matching backend expectations
      const payload: any = {
        type: type === "crosspost" ? "crosspost" : type,
        title: title.trim(),
        subredditId,
        authorId: user._id,
      };

      // Add optional fields based on type
      if (type !== "link") {
        if (content.trim()) payload.content = content.trim();
        if (attachmentIds.length > 0) payload.attachmentIds = attachmentIds;
      }

      if (type === "link" && url.trim()) {
        payload.url = url.trim();
      }

      if (type === "crosspost" && crosspostSourceId) {
        payload.crosspostId = crosspostSourceId;
      }

      if (flair) {
        payload.flair = flair;
      }
      
      const canonical = JSON.stringify(payload);
      const hashBytes = await sha256(canonical);
      const contentHash = toHex(hashBytes);

      // Sign the hash using local private key
      const sig = signHash(pk, hashBytes);
      const sigB64 = toB64(sig);

      const body: any = {
        subredditId,
        authorId: user._id,
        title: title.trim(),
        type: type === "crosspost" ? "crosspost" : type,
        userSignature: sigB64,
        contentHash,
      };

      // Add optional fields
      if (type !== "link") {
        if (content.trim()) body.content = content.trim();
        if (attachmentIds.length > 0) body.attachmentIds = attachmentIds;
      }

      if (type === "link" && url.trim()) {
        body.url = url.trim();
      }

      if (type === "crosspost" && crosspostSourceId) {
        body.crosspostId = crosspostSourceId;
      }

      if (flair) {
        body.flair = flair;
      }

      const res = await backendFetch("/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || `Create post failed: ${res.status}`);
      }
      
      const envelope = await res.json();
      const data = envelope?.data || envelope;
      if (envelope?.receipt && typeof window !== "undefined") {
        const key = "jagoo:audit:receipts";
        const current = JSON.parse(localStorage.getItem(key) || "[]");
        localStorage.setItem(key, JSON.stringify([{ ...envelope.receipt, savedAt: new Date().toISOString() }, ...current].slice(0, 250)));
      }
      
      // Save the server proof to IndexedDB for persistent verification
      if (data.proofHash && data.proofSignature) {
        try {
          const { saveAcknowledgement } = await import('@/lib/indexeddb');
          await saveAcknowledgement({
            id: String(data.contentId || data.id),
            contentId: String(data.contentId || data.id),
            contentType: 'post',
            action: data.action || 'created',
            contentHash: data.contentHash,
            userSignature: data.userSignature,
            serverSignature: data.serverSignature,
            proofHash: data.proofHash,
            proofSignature: data.proofSignature,
            serverPublicKey: data.serverPublicKey,
            metadata: data.metadata || { serverKeyId: 'unknown' },
            createdAt: new Date().toISOString(),
            savedAt: Date.now(),
            verified: true,
            postTitle: title.trim(),
            postContent: content.trim(),
            userId: user._id,
          });
          console.log('[CreatePost] Saved proof to IndexedDB:', {
            postId: data.contentId,
            proofHash: data.proofHash,
          });
        } catch (error) {
          console.error('[CreatePost] Failed to save proof:', error);
          // Don't fail the whole operation if proof saving fails
        }
      }
      
      const id = data?.contentId || data?._id || data?.id || null;
      setMessage("Post created successfully!");
      if (id) {
        router.push(`/posts/${id}`);
      } else {
        // Fallback to homepage
        setTimeout(() => router.push("/"), 800);
      }
    } catch (err: unknown) {
      console.error("Create post error:", err);
      setMessage((err as Error).message || "Create failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Create Post</h1>
        <form onSubmit={handleSubmit} className="space-y-4 bg-[var(--card)] border border-[var(--border)] rounded-md p-6">
          {/* Community Selection - Auto Selected */}
          <div>
            <label className="block text-sm font-medium mb-1">Community *</label>
            <select 
              value={subredditId} 
              onChange={(e) => {
                setSubredditId(e.target.value);
                // Load flairs for selected subreddit
                const selected = subreddits.find(sub => sub._id === e.target.value);
                setAvailableFlairs(selected?.flairs || []);
                setFlair(""); // Reset flair when changing community
              }} 
              className="w-full px-3 py-2 border rounded-md bg-[var(--background)] text-[var(--foreground)]"
              required
            >
              <option value="">Select a community...</option>
              {subreddits.map((sub) => (
                <option key={sub._id} value={sub._id}>
                  r/{sub.name} {sub.displayName ? `- ${sub.displayName}` : ''}
                </option>
              ))}
            </select>
            {subreddits.length === 0 && isAuthenticated && (
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Join some communities first to post!
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              className="w-full px-3 py-2 border rounded-md" 
              placeholder="Enter post title (max 300 characters)"
              maxLength={300}
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">{title.length}/300</p>
          </div>

          {/* Post Type */}
          <div>
            <label className="block text-sm font-medium mb-1">Post Type *</label>
            <select 
              value={type} 
              onChange={(e) => setType(e.target.value as any)} 
              className="w-full px-3 py-2 border rounded-md bg-[var(--background)] text-[var(--foreground)]"
            >
              <option value="text">Text Post</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="audio">Audio</option>
              <option value="link">Link</option>
              <option value="crosspost">Crosspost</option>
            </select>
          </div>

          {/* Content/Text - For text, image, video, audio */}
          {type !== "link" && type !== "crosspost" && (
            <div>
              <label className="block text-sm font-medium mb-1">
                {type === "text" ? "Content (optional)" : "Caption (optional)"}
              </label>
              <textarea 
                value={content} 
                onChange={(e) => setContent(e.target.value)} 
                rows={6} 
                className="w-full px-3 py-2 border rounded-md" 
                placeholder="Add text to your post..."
              />
            </div>
          )}

          {/* Attachments - For text, image, video, audio */}
          {type !== "link" && type !== "crosspost" && (
            <div>
              <label className="block text-sm font-medium mb-2">
                {type === "text" && "Add Attachments (optional)"}
                {type === "image" && "Upload Images *"}
                {type === "video" && "Upload Videos *"}
                {type === "audio" && "Upload Audio *"}
              </label>
              <FileUploader
                acceptedTypes={
                  type === "image" ? "image/*" :
                  type === "video" ? "video/*" :
                  type === "audio" ? "audio/*" :
                  "image/*,video/*,audio/*"
                }
                maxSizeMB={type === "video" ? 500 : type === "audio" ? 100 : 10}
                onUploadComplete={(fileId) => {
                  // Allow multiple attachments for text, image, and video posts
                  setAttachmentIds(prev => [...prev, fileId]);
                }}
                label={
                  type === "text" ? "Add Images, Videos, or Audio" :
                  type === "image" ? "Upload Images" :
                  type === "video" ? "Upload Videos" :
                  type === "audio" ? "Upload Audio" :
                  "Upload"
                }
              />
              {attachmentIds.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-sm text-[var(--text-secondary)]">
                    {attachmentIds.length} file(s) uploaded
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachmentIds([])}
                    className="text-sm text-red-500 hover:text-red-600"
                  >
                    Clear all
                  </button>
                </div>
              )}
              {type === "text" && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Text posts can include multiple images, GIFs, videos, and audio files. Upload one at a time.
                </p>
              )}
              {type === "image" && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Upload images one at a time. Multiple images are supported.
                </p>
              )}
              {type === "video" && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Upload videos one at a time. Multiple videos are supported.
                </p>
              )}
              {type === "audio" && (
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Required for audio posts
                </p>
              )}
            </div>
          )}

          {/* URL - For link posts */}
          {type === "link" && (
            <div>
              <label className="block text-sm font-medium mb-1">URL *</label>
              <input 
                value={url} 
                onChange={(e) => setUrl(e.target.value)} 
                type="url"
                className="w-full px-3 py-2 border rounded-md" 
                placeholder="https://example.com"
              />
            </div>
          )}

          {/* Crosspost - Select source post */}
          {type === "crosspost" && (
            <div>
              <label className="block text-sm font-medium mb-1">Source Post URL or ID *</label>
              <input 
                value={crosspostSourceId} 
                onChange={(e) => setCrosspostSourceId(e.target.value)} 
                className="w-full px-3 py-2 border rounded-md" 
                placeholder="Enter post ID or URL to crosspost"
              />
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Crosspost other users' content to this community
              </p>
            </div>
          )}

          {/* Flair - For the community */}
          {availableFlairs.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-1">Flair (optional)</label>
              <select 
                value={flair} 
                onChange={(e) => setFlair(e.target.value)} 
                className="w-full px-3 py-2 border rounded-md bg-[var(--background)] text-[var(--foreground)]"
              >
                <option value="">No flair</option>
                {availableFlairs.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Add a flair to help categorize your post in this community
              </p>
            </div>
          )}

          {/* Submit Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-[var(--border)]">
            <button 
              type="submit" 
              disabled={loading || !subredditId || !title.trim()} 
              className="bg-[var(--primary)] text-white px-6 py-2 rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Creating..." : "Create Post"}
            </button>
            <button 
              type="button" 
              onClick={() => router.back()} 
              className="px-6 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)] transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Messages */}
          {message && (
            <div className={`p-3 rounded-md text-sm ${
              message.includes("successfully") 
                ? "bg-green-500/10 text-green-600" 
                : "bg-red-500/10 text-red-600"
            }`}>
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
