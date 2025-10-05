"use client";

import React, { useEffect, useState } from "react";
import styles from "./auth.module.css";
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
      // Save token (don't display it) and redirect
      saveToken(jwt);
      setMessage("Authentication successful");
      setTimeout(() => (window.location.href = "/"), 600);
    } catch (err: unknown) {
      setMessage(`Authentication failed: ${(err as Error).message}`);
    } finally {
      setAutoSigning(false);
    }
  }

  return (
    <div className={styles.pageWrap}>
      <div className={styles.card}>
        <header className={styles.header}>
          <h1 className={styles.title}>Sign in</h1>
        </header>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            signAndAuthenticate();
          }}
        >
          <div className={styles.tabs}>
            <button type="button" className={`${styles.tabBtn} ${isNewUser ? styles.selected : ""}`} onClick={() => setIsNewUser(true)}>New user</button>
            <button type="button" className={`${styles.tabBtn} ${!isNewUser ? styles.selected : ""}`} onClick={handleReturningUserOpen}>Returning user</button>
          </div>

          <label className={styles.label}>Passphrase (optional)</label>
          <input type="password" className={styles.textarea} value={passphrase} onChange={(e) => setPassphrase(e.target.value)} placeholder="Optional passphrase" />

          <label className={styles.label}>Mnemonic (BIP39)</label>
          <textarea
            className={styles.textarea}
            value={mnemonic}
            onChange={(e) => setMnemonic(e.target.value)}
            readOnly={isNewUser}
            rows={4}
            placeholder={isNewUser ? "Will be generated for new users" : "Paste or type your mnemonic here"}
            autoFocus={!isNewUser}
          />

          <div style={{ marginTop: 8, fontSize: 13, color: mnemonicError ? "#b00020" : "#666" }}>
            <span>{mnemonic ? `${mnemonic.trim().split(/\s+/).filter(Boolean).length} words` : ""}</span>
            {mnemonicError && <div style={{ marginTop: 6 }}>{mnemonicError}</div>}
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            {isNewUser ? (
              !mnemonic ? (
                <button type="button" className={styles.submit} onClick={generateMnemonic}>Generate</button>
              ) : !copied ? (
                <button type="button" className={styles.submit} onClick={copyMnemonic} disabled={isBackingUp}>Copy</button>
              ) : (
                <button type="submit" className={styles.submit} disabled={autoSigning}>{autoSigning ? "Signing..." : "Authenticate"}</button>
              )
            ) : (
              <button type="submit" className={styles.submit} disabled={!mnemonic || !!mnemonicError || autoSigning}>{autoSigning ? "Signing..." : "Authenticate"}</button>
            )}
          </div>

          {message && <div className={styles.message}>{message}</div>}
        </form>
      </div>
    </div>
  );
}
