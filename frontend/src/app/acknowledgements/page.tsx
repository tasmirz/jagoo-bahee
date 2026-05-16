"use client";

import { useEffect, useState, useRef } from "react";
import {
  getAllAcknowledgements,
  exportAcknowledgements,
  importAcknowledgements,
  deleteAcknowledgement,
  clearAllAcknowledgements,
  refreshDB,
  StoredAcknowledgement,
} from "@/lib/indexeddb";
import { verifyServerAcknowledgement, fetchServerPublicKey } from "@/lib/serverVerification";
import { verifyProofWithServer, downloadProof } from "@/lib/proofVerification";
import Link from "next/link";

export default function AcknowledgementsPage() {
  const [acknowledgements, setAcknowledgements] = useState<StoredAcknowledgement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "post" | "comment">("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest">("newest");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, any>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAcknowledgements();
  }, []);

  const loadAcknowledgements = async () => {
    setLoading(true);
    setError(null);
    try {
      const acks = await getAllAcknowledgements();
      setAcknowledgements(acks);
    } catch (error) {
      console.error("Failed to load acknowledgements:", error);
      
      // Try to refresh database once if there's an error
      try {
        console.log("Attempting to refresh database...");
        await refreshDB();
        const acks = await getAllAcknowledgements();
        setAcknowledgements(acks);
      } catch (retryError) {
        console.error("Failed to load acknowledgements after DB refresh:", retryError);
        setError("Failed to load acknowledgements. Please try refreshing the page.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportAcknowledgements();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acknowledgements-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to export acknowledgements");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const result = await importAcknowledgements(text);

      if (result.errors.length > 0) {
        console.error("Import errors:", result.errors);
      }

      alert(
        `Import complete!\nImported: ${result.imported}\nSkipped: ${result.skipped}\nErrors: ${result.errors.length}`
      );

      await loadAcknowledgements();
    } catch (error) {
      console.error("Import failed:", error);
      alert("Failed to import acknowledgements");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this acknowledgement?")) {
      return;
    }

    try {
      await deleteAcknowledgement(id);
      await loadAcknowledgements();
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete acknowledgement");
    }
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        "Are you sure you want to delete ALL acknowledgements? This action cannot be undone. Consider exporting first!"
      )
    ) {
      return;
    }

    try {
      await clearAllAcknowledgements();
      await loadAcknowledgements();
    } catch (error) {
      console.error("Clear all failed:", error);
      alert("Failed to clear acknowledgements");
    }
  };

  const handleVerify = async (ack: StoredAcknowledgement) => {
    setVerifying(ack.id);

    try {
      // If acknowledgement has proof data, verify proof
      if (ack.proofHash && ack.proofSignature && ack.userId) {
        const result = await verifyProofWithServer(
          ack.userId,
          ack.contentId,
          ack.proofHash,
          ack.proofSignature
        );

        setVerificationResults((prev) => ({
          ...prev,
          [ack.id]: { ...result, type: 'proof' },
        }));
      } else {
        // Legacy verification: verify server signature
        const serverKey = await fetchServerPublicKey();
        if (!serverKey) {
          setVerificationResults((prev) => ({
            ...prev,
            [ack.id]: { valid: false, error: 'Failed to fetch server public key', type: 'legacy' },
          }));
          return;
        }

        const verified = await verifyServerAcknowledgement(
          {
            _id: ack.id,
            contentId: ack.contentId,
            contentType: ack.contentType,
            action: ack.action as any,
            contentHash: ack.contentHash,
            userSignature: ack.userSignature,
            serverSignature: ack.serverSignature,
            metadata: ack.metadata,
            createdAt: ack.createdAt,
          },
          serverKey.publicKey
        );

        setVerificationResults((prev) => ({
          ...prev,
          [ack.id]: { 
            valid: verified, 
            proofVerified: verified,
            message: verified ? 'Server signature verified' : 'Server signature verification failed',
            type: 'legacy'
          },
        }));
      }
    } catch (error) {
      console.error("Verification failed:", error);
      setVerificationResults((prev) => ({
        ...prev,
        [ack.id]: { valid: false, error: 'Verification failed', type: 'error' },
      }));
    } finally {
      setVerifying(null);
    }
  };

  const handleDownloadProof = (ack: StoredAcknowledgement) => {
    if (!ack.proofHash || !ack.proofSignature) {
      alert('This acknowledgement does not have proof data');
      return;
    }

    downloadProof({
      userId: ack.userId,
      postId: ack.contentId,
      proofHash: ack.proofHash,
      proofSignature: ack.proofSignature,
      serverPublicKey: ack.serverPublicKey,
      postTitle: ack.postTitle,
      createdAt: ack.createdAt,
    });
  };

  const filteredAcknowledgements = acknowledgements
    .filter((ack) => filter === "all" || ack.contentType === filter)
    .sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return sortBy === "newest" ? timeB - timeA : timeA - timeB;
    });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
          Proofs & Audit Trail
        </h1>
        <p className="text-[var(--text-secondary)]">
          Your local archive of cryptographic proofs, server acknowledgements, and audit trail data.
          These persist even if content is deleted, providing permanent proof of ownership and
          comprehensive history of all server actions.
        </p>
      </div>

      {/* Actions Bar */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={acknowledgements.length === 0}
              className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 disabled:bg-[var(--muted)] disabled:text-[var(--text-secondary)] disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Export JSON
            </button>

            <label
                className={`px-4 py-2 bg-green-600 text-white rounded-lg hover:opacity-90 transition cursor-pointer flex items-center gap-2 ${
                importing ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              {importing ? "Importing..." : "Import JSON"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={importing}
                className="hidden"
              />
            </label>

            <button
              onClick={handleClearAll}
              disabled={acknowledgements.length === 0}
              className="px-4 py-2 bg-[var(--error)] text-white rounded-lg hover:opacity-90 disabled:bg-[var(--muted)] disabled:text-[var(--text-secondary)] disabled:cursor-not-allowed transition flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Clear All
            </button>
          </div>

          <div className="flex gap-4 items-center">
            <div className="flex gap-2">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1 rounded-lg text-sm transition ${
                  filter === "all"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted-hover)]"
                }`}
              >
                All ({acknowledgements.length})
              </button>
              <button
                onClick={() => setFilter("post")}
                className={`px-3 py-1 rounded-lg text-sm transition ${
                  filter === "post"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted-hover)]"
                }`}
              >
                Posts ({acknowledgements.filter((a) => a.contentType === "post").length})
              </button>
              <button
                onClick={() => setFilter("comment")}
                className={`px-3 py-1 rounded-lg text-sm transition ${
                  filter === "comment"
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--muted-hover)]"
                }`}
              >
                Comments ({acknowledgements.filter((a) => a.contentType === "comment").length})
              </button>
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "newest" | "oldest")}
              className="px-3 py-1 border border-[var(--border)] rounded-lg bg-[var(--background)] text-[var(--foreground)] text-sm"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="rounded-lg border border-[var(--error)] bg-[var(--error)]/10 p-4 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-[var(--error)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">
                Error Loading Acknowledgements
              </h3>
              <p className="text-sm text-[var(--error)]">{error}</p>
              <button
                onClick={loadAcknowledgements}
                className="mt-2 text-sm text-[var(--error)] hover:underline font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
        </div>
      ) : filteredAcknowledgements.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-12 text-center shadow-sm">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-[var(--text-secondary)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            No Acknowledgements Yet
          </h3>
          <p className="text-[var(--text-secondary)] mb-4">
            Visit your posts to automatically save server acknowledgements, or import from a backup
            file.
          </p>
          <Link
            href="/"
            className="inline-block px-6 py-2 bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition"
          >
            Go to Home
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAcknowledgements.map((ack) => (
            <div
              key={ack.id}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded ${
                        ack.verified
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}
                    >
                      {ack.verified ? "✓ VERIFIED" : "✗ UNVERIFIED"}
                    </span>
                    <span className="px-2 py-1 text-xs font-semibold rounded bg-[var(--primary)]/15 text-[var(--primary)]">
                      {ack.action.toUpperCase()}
                    </span>
                    <span className="px-2 py-1 text-xs rounded bg-[var(--muted)] text-[var(--foreground)]">
                      {ack.contentType}
                    </span>
                  </div>

                  {ack.postTitle && (
                    <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                      {ack.postTitle}
                    </h3>
                  )}

                  {ack.postContent && (
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-2">
                      {ack.postContent}
                    </p>
                  )}

                  <div className="text-sm text-[var(--foreground)] space-y-1">
                    <p>
                      <span className="font-medium">Content ID:</span>{" "}
                      <Link
                        href={`/posts/${ack.contentId}`}
                        className="text-[var(--primary)] hover:underline"
                      >
                        {ack.contentId}
                      </Link>
                    </p>
                    <p>
                      <span className="font-medium">Server Key:</span> {ack.metadata.serverKeyId}
                    </p>
                    {ack.proofHash && (
                      <p>
                        <span className="font-medium">Proof Hash:</span>{" "}
                        <code className="text-xs bg-[var(--muted)] px-1 py-0.5 rounded">
                          {ack.proofHash.substring(0, 16)}...
                        </code>
                        <span className="ml-2 px-2 py-0.5 text-xs bg-[var(--primary)]/15 text-[var(--primary)] rounded">
                          🛡️ Proof Available
                        </span>
                      </p>
                    )}
                    <p>
                      <span className="font-medium">Created:</span>{" "}
                      {new Date(ack.createdAt).toLocaleString()}
                    </p>
                    <p>
                      <span className="font-medium">Saved Locally:</span>{" "}
                      {new Date(ack.savedAt).toLocaleString()}
                    </p>
                    {ack.metadata.reason && (
                      <p>
                        <span className="font-medium">Reason:</span>{" "}
                        <span className="italic">{ack.metadata.reason}</span>
                      </p>
                    )}
                  </div>

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)]">
                      View Signatures & Proof Data
                    </summary>
                    <div className="mt-2 space-y-1 text-xs font-mono bg-[var(--background)] p-3 rounded">
                      {ack.contentHash && (
                        <p className="break-all">
                          <span className="font-semibold">Content Hash:</span> {ack.contentHash}
                        </p>
                      )}
                      {ack.userSignature && (
                        <p className="break-all">
                          <span className="font-semibold">User Signature:</span>{" "}
                          {ack.userSignature}
                        </p>
                      )}
                      <p className="break-all">
                        <span className="font-semibold">Server Signature:</span>{" "}
                        {ack.serverSignature}
                      </p>
                      {ack.proofHash && (
                        <>
                          <p className="break-all">
                            <span className="font-semibold">Proof Hash:</span> {ack.proofHash}
                          </p>
                          <p className="break-all">
                            <span className="font-semibold">Proof Signature:</span>{" "}
                            {ack.proofSignature}
                          </p>
                          {ack.serverPublicKey && (
                            <p className="break-all">
                              <span className="font-semibold">Server Public Key:</span>{" "}
                              {ack.serverPublicKey}
                            </p>
                          )}
                          {ack.userId && (
                            <p className="break-all">
                              <span className="font-semibold">User ID:</span> {ack.userId}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </details>

                  {/* Verification Results */}
                  {verificationResults[ack.id] && (
                    <div
                      className={`mt-4 p-4 rounded-lg border-2 ${
                        verificationResults[ack.id].valid && verificationResults[ack.id].proofVerified
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-500'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-500'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {verificationResults[ack.id].valid && verificationResults[ack.id].proofVerified ? (
                          <svg className="w-6 h-6 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold mb-2">
                            {verificationResults[ack.id].valid && verificationResults[ack.id].proofVerified 
                              ? (verificationResults[ack.id].type === 'proof' ? 'Proof Verified ✓' : 'Signature Verified ✓')
                              : 'Verification Failed'}
                          </h4>
                          {verificationResults[ack.id].postStatus && (
                            <p className="text-sm mb-2">
                              <span className="font-medium">Post Status:</span>{' '}
                              <span className="capitalize">{verificationResults[ack.id].postStatus.replace(/_/g, ' ')}</span>
                            </p>
                          )}
                          {verificationResults[ack.id].message && (
                            <p className="text-sm text-[var(--text-secondary)]">{verificationResults[ack.id].message}</p>
                          )}
                          {verificationResults[ack.id].error && (
                            <p className="text-sm text-[var(--error)]">{verificationResults[ack.id].error}</p>
                          )}
                          {verificationResults[ack.id].post && (
                            <div className="mt-3 text-sm space-y-1">
                              <p><span className="font-medium">Score:</span> {verificationResults[ack.id].post.score}</p>
                              <p><span className="font-medium">Comments:</span> {verificationResults[ack.id].post.commentCount}</p>
                              {verificationResults[ack.id].post.isRemoved && (
                                <p className="text-[var(--error)] font-medium">⚠️ Post has been removed</p>
                              )}
                              {verificationResults[ack.id].post.isLocked && (
                                <p className="text-orange-600 dark:text-orange-400">🔒 Post is locked</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 ml-4">
                  <button
                    onClick={() => handleVerify(ack)}
                    disabled={verifying === ack.id}
                    className="px-3 py-1 text-sm bg-[var(--primary)] text-white rounded hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    {verifying === ack.id ? 'Verifying...' : 'Verify'}
                  </button>
                  {ack.proofHash && ack.proofSignature && (
                    <button
                      onClick={() => handleDownloadProof(ack)}
                      className="px-3 py-1 text-sm bg-[var(--muted)] text-[var(--foreground)] rounded hover:bg-[var(--muted-hover)] transition"
                      title="Download proof as JSON"
                    >
                      Download
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(ack.id)}
                    className="px-3 py-1 text-sm bg-[var(--error)] text-white rounded hover:opacity-90 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-8 rounded-lg border border-[var(--border)] bg-[var(--card)] p-6">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
          🔒 Unified Proof & Audit System
        </h3>
        <ul className="text-sm text-[var(--text-secondary)] space-y-2">
          <li>
            • <strong>Automatic Archival:</strong> When you create posts, cryptographic proofs and
            acknowledgements are automatically saved to your browser's IndexedDB storage.
          </li>
          <li>
            • <strong>Cryptographic Proofs:</strong> Each post receives a proof hash (SHA256 of userId|postId|serverPublicKey) 
            signed by the server, creating unforgeable evidence of ownership.
          </li>
          <li>
            • <strong>Complete Audit Trail:</strong> All server actions (create, update, moderate, delete) 
            are cryptographically signed and stored, creating an immutable history.
          </li>
          <li>
            • <strong>Deletion Protection:</strong> Even if posts are deleted from the server,
            you retain complete cryptographic proof of ownership and all historical actions.
          </li>
          <li>
            • <strong>Verification:</strong> Click "Verify" to validate proof authenticity with the server 
            and retrieve current post status (active/removed/deleted/archived).
          </li>
          <li>
            • <strong>Export & Backup:</strong> Download individual proofs or export your entire archive
            as JSON for safekeeping, legal purposes, or external verification.
          </li>
        </ul>
      </div>
    </div>
  );
}
