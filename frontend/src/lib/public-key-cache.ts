import { BloomFilter } from "@/lib/bloom";

const FILTER_KEY = "jb-public-key-bloom";
const CACHE_KEY = "jb-public-key-cache";

export function rememberPublicKey(userId: string, publicKey?: string) {
  if (!userId || !publicKey || typeof window === "undefined") return;
  const filter = new BloomFilter(4096, 4, window.localStorage.getItem(FILTER_KEY) || undefined);
  filter.add(userId);
  window.localStorage.setItem(FILTER_KEY, filter.encode());
  const cache = readCache();
  cache[userId] = publicKey;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function getCachedPublicKey(userId: string) {
  if (!userId || typeof window === "undefined") return null;
  const filter = new BloomFilter(4096, 4, window.localStorage.getItem(FILTER_KEY) || undefined);
  if (!filter.has(userId)) return null;
  return readCache()[userId] || null;
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}
