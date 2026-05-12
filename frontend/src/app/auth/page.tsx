"use client";

import React, { useEffect, useState } from "react";
import {
  deriveBip32Keypair,
  signChallenge,
  solveChallenge,
  base64UrlDecode,
  toB64,
  saveKeys,
  saveToken,
  getToken,
} from "../../lib/auth";
import { authenticate, getChallenge } from "@/lib/api";
import * as bip39 from 'bip39';
import Image from 'next/image';
import { Server } from "lucide-react";

export default function AuthPage() {
  const [challenge, setChallenge] = useState<string>("");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [passphrase, setPassphrase] = useState<string>("");
  const [mcaptchaToken, setMcaptchaToken] = useState<string | null>(null);
  const [mcaptchaError, setMcaptchaError] = useState<string | null>(null);
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(true);
  const [autoSigning, setAutoSigning] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [homeserver, setHomeserver] = useState("http://localhost:6000");
  const mcaptchaUrl = process.env.NEXT_PUBLIC_MCAPTCHA_URL?.replace(/\/$/, "") || "http://localhost:7000";
  const mcaptchaSiteKey = process.env.NEXT_PUBLIC_MCAPTCHA_SITEKEY || "";

  // Redirect to home if already authenticated
  useEffect(() => {
    const existing = getToken();
    if (existing) {
      window.location.href = "/";
      return;
    }
    const storedHomeserver = window.localStorage.getItem("jb-homeserver") || homeserver;
    setHomeserver(storedHomeserver);
    window.localStorage.setItem("jb-homeserver", storedHomeserver);
    (async () => {
      try {
        setChallenge(await getChallenge());
      } catch (err: unknown) {
        setMessage(`Failed to fetch challenge: ${(err as Error).message}`);
      }
    })();
  }, []);

  async function refreshChallengeForHomeserver(nextHomeserver: string) {
    const normalized = nextHomeserver.trim().replace(/\/$/, "");
    setHomeserver(normalized);
    window.localStorage.setItem("jb-homeserver", normalized);
    setMessage("Loading challenge from selected homeserver...");
    try {
      setChallenge(await getChallenge());
      setMessage("Homeserver selected.");
    } catch (err: unknown) {
      setMessage(`Selected homeserver is unreachable: ${(err as Error).message}`);
    }
  }

  useEffect(() => {
    if (!mcaptchaSiteKey) return;

    const onMessage = (event: MessageEvent) => {
      try {
        const expectedOrigin = new URL(mcaptchaUrl).origin;
        if (event.origin !== expectedOrigin) return;

        const data = event.data as { token?: string } | null;
        if (data && typeof data.token === "string" && data.token.length > 0) {
          setMcaptchaToken(data.token);
          setMcaptchaError(null);
        }
      } catch (e) {
        // ignore malformed messages
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mcaptchaSiteKey, mcaptchaUrl]);

  // validate mnemonic whenever it changes
  useEffect(() => {
    if (!mnemonic) {
      setMnemonicError(null);
      return;
    }
    const cleaned = mnemonic.trim().toLowerCase();
    const valid = bip39.validateMnemonic(cleaned);
    if (!valid) {
      setMnemonicError("Invalid mnemonic — check word list and order");
    } else {
      setMnemonicError(null);
    }
  }, [mnemonic]);

  function generateMnemonic() {
    const m = bip39.generateMnemonic(256);
    setMnemonic(m);
    setCopied(false);
    setMessage("Mnemonic generated. Please copy and store it securely.");
  }

  // When user switches to returning-user tab, try to detect mnemonic in clipboard
  async function handleReturningUserOpen() {
    setIsNewUser(false);
    try {
      if (!navigator?.clipboard?.readText) return;
      const text = (await navigator.clipboard.readText()) || "";
      const cleaned = text.trim().toLowerCase();
      if (!cleaned) return;
      if (bip39.validateMnemonic(cleaned)) {
        setMnemonic(cleaned);
        setMessage("Mnemonic detected from clipboard — pasted for you.");
      }
    } catch (err) {
      // ignore clipboard errors silently (permission denied, etc.)
    }
  }

  function downloadMnemonic() {
    const blob = new Blob([mnemonic], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mnemonic.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyMnemonic() {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setMessage("Mnemonic copied to clipboard. You can now authenticate.");
    } catch (err) {
      setMessage(`Copy failed: ${(err as Error).message}`);
    }
  }

  async function signAndAuthenticate() {
    if (!mnemonic || !challenge) return;
    if (mcaptchaSiteKey && !mcaptchaToken) {
      setMcaptchaError("Please complete the mCaptcha challenge first.");
      return;
    }
    setAutoSigning(true);
    setMessage("Signing challenge...");

    try {
      // Derive a BIP32 keypair and save keys
      const { privateKey, publicKey } = deriveBip32Keypair(mnemonic, passphrase);
      saveKeys(privateKey, publicKey);

      // Decode JWT payload to get challenge string
      const parts = challenge.split(".");
      if (parts.length !== 3) throw new Error("Invalid JWT format");
      const payload = JSON.parse(base64UrlDecode(parts[1]));
      const challengeStr = payload.challenge;
      const difficulty = payload.difficulty || 3;

      // Solve Proof of Work
      setMessage("Solving Proof of Work Challenge...");
      // Wrap in small timeout to allow UI update
      await new Promise((r) => setTimeout(r, 50));
      const nonce = solveChallenge(challengeStr, difficulty);

      // Sign the challenge (uses Web Crypto inside helper)
      const signature = await signChallenge(privateKey, challengeStr);
      if (!signature) throw new Error("Failed to sign message");

      setMessage("Authenticating with Server...");

      // Send authentication request
      const jwt = await authenticate(
        challenge,
        nonce,
        toB64(signature),
        toB64(publicKey),
        mcaptchaToken || undefined,
      );
      // Save token, publicKey, and privateKey to localStorage
      saveToken(jwt);
      try {
        localStorage.setItem("auth:publicKey", toB64(publicKey));
      } catch (e) {
        // ignore storage errors
      }
      setMessage("Authentication successful");
      // replay intended actions (vote/comment) if any
      try {
        const backend = await import('@/lib/backend')
        const intendedVote = localStorage.getItem('intended:vote')
        if (intendedVote) {
          try {
            const v = JSON.parse(intendedVote)
            await backend.backendJson('POST', `/votes`, v)
            localStorage.removeItem('intended:vote')
          } catch (e) {}
        }
        const intendedComment = localStorage.getItem('intended:comment')
        if (intendedComment) {
          try {
            const c = JSON.parse(intendedComment)
            await backend.backendJson('POST', `/comments`, c)
            localStorage.removeItem('intended:comment')
          } catch (e) {}
        }
      } catch (e) {}
      setTimeout(() => (window.location.href = "/"), 600);
    } catch (err: unknown) {
      setMessage(`Authentication failed: ${(err as Error).message}`);
    } finally {
      setAutoSigning(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-center mb-6">
            <div className="w-12 h-12 relative">
              <Image src="/jagoo-bahee.svg" alt="Jagoo Bahee" fill sizes="48px" />
            </div>
            <h1 className="text-2xl font-bold ml-3">Jagoo Bahee</h1>
          </div>
          
          <form
            onSubmit={(e) => {
              e.preventDefault();
              signAndAuthenticate();
            }}
          >
            <div className="flex bg-[var(--muted)] rounded-lg p-1 mb-6">
              <button 
                type="button" 
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  isNewUser 
                    ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm" 
                    : "text-[var(--text-secondary)] hover:text-[var(--foreground)]"
                }`} 
                onClick={() => setIsNewUser(true)}
              >
                New User
              </button>
              <button 
                type="button" 
                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                  !isNewUser 
                    ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm" 
                    : "text-[var(--text-secondary)] hover:text-[var(--foreground)]"
                }`} 
                onClick={handleReturningUserOpen}
              >
                Returning User
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
                  <Server size={16} />
                  Homeserver
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
                    value={homeserver}
                    onChange={(event) => setHomeserver(event.target.value)}
                    placeholder="https://your-instance.example"
                  />
                  <button
                    type="button"
                    onClick={() => refreshChallengeForHomeserver(homeserver)}
                    className="rounded-md border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:bg-[var(--muted)]"
                  >
                    Use
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Your identity signs into the server you choose here.
                </p>
              </div>

              {mcaptchaSiteKey && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-[var(--foreground)]">
                    mCaptcha verification
                  </label>
                  <div className="rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--background)]">
                    <iframe
                      title="mCaptcha verification"
                      src={`${mcaptchaUrl}/widget/?sitekey=${encodeURIComponent(mcaptchaSiteKey)}`}
                      className="w-full"
                      style={{ minHeight: 100 }}
                      sandbox="allow-same-origin allow-scripts allow-forms"
                    />
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Solve the challenge in the embedded widget to continue.
                  </p>
                  {mcaptchaError && <p className="text-sm text-[var(--error)]">{mcaptchaError}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Passphrase (optional)
                </label>
                <input 
                  type="password" 
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent" 
                  value={passphrase} 
                  onChange={(e) => setPassphrase(e.target.value)} 
                  placeholder="Optional passphrase for additional security" 
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-2">
                  Mnemonic (BIP39)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none"
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  readOnly={isNewUser}
                  rows={4}
                  placeholder={isNewUser ? "Will be generated for new users" : "Paste or type your 24-word mnemonic here"}
                  autoFocus={!isNewUser}
                />
                <div className="mt-2 text-sm">
                  {mnemonic && (
                    <span className={`${mnemonicError ? "text-[var(--error)]" : "text-[var(--text-secondary)]"}`}>
                      {mnemonic.trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  )}
                  {mnemonicError && (
                    <div className="text-[var(--error)] mt-1">{mnemonicError}</div>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                {isNewUser ? (
                  !mnemonic ? (
                    <button 
                      type="button" 
                      className="flex-1 bg-[var(--primary)] text-white py-2 px-4 rounded-md font-medium hover:opacity-90 transition-opacity" 
                      onClick={generateMnemonic}
                    >
                      Generate Mnemonic
                    </button>
                  ) : !copied ? (
                    <button 
                      type="button" 
                      className="flex-1 bg-[var(--secondary)] text-[var(--foreground)] py-2 px-4 rounded-md font-medium hover:opacity-90 transition-opacity" 
                      onClick={copyMnemonic} 
                      disabled={isBackingUp}
                    >
                      Copy Mnemonic
                    </button>
                  ) : (
                    <button 
                      type="submit" 
                      className="flex-1 bg-[var(--primary)] text-white py-2 px-4 rounded-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50" 
                      disabled={autoSigning}
                    >
                      {autoSigning ? "Signing..." : "Authenticate"}
                    </button>
                  )
                ) : (
                  <button 
                    type="submit" 
                    className="flex-1 bg-[var(--primary)] text-white py-2 px-4 rounded-md font-medium hover:opacity-90 transition-opacity disabled:opacity-50" 
                    disabled={!mnemonic || !!mnemonicError || autoSigning}
                  >
                    {autoSigning ? "Signing..." : "Authenticate"}
                  </button>
                )}
              </div>

              {message && (
                <div className={`p-3 rounded-md text-sm ${
                  message.includes("successful") || message.includes("detected") 
                    ? "bg-[var(--success)]/10 text-[var(--success)] border border-[var(--success)]/20" 
                    : message.includes("failed") || message.includes("Invalid")
                    ? "bg-[var(--error)]/10 text-[var(--error)] border border-[var(--error)]/20"
                    : "bg-[var(--info)]/10 text-[var(--info)] border border-[var(--info)]/20"
                }`}>
                  {message}
                </div>
              )}
            </div>
          </form>
        </div>
        
        <div className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          <p>🔐 Your private keys are stored locally and never sent to our servers</p>
          <p className="mt-1">⚠️ Keep your mnemonic safe - we cannot recover lost accounts</p>
        </div>
      </div>
    </div>
  );
}
