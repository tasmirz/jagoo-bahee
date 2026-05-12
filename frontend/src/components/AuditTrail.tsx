"use client";

import { useEffect, useState } from "react";
import {
  fetchAuditTrail,
  ServerAcknowledgement,
  parseAcknowledgementPayload,
} from "@/lib/serverVerification";

interface AuditTrailProps {
  postId: string;
  open: boolean;
  onClose: () => void;
}

export default function AuditTrail({ postId, open, onClose }: AuditTrailProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    post: any;
    serverAcknowledgements: ServerAcknowledgement[];
    modLogs: any[];
    verified: boolean[];
  } | null>(null);

  useEffect(() => {
    if (open && postId) {
      loadAuditTrail();
    }
  }, [open, postId]);

  const loadAuditTrail = async () => {
    setLoading(true);
    try {
      const result = await fetchAuditTrail(postId);
      setData(result);
    } catch (error) {
      console.error("Failed to load audit trail:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Audit Trail
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          )}

          {!loading && !data && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              Failed to load audit trail
            </div>
          )}

          {!loading && data && (
            <div className="space-y-6">
              {/* Post Info */}
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
                  Post Information
                </h3>
                <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  <p>
                    <span className="font-medium">ID:</span> {data.post._id}
                  </p>
                  <p>
                    <span className="font-medium">Title:</span> {data.post.title}
                  </p>
                  <p>
                    <span className="font-medium">Author:</span> u/{data.post.author?.username}
                  </p>
                  <p>
                    <span className="font-medium">Status:</span>{" "}
                    <span
                      className={
                        data.post.isRemoved
                          ? "text-red-600 dark:text-red-400"
                          : "text-green-600 dark:text-green-400"
                      }
                    >
                      {data.post.isRemoved ? "Removed" : "Active"}
                    </span>
                  </p>
                </div>
              </div>

              {/* Server Acknowledgements */}
              <div>
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                  Server Acknowledgements ({data.serverAcknowledgements.length})
                </h3>
                <div className="space-y-3">
                  {data.serverAcknowledgements.map((ack, index) => {
                    const verified = data.verified[index];
                    const payload = parseAcknowledgementPayload(ack);
                    const timestamp = new Date(ack.createdAt).toLocaleString();

                    return (
                      <div
                        key={ack._id}
                        className={`border rounded-lg p-4 ${
                          verified
                            ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20"
                            : "border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-lg ${
                                verified ? "text-green-600" : "text-red-600"
                              }`}
                            >
                              {verified ? "✓" : "✗"}
                            </span>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {ack.action.toUpperCase()}
                            </span>
                            <span className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                              {ack.contentType}
                            </span>
                          </div>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {timestamp}
                          </span>
                        </div>

                        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                          <p>
                            <span className="font-medium">Server Key ID:</span>{" "}
                            {ack.metadata.serverKeyId}
                          </p>
                          {ack.metadata.moderatorId && (
                            <p>
                              <span className="font-medium">Moderator:</span>{" "}
                              {ack.metadata.moderatorId}
                            </p>
                          )}
                          {ack.metadata.reason && (
                            <p>
                              <span className="font-medium">Reason:</span>{" "}
                              <span className="italic">{ack.metadata.reason}</span>
                            </p>
                          )}
                        </div>

                        {/* Payload Preview */}
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
                            View Payload
                          </summary>
                          <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">
                            {JSON.stringify(payload, null, 2)}
                          </pre>
                        </details>

                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Signature: {ack.serverSignature?.substring(0, 40)}...
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Moderation Logs */}
              {data.modLogs.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                    Moderation Logs ({data.modLogs.length})
                  </h3>
                  <div className="space-y-3">
                    {data.modLogs.map((log) => {
                      const timestamp = new Date(log.timestamp).toLocaleString();
                      return (
                        <div
                          key={log._id}
                          className="border border-gray-300 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {log.action.toUpperCase()}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {timestamp}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                            <p>
                              <span className="font-medium">Moderator:</span> u/
                              {log.moderator?.username || "Unknown"}
                            </p>
                            {log.reason && (
                              <p>
                                <span className="font-medium">Reason:</span>{" "}
                                <span className="italic">{log.reason}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>🔒 Cryptographic Guarantee:</strong> All server
                  acknowledgements are signed with the server's private key. This
                  creates an immutable audit trail that cannot be forged or deleted.
                  {data.verified.every((v) => v) && (
                    <span className="block mt-2 text-green-700 dark:text-green-300">
                      ✓ All signatures verified successfully
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
