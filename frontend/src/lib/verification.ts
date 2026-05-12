// Content verification utilities
import * as tinysecp from "tiny-secp256k1";
import { sha256 } from "./crypto";
import { toHex, fromBase64 } from "./auth";
import {
  getCachedPublicKey,
  getCachedUserProfile,
  cacheUserProfile,
  getCachedVerification as getCachedVerificationFromDB,
  cacheVerification as cacheVerificationToDB,
} from "./indexeddb";

export interface VerificationResult {
  verified: boolean;
  contentHash: string;
  error?: string;
}

/**
 * Fetch public key for a user (with caching)
 */
export async function fetchPublicKey(
  userId: string,
  apiUrl?: string
): Promise<string | null> {
  try {
    console.log("[fetchPublicKey] Fetching public key for userId:", userId);

    // Check cache first
    const cached = await getCachedPublicKey(userId);
    if (cached) {
      console.log("[fetchPublicKey] Using cached public key for:", userId);
      return cached;
    }

    // Fetch from API
    // The auth service exposes a public key endpoint which returns base64
    const url = `${
      apiUrl || process.env.NEXT_PUBLIC_API_URL || ""
    }/auth/public/${userId}`;
    console.log("[fetchPublicKey] Fetching from URL:", url);

    const response = await fetch(url);
    console.log(
      "[fetchPublicKey] Response status:",
      response.status,
      response.ok
    );

    if (!response.ok) {
      console.warn(
        "[fetchPublicKey] Failed to fetch, status:",
        response.status
      );
      return null;
    }

    const data = await response.json();
    console.log("[fetchPublicKey] Response data:", data);

    if (!data || !data.publicKey) {
      console.warn(
        "[fetchPublicKey] No publicKey in response for userId:",
        userId
      );
      return null;
    }

    console.log(
      "[fetchPublicKey] Public key fetched successfully, length:",
      data.publicKey.length
    );

    // Fetch username from /users/:id endpoint
    let username = `user_${userId.slice(-8)}`; // fallback
    try {
      const userUrl = `${
        apiUrl || process.env.NEXT_PUBLIC_API_URL || ""
      }/users/${userId}`;
      const userResponse = await fetch(userUrl);
      if (userResponse.ok) {
        const userData = await userResponse.json();
        if (userData.username) {
          username = userData.username;
        }
      }
    } catch (e) {
      console.warn("[fetchPublicKey] Could not fetch username, using fallback");
    }

    // Cache user profile (userId, username, publicKey) for 24 hours
    await cacheUserProfile(
      userId,
      username,
      data.publicKey,
      24 * 60 * 60 * 1000
    );

    return data.publicKey;
  } catch (error) {
    console.error("[fetchPublicKey] Exception:", error);
    return null;
  }
}

/**
 * Verify a post or comment signature
 */
export async function verifyContent(
  content: {
    contentHash: string;
    userSignature: string;
  },
  publicKey: string
): Promise<VerificationResult> {
  try {
    // Decode signature and public key from base64
    const signatureBytes = fromBase64(content.userSignature);
    const publicKeyBytes = fromBase64(publicKey);

    console.log("[verifyContent] Decoded lengths:", {
      signature: signatureBytes.length,
      publicKey: publicKeyBytes.length,
      hash: content.contentHash.length,
    });

    // Convert content hash (hex string) to bytes
    const hashBytes = new Uint8Array(
      content.contentHash.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    console.log("[verifyContent] Hash bytes length:", hashBytes.length);
    console.log(
      "[verifyContent] First few bytes - hash:",
      Array.from(hashBytes.slice(0, 4))
    );
    console.log(
      "[verifyContent] First few bytes - sig:",
      Array.from(signatureBytes.slice(0, 4))
    );
    console.log(
      "[verifyContent] First few bytes - pubkey:",
      Array.from(publicKeyBytes.slice(0, 4))
    );

    // Validate public key format
    if (!tinysecp.isPoint(publicKeyBytes)) {
      console.error("[verifyContent] Invalid public key point!");
      return {
        verified: false,
        contentHash: content.contentHash,
        error: "Invalid public key format",
      };
    }

    // Verify signature using tiny-secp256k1
    // Parameter order: verify(hash, publicKey, signature)
    // NOT verify(hash, signature, publicKey)!
    const verified = tinysecp.verify(hashBytes, publicKeyBytes, signatureBytes);

    console.log("[verifyContent] Verification result:", verified);

    return {
      verified,
      contentHash: content.contentHash,
    };
  } catch (error) {
    console.error("[verifyContent] Verification exception:", error);
    return {
      verified: false,
      contentHash: content.contentHash,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

/**
 * Calculate content hash for a post
 */
export async function calculatePostHash(post: {
  type: string;
  title: string;
  content?: string;
  url?: string;
  attachmentIds?: string[];
}): Promise<string> {
  const canonical = JSON.stringify({
    type: post.type,
    title: post.title.trim(),
    content: post.content?.trim() || "",
    url: post.url?.trim() || "",
    attachmentIds: post.attachmentIds || [],
  });

  const hashBytes = await sha256(canonical);
  return toHex(hashBytes);
}

/**
 * Calculate content hash for a comment
 */
export async function calculateCommentHash(comment: {
  content: string;
  postId: string;
  parentId?: string;
}): Promise<string> {
  const canonical = JSON.stringify({
    content: comment.content.trim(),
    postId: comment.postId,
    parentId: comment.parentId || null,
  });

  const hashBytes = await sha256(canonical);
  return toHex(hashBytes);
}

/**
 * Batch verify multiple items
 */
export async function batchVerifyContent(
  items: Array<{
    contentHash: string;
    userSignature: string;
    publicKey: string;
  }>
): Promise<VerificationResult[]> {
  return Promise.all(items.map((item) => verifyContent(item, item.publicKey)));
}

/**
 * Cache verification results in IndexedDB
 */
const DB_NAME = "jagoo-bahee-verification";
const STORE_NAME = "verifications";

async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function cacheVerificationResult(
  id: string,
  result: VerificationResult
): Promise<void> {
  try {
    // Use new IndexedDB implementation with 5 minute TTL
    await cacheVerificationToDB(id, "post", result.verified, 5 * 60 * 1000);
  } catch (error) {
    console.error("Failed to cache verification:", error);
  }
}

export async function getCachedVerification(
  id: string
): Promise<VerificationResult | null> {
  try {
    const cached = await getCachedVerificationFromDB(id);
    if (!cached) return null;

    return {
      verified: cached.verified,
      contentHash: "",
    };
  } catch (error) {
    console.error("Failed to get cached verification:", error);
    return null;
  }
}
