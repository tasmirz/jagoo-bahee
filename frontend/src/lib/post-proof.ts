import { sha256 } from "@/lib/crypto";
import { fromBase64, verifySignature } from "@/lib/auth";
import { Post } from "@/lib/types";
import { rememberPublicKey } from "@/lib/public-key-cache";

export function canonicalPostPayload(post: Post) {
  const authorId = typeof post.authorId === "string" ? post.authorId : post.authorId?._id;
  const subredditId = typeof post.subredditId === "string" ? post.subredditId : post.subredditId?._id;
  return JSON.stringify({
    title: post.title,
    content: post.content || "",
    type: post.type,
    subredditId,
    authorId,
    url: post.url || "",
    attachmentIds: post.attachmentIds || [],
    poll: post.poll || null,
  });
}

function legacyCanonicalPostPayload(post: Post) {
  const authorId = typeof post.authorId === "string" ? post.authorId : post.authorId?._id;
  const subredditId = typeof post.subredditId === "string" ? post.subredditId : post.subredditId?._id;
  return JSON.stringify({
    title: post.title,
    content: post.content || "",
    type: post.type,
    subredditId,
    authorId,
  });
}

export async function verifyPostLocally(post: Post) {
  if (!post.authorPublicKey || !post.userSignature) return false;
  const attempts = [canonicalPostPayload(post), legacyCanonicalPostPayload(post)];
  const ok = await attempts.reduce(async (previous, canonical) => {
    if (await previous) return true;
    const hash = await sha256(canonical);
    const hex = Array.from(hash).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (post.contentHash !== hex && post.contentHash !== btoa(String.fromCharCode(...hash))) return false;
    return verifySignature(fromBase64(post.authorPublicKey!), hash, fromBase64(post.userSignature));
  }, Promise.resolve(false));
  if (ok) {
    const authorId = typeof post.authorId === "string" ? post.authorId : post.authorId?._id;
    if (authorId) rememberPublicKey(authorId, post.authorPublicKey);
  }
  return ok;
}
