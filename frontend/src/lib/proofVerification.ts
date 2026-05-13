import { backendFetch } from "./backend";

interface ProofPost {
  _id?: string;
  title?: string;
  statusFlags?: string;
}

interface ExportableProof {
  userId?: string;
  postId?: string;
  proofHash?: string;
  proofSignature?: string;
  serverPublicKey?: string;
  postTitle?: string;
  createdAt?: string;
}

/**
 * Verify a proof hash with the server and get post status
 *
 * This allows users to prove they had a post even if it was deleted.
 * The proof hash is: SHA256(userId|postId|serverPublicKey)
 * Signed by the server at post creation time.
 *
 * @param userId - The author's user ID
 * @param postId - The post ID
 * @param proofHash - The proof hash provided by server
 * @param proofSignature - The server's signature of the proof hash
 * @returns Verification result with post status
 */
export async function verifyProofWithServer(
  userId: string,
  postId: string,
  proofHash: string,
  proofSignature: string
): Promise<{
  valid: boolean;
  proofVerified?: boolean;
  postStatus?: string;
  postExists?: boolean;
  post?: ProofPost;
  error?: string;
  message?: string;
  serverPublicKey?: string;
}> {
  try {
    const res = await backendFetch("/posts/proofs/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        postId,
        proofHash,
        proofSignature,
      }),
    });

    if (!res.ok) {
      return {
        valid: false,
        error: "Failed to verify proof with server",
      };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error("[ProofVerification] Error:", error);
    return {
      valid: false,
      error: "Network error while verifying proof",
    };
  }
}

/**
 * Verify a proof locally using Web Crypto API
 * This checks if the proof hash is correctly signed by the server
 *
 * @param proofHash - The proof hash (hex string)
 * @param proofSignature - The signature (base64)
 * @param serverPublicKey - Server's public key (base64)
 * @returns true if signature is valid
 */
export async function verifyProofSignatureLocally(
  proofHash: string,
  proofSignature: string,
  serverPublicKey: string
): Promise<boolean> {
  try {
    // Convert proof hash from hex to buffer
    const proofHashBuffer = hexToBuffer(proofHash);

    // Convert signature from base64 to buffer
    const signatureBuffer = base64ToBuffer(proofSignature);

    // Convert public key from base64 to buffer
    const pubKeyBuffer = base64ToBuffer(serverPublicKey);

    // Import the public key
    const publicKey = await crypto.subtle.importKey(
      "raw",
      pubKeyBuffer,
      {
        name: "ECDSA",
        namedCurve: "P-256",
      },
      false,
      ["verify"]
    );

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      {
        name: "ECDSA",
        hash: "SHA-256",
      },
      publicKey,
      signatureBuffer,
      proofHashBuffer
    );

    return isValid;
  } catch (error) {
    console.error("[ProofVerification] Local verification error:", error);
    return false;
  }
}

/**
 * Convert hex string to ArrayBuffer
 */
function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

/**
 * Convert base64 string to ArrayBuffer
 */
function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Format proof information for display
 */
export function formatProofInfo(proof: {
  userId: string;
  postId: string;
  proofHash: string;
  proofSignature: string;
  serverPublicKey?: string;
}): string {
  return `
Proof of Post Ownership
========================

User ID: ${proof.userId}
Post ID: ${proof.postId}
Proof Hash: ${proof.proofHash}
Proof Signature: ${proof.proofSignature.substring(0, 32)}...
Server Public Key: ${proof.serverPublicKey?.substring(0, 32)}...

This proof can be verified at any time to check the status of your post,
even if it has been deleted or removed.
`.trim();
}

/**
 * Export proof as JSON for download
 */
export function exportProofAsJSON(proof: ExportableProof): string {
  return JSON.stringify(proof, null, 2);
}

/**
 * Download proof as a file
 */
export function downloadProof(proof: ExportableProof, filename?: string): void {
  const json = exportProofAsJSON(proof);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || `proof-${proof.postId || "post"}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
