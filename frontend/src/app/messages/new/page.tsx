"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import backend from "@/lib/backend";
import { getPrivateKey, getAuthIdFromToken, signHash, toB64 } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";
import { useAuth } from "@/components/providers/auth-provider";

interface UserOption {
  _id: string;
  username: string;
  displayName?: string;
}

export default function NewMessagePage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [recipientId, setRecipientId] = useState("");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: recipientQuery.trim(), limit: "8" });
        const res = await backend.backendFetch(`/users?${params}`);
        if (res.ok) {
          const users = await res.json();
          setUserOptions(Array.isArray(users) ? users : []);
        }
      } catch (err) {
        console.error("Failed to search users:", err);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated, recipientQuery]);

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const senderId = getAuthIdFromToken();
      const privateKey = getPrivateKey();
      if (!senderId || !privateKey) throw new Error("Sign in again to send messages.");

      if (!recipientId) throw new Error("Choose a recipient.");

      const canonical = JSON.stringify({
        senderId,
        recipientId,
        subject: subject || "",
        content,
        attachmentIds: [],
        parentMessageId: null,
      });
      const hash = await sha256(canonical);
      const contentHash = Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
      const senderSignature = toB64(signHash(privateKey, hash));

      const res = await backend.backendJson("POST", "/messages", {
        recipientId,
        subject,
        content,
        contentHash,
        attachmentIds: [],
        senderSignature,
      });

      if (!res.ok) throw new Error("Message failed to send.");
      router.push("/messages");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setLoading(false);
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <p className="text-sm text-[var(--text-secondary)]">Sign in to send a message.</p>
          <Link href="/auth" className="mt-4 inline-flex rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold">New Message</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">Search for a user, then send a signed private message.</p>

      <form onSubmit={sendMessage} className="mt-6 space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div>
          <label className="mb-1 block text-sm font-medium">Recipient</label>
          <input
            value={recipientQuery}
            onChange={(e) => {
              setRecipientQuery(e.target.value);
              setRecipientId("");
            }}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            placeholder="Search username"
            required
          />
          <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--background)]">
            {userOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--text-secondary)]">No users found</div>
            ) : (
              userOptions.map((option) => (
                <button
                  key={option._id}
                  type="button"
                  onClick={() => {
                    setRecipientId(option._id);
                    setRecipientQuery(option.username);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-[var(--muted)] ${recipientId === option._id ? "bg-[var(--muted)]" : ""}`}
                >
                  <span className="font-medium">u/{option.username}</span>
                  {option.displayName && <span className="ml-2 text-xs text-[var(--text-secondary)]">{option.displayName}</span>}
                </button>
              ))
            )}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            placeholder="Optional subject"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Message</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-40 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            placeholder="Write your message"
            required
          />
        </div>
        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => router.back()} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm">
            Cancel
          </button>
          <button type="submit" disabled={loading} className="rounded-full bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
