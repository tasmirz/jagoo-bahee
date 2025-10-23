"use client";

import React, { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { backendFetch } from "@/lib/backend";
import { useAuth } from "@/lib/context/AuthContext";
import { useUser } from "@/lib/context/UserContext";

export default function EditPostPage() {
  const router = useRouter();
  const params = useParams();
  const postId = params?.id as string;
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [post, setPost] = useState<any>(null);
  
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }

    // Fetch the post
    const fetchPost = async () => {
      try {
        const response = await backendFetch(`/posts/${postId}`);
        if (!response.ok) {
          throw new Error("Failed to fetch post");
        }
        const data = await response.json();
        
        // Check if user is the author
        const authorId = data.author?._id || data.authorId;
        if (authorId !== user?._id) {
          setMessage("You can only edit your own posts");
          setTimeout(() => router.push(`/posts/${postId}`), 2000);
          return;
        }
        
        setPost(data);
        setTitle(data.title || "");
        setContent(data.content || "");
      } catch (error) {
        console.error("Failed to fetch post:", error);
        setMessage("Failed to load post");
      } finally {
        setLoading(false);
      }
    };

    if (postId && user) {
      fetchPost();
    }
  }, [postId, isAuthenticated, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!title.trim()) {
      setMessage("Title is required");
      return;
    }

    setSubmitting(true);
    try {
      const response = await backendFetch(`/posts/${postId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          authorId: user?._id,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update post");
      }

      setMessage("Post updated successfully!");
      setTimeout(() => router.push(`/posts/${postId}`), 1000);
    } catch (error) {
      console.error("Failed to update post:", error);
      setMessage(error instanceof Error ? error.message : "Failed to update post");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
        <p>Loading post...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
        <p>{message || "Post not found"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-4">Edit Post</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4 bg-[var(--card)] border border-[var(--border)] rounded-md p-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input 
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              className="w-full px-3 py-2 border rounded-md bg-[var(--background)] text-[var(--foreground)]" 
              placeholder="Enter post title (max 300 characters)"
              maxLength={300}
              required
            />
            <p className="text-xs text-[var(--text-secondary)] mt-1">{title.length}/300</p>
          </div>

          {/* Content */}
          {post.type !== "link" && (
            <div>
              <label className="block text-sm font-medium mb-1">Content</label>
              <textarea 
                value={content} 
                onChange={(e) => setContent(e.target.value)} 
                rows={10} 
                className="w-full px-3 py-2 border rounded-md bg-[var(--background)] text-[var(--foreground)]" 
                placeholder="Edit your post content..."
              />
            </div>
          )}

          {/* Message */}
          {message && (
            <div className={`p-3 rounded-md ${message.includes("successfully") ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
              {message}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Updating..." : "Update Post"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/posts/${postId}`)}
              className="px-4 py-2 border border-[var(--border)] rounded-md hover:bg-[var(--muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
