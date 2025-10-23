/**
 * Server Acknowledgement Verification
 *
 * Verifies server-signed acknowledgements to ensure transparency and prevent ghost deletes.
 */

import * as tinysecp from "tiny-secp256k1";
import { fromBase64 } from "./auth";
import { getCachedUserProfile, cacheUserProfile } from "./indexeddb";

export interface ServerAcknowledgement {
  _id: string;
  action:
    | "create"
    | "update"
    | "remove"
    | "mod_remove"
    | "mod_approve"
    | "created"
    | "deleted";
  contentType: "post" | "comment";
  contentId: string;
  payload?: string; // Canonical JSON (may not be present)
  serverSignature: string; // Server signature (base64)
  contentHash?: string;
  userSignature?: string;
  metadata: {
    serverKeyId: string;
    moderatorId?: string;
    reason?: string;
  };
  createdAt: string;
}

export interface ServerPublicKey {
  keyId: string;
  publicKey: string; // base64
}

let cachedServerKey: ServerPublicKey | null = null;

/**
 * Fetch server's public key (with caching)
 */
export async function fetchServerPublicKey(
  apiUrl?: string
): Promise<ServerPublicKey | null> {
  try {
    // Return cached key if available
    if (cachedServerKey) {
      return cachedServerKey;
    }

    // Fetch from API
    const url = `${
      apiUrl || process.env.NEXT_PUBLIC_API_URL || ""
    }/moderation/server-public-key`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data || !data.publicKey) return null;

    // Cache in memory
    cachedServerKey = data;

    // Also cache in IndexedDB using the special "server" userId
    await cacheUserProfile(
      "__server__",
      "Server",
      data.publicKey,
      7 * 24 * 60 * 60 * 1000
    ); // 7 days

    return data;
  } catch (error) {
    console.error(
      "[ServerVerification] Failed to fetch server public key:",
      error
    );
    return null;
  }
}

/**
 * Verify a server acknowledgement signature
 */
export async function verifyServerAcknowledgement(
  acknowledgement: ServerAcknowledgement,
  serverPublicKey?: string
): Promise<boolean> {
  try {
    // Get server public key if not provided
    if (!serverPublicKey) {
      const serverKey = await fetchServerPublicKey();
      if (!serverKey) return false;
      serverPublicKey = serverKey.publicKey;
    }

    // Check if signature exists
    if (!acknowledgement.serverSignature) {
      console.error(
        "[ServerVerification] No signature found in acknowledgement"
      );
      return false;
    }

    // Validate base64 before decoding
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(acknowledgement.serverSignature)) {
      console.error(
        "[ServerVerification] Invalid base64 signature:",
        acknowledgement.serverSignature
      );
      return false;
    }

    // Decode signature and public key
    const signatureBytes = fromBase64(acknowledgement.serverSignature);
    const publicKeyBytes = fromBase64(serverPublicKey);

    // Create the payload that was signed
    // Format: "{contentId}|{action}|{contentHash}"
    const payload = `${acknowledgement.contentId}|${acknowledgement.action}|${
      acknowledgement.contentHash || ""
    }`;

    // Hash the payload (server signs the payload string)
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest("SHA-256", payloadBytes);
    const hashBytes = new Uint8Array(hashBuffer);

    // Verify signature
    const verified = tinysecp.verify(hashBytes, publicKeyBytes, signatureBytes);

    console.log("[ServerVerification]", {
      contentId: acknowledgement.contentId,
      action: acknowledgement.action,
      payload,
      verified,
    });

    return verified;
  } catch (error) {
    console.error("[ServerVerification] Verification failed:", error);
    return false;
  }
}

/**
 * Fetch and verify post acknowledgements
 */
export async function fetchPostVerification(
  postId: string,
  apiUrl?: string
): Promise<{
  contentHash: string;
  userSignature: string;
  serverAcknowledgements: ServerAcknowledgement[];
  verified: boolean[];
} | null> {
  try {
    const url = `${
      apiUrl || process.env.NEXT_PUBLIC_API_URL || ""
    }/posts/${postId}/verify`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();

    // Verify all acknowledgements
    const verified = await Promise.all(
      data.serverAcknowledgements.map((ack: ServerAcknowledgement) =>
        verifyServerAcknowledgement(ack)
      )
    );

    return {
      ...data,
      verified,
    };
  } catch (error) {
    console.error("[ServerVerification] Failed to fetch verification:", error);
    return null;
  }
}

/**
 * Fetch full audit trail for a post
 */
export async function fetchAuditTrail(
  postId: string,
  apiUrl?: string
): Promise<{
  post: any;
  serverAcknowledgements: ServerAcknowledgement[];
  modLogs: any[];
  verified: boolean[];
} | null> {
  try {
    const url = `${
      apiUrl || process.env.NEXT_PUBLIC_API_URL || ""
    }/posts/${postId}/audit-trail`;

    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();

    // Verify all acknowledgements
    const verified = await Promise.all(
      data.serverAcknowledgements.map((ack: ServerAcknowledgement) =>
        verifyServerAcknowledgement(ack)
      )
    );

    return {
      ...data,
      verified,
    };
  } catch (error) {
    console.error("[ServerVerification] Failed to fetch audit trail:", error);
    return null;
  }
}

/**
 * Parse acknowledgement payload
 */
export function parseAcknowledgementPayload(
  acknowledgement: ServerAcknowledgement
): any {
  // The payload format is: "{contentId}|{action}|{contentHash}"
  // Return a structured object for display
  return {
    contentId: acknowledgement.contentId,
    action: acknowledgement.action,
    contentHash: acknowledgement.contentHash,
    userSignature: acknowledgement.userSignature,
  };
}

/**
 * Check if post was removed by server
 */
export function wasRemovedByServer(acknowledgements: ServerAcknowledgement[]): {
  removed: boolean;
  reason?: string;
  moderator?: string;
  when?: string;
} {
  const removal = acknowledgements.find(
    (ack) => ack.action === "remove" || ack.action === "mod_remove"
  );

  if (!removal) {
    return { removed: false };
  }

  return {
    removed: true,
    reason: removal.metadata.reason,
    moderator: removal.metadata.moderatorId,
    when: removal.createdAt,
  };
}
