"use client";

import React, { useState } from "react";
import backend from "@/lib/backend";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

type VerifyResponse = {
  contentHash?: string;
  userSignature?: string;
  serverAcknowledgements?: unknown[];
  post?: unknown;
  modLogs?: unknown[];
};

export default function AuditPage() {
  const [serverKey, setServerKey] = useState<{ keyId: string; publicKey: string } | null>(null);
  const [postId, setPostId] = useState("");
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadServerKey() {
    setError(null);
    try {
      const res = await backend.backendFetch("/moderation/server-public-key");
      if (!res.ok) throw new Error("Unable to load server key");
      setServerKey(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load server key");
    }
  }

  async function verifyPost() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await backend.backendFetch(`/posts/${postId}/verify`);
      if (!res.ok) throw new Error("Verification failed");
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Audit</h1>
          <p className="text-sm text-[var(--text-secondary)]">Server key and verification helpers.</p>
        </div>
        <button
          onClick={loadServerKey}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          <ShieldAlert size={16} />
          Load server key
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-lg font-semibold">Server identity</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Public key exposed by the backend moderation endpoint.</p>
          {serverKey ? (
            <div className="mt-4 space-y-2 text-sm">
              <div><span className="font-medium">Key ID:</span> {serverKey.keyId}</div>
              <div className="break-all"><span className="font-medium">Public key:</span> {serverKey.publicKey}</div>
            </div>
          ) : (
            <div className="mt-4 text-sm text-[var(--text-secondary)]">No key loaded yet.</div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <h2 className="text-lg font-semibold">Verify a post</h2>
          <div className="mt-4 space-y-3">
            <input
              value={postId}
              onChange={(e) => setPostId(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              placeholder="Post ID"
            />
            <button
              onClick={verifyPost}
              disabled={loading || !postId}
              className="inline-flex rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
            {error && <p className="text-sm text-[var(--error)]">{error}</p>}
            {result && (
              <pre className="overflow-auto rounded-xl border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">{JSON.stringify(result, null, 2)}</pre>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 text-sm text-[var(--text-secondary)]">
        This page uses server proof endpoints and portable receipt verification under `/audit/*`; the verify page can submit receipts to the standalone audit service.
      </div>
      <div className="mt-4">
        <Link href="/audit/verify" className="text-sm font-medium text-[var(--primary)] hover:underline">
          Open verify page
        </Link>
      </div>
    </div>
  );
}
