"use client";

import React, { useEffect, useState } from "react";
import {
  deriveBip32Keypair,
  signChallenge,
  base64UrlDecode,
  toB64,
  saveKeys,
  saveToken,
  getToken,
} from "../../lib/auth";
import * as bip39 from 'bip39';
import Image from 'next/image';

export default function AuthPage() {
  const [challenge, setChallenge] = useState<string>("");
  const [mnemonic, setMnemonic] = useState<string>("");
  const [passphrase, setPassphrase] = useState<string>("");
  const [mnemonicError, setMnemonicError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(true);
  const [autoSigning, setAutoSigning] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Redirect to home if already authenticated
  useEffect(() => {
    const existing = getToken();
    if (existing) {
      window.location.href = "/";
      return;
    }
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:3000";
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/challenge`);
        if (!res.ok) throw new Error(await res.text());
        const jwt = await res.text();
        setChallenge(jwt);
      } catch (err: unknown) {
        setMessage(`Failed to fetch challenge: ${(err as Error).message}`);
      }
    })();
  }, []);

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

      // Sign the challenge (uses Web Crypto inside helper)
      const signature = await signChallenge(privateKey, challengeStr);
      if (!signature) throw new Error("Failed to sign message");

      // Send authentication request
      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:3000";
      const res = await fetch(`${apiUrl}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge,
          signedData: toB64(signature),
          publicKey: toB64(publicKey),
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const jwt = await res.text();
      // Save token, publicKey, and privateKey to localStorage
      saveToken(jwt);
      try {
        localStorage.setItem("auth:publicKey", toB64(publicKey));
        localStorage.setItem("auth:privateKey", toB64(privateKey));
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
