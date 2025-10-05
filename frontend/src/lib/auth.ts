import * as bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as tinySecp from "tiny-secp256k1";
import { toBase64 } from "./crypto";
import { sha256 as webSha256, sha256 } from "./crypto";

const bip32 = BIP32Factory(tinySecp);

export type KeyPair = { privateKey: Uint8Array; publicKey: Uint8Array };

export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  return atob(base64);
}

export function toB64(u8: Uint8Array): string {
  return toBase64(u8);
}

export function deriveBip32Keypair(mnemonic: string, passphrase = ""): KeyPair {
  // Use bip39 to derive seed and bip32 to derive hardened path
  const seed = bip39.mnemonicToSeedSync(mnemonic, passphrase);
  const root = bip32.fromSeed(seed);
  // match smoke test path
  const leaf = root.derivePath("m/44'/0'/0'/0'/0'");
  if (!leaf.privateKey)
    throw new Error("BIP32 derivation failed to produce a private key");
  const privateKey = leaf.privateKey as Uint8Array;
  const publicKey = leaf.publicKey as Uint8Array;
  // zero seed
  if (seed && typeof (seed as any).fill === "function") (seed as any).fill(0);
  return { privateKey, publicKey };
}

export async function signChallenge(
  privateKey: Uint8Array,
  challenge: string
): Promise<Uint8Array> {
  // hash using Web Crypto via crypto.subtle
  const enc = new TextEncoder().encode(challenge);
  const digestBuf = await crypto.subtle.digest("SHA-256", enc.buffer);
  const hash = new Uint8Array(digestBuf);
  // tiny-secp256k1 expects Buffer/Uint8Array
  const sig = tinySecp.sign(hash, privateKey);
  if (!sig) throw new Error("Failed to sign");
  return sig;
}

// Storage helpers
const TOKEN_KEY = "auth:token";
const PUB_KEY = "auth:pub";
const PRIV_KEY = "auth:priv"; // stored in sessionStorage for slight safety

export function saveKeys(privateKey: Uint8Array, publicKey: Uint8Array) {
  try {
    sessionStorage.setItem(PRIV_KEY, toB64(privateKey));
    localStorage.setItem(PUB_KEY, toB64(publicKey));
  } catch (e) {
    // ignore storage errors
  }
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (e) {}
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export function clearCredentials() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PUB_KEY);
    sessionStorage.removeItem(PRIV_KEY);
  } catch (e) {}
}
