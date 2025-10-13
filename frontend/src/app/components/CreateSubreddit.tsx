"use client";

import React, { useState } from "react";
import { getToken, getPrivateKey, signHash, toB64, toHex } from "@/lib/auth";
import { sha256 } from "@/lib/crypto";

export default function CreateSubreddit({ onCreated }: { onCreated?: (name: string) => void }) {
  const [step, setStep] = useState(0); // 0: basic, 1: media, 2: theme/review
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [primary, setPrimary] = useState("#053326");
  const [accent, setAccent] = useState("#053326");
  const [background, setBackground] = useState("#ffffff");
  const [foreground, setForeground] = useState("#000000");

  const [iconFile, setIconFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [iconAttachmentId, setIconAttachmentId] = useState<string | null>(null);
  const [bannerAttachmentId, setBannerAttachmentId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function normalizeName(v: string) {
    return v.replace(/[^a-z0-9_\-]/gi, "").toLowerCase();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name || !displayName) {
      setError("Name and display name are required");
      return;
    }

    const payload: any = {
      name: normalizeName(name),
      displayName: displayName.trim(),
      description,
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      theme: {
        primary,
        accent,
        background,
        foreground,
      },
      iconAttachmentId: iconAttachmentId || undefined,
      bannerAttachmentId: bannerAttachmentId || undefined,
    };

    try {
      setLoading(true);

  const token = getToken();
  const authHeader = token ? `Bearer ${token}` : undefined;

      async function uploadFile(file: File, type: string) {
        // compute SHA-256 of the file and sign with user's private key
        const arrayBuf = await file.arrayBuffer();
        const fileHashBuf = await sha256(new Uint8Array(arrayBuf));
        const contentHashHex = toHex(fileHashBuf);
        const priv = getPrivateKey();
        if (!priv) {
          throw new Error(
            "Missing local private key to sign uploads. Please sign in using the same browser where you authenticated so the private key is available."
          );
        }
        const sig = signHash(priv, fileHashBuf);
        const signatureB64 = toB64(sig);

        const meta = {
          originalFilename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          type: type,
          signature: signatureB64,
          contentHash: contentHashHex,
        };

        const presignedRes = await fetch("/api/attachments/presigned-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify(meta),
        });
        if (!presignedRes.ok) throw new Error(await presignedRes.text());
        const presignedBody = await presignedRes.json();
        const uploadUrl = presignedBody.uploadUrl;
        const minioKey = presignedBody.minioKey;

  const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!putRes.ok) throw new Error("Upload failed");

        const confirmRes = await fetch("/api/attachments/confirm-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
          body: JSON.stringify({ key: minioKey, ownerId: undefined }),
        });
        if (!confirmRes.ok) throw new Error(await confirmRes.text());
        const confirmed = await confirmRes.json();
        return confirmed._id || confirmed.id || confirmed?._id || null;
      }

      if (iconFile && !iconAttachmentId) {
        const id = await uploadFile(iconFile, "image");
        setIconAttachmentId(id);
        payload.iconAttachmentId = id;
      }
      if (bannerFile && !bannerAttachmentId) {
        const id = await uploadFile(bannerFile, "image");
        setBannerAttachmentId(id);
        payload.bannerAttachmentId = id;
      }

      const res = await fetch("/api/subreddits", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }

      const data = await res.json();
      if (onCreated) onCreated(data.name || payload.name);
    } catch (err: any) {
      setError(err.message || "Failed to create subreddit");
    } finally {
      setLoading(false);
    }
  }

  function canGoNext() {
    if (step === 0) return !!name && !!displayName;
    return true;
  }

  function nextStep() {
    if (!canGoNext()) return;
    setStep((s) => Math.min(2, s + 1));
  }

  function prevStep() {
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <div className="max-w-3xl mx-auto bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Create a community</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className={`px-3 py-1 rounded ${step === 0 ? "bg-[var(--primary)] text-white" : "bg-[var(--surface)]"}`}>Basic</div>
          <div className={`px-3 py-1 rounded ${step === 1 ? "bg-[var(--primary)] text-white" : "bg-[var(--surface)]"}`}>Media</div>
          <div className={`px-3 py-1 rounded ${step === 2 ? "bg-[var(--primary)] text-white" : "bg-[var(--surface)]"}`}>Theme & Review</div>
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Community name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="communityname" className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
              <p className="text-xs text-[var(--text-secondary)] mt-1">This will be the unique URL name (lowercase, letters/numbers/_-)</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Programming" className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Tags (comma separated)</label>
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="javascript,webdev" className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2" />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Community icon (optional)</label>
              <div
                className="border-dashed border-2 border-[var(--border)] rounded p-4 flex items-center gap-4 cursor-pointer hover:bg-[var(--surface)]"
                onClick={() => {
                  const el = document.getElementById('icon-input') as HTMLInputElement | null
                  el?.click()
                }}
              >
                <input id="icon-input" type="file" accept="image/*" className="hidden" onChange={(e) => setIconFile(e.target.files?.[0] || null)} />
                <div className="w-12 h-12 rounded-full bg-[var(--surface)] flex items-center justify-center border">
                  {iconFile ? (
                    <img src={URL.createObjectURL(iconFile)} alt="icon preview" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 11-2.828-2.828L12.344 4.172" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm">{iconFile ? iconFile.name : 'Click or drop an icon image'}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Square icon recommended (128x128)</div>
                </div>
                {iconFile && (
                  <button type="button" className="text-sm text-red-600" onClick={() => setIconFile(null)}>Remove</button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Banner image (optional)</label>
              <div
                className="border-dashed border-2 border-[var(--border)] rounded p-4 flex items-center gap-4 cursor-pointer hover:bg-[var(--surface)]"
                onClick={() => {
                  const el = document.getElementById('banner-input') as HTMLInputElement | null
                  el?.click()
                }}
              >
                <input id="banner-input" type="file" accept="image/*" className="hidden" onChange={(e) => setBannerFile(e.target.files?.[0] || null)} />
                <div className="w-20 h-12 bg-[var(--surface)] flex items-center justify-center border rounded">
                  {bannerFile ? (
                    <img src={URL.createObjectURL(bannerFile)} alt="banner preview" className="w-full h-full object-cover rounded" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h4l3 6 4-8 3 6h4" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="text-sm">{bannerFile ? bannerFile.name : 'Click or drop a banner image'}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Recommended size: 1200x300</div>
                </div>
                {bannerFile && (
                  <button type="button" className="text-sm text-red-600" onClick={() => setBannerFile(null)}>Remove</button>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="text-sm mb-1">Primary color</div>
                <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} className="w-full h-10 p-0 border rounded" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">Accent color</div>
                <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="w-full h-10 p-0 border rounded" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">Background</div>
                <input type="color" value={background} onChange={(e) => setBackground(e.target.value)} className="w-full h-10 p-0 border rounded" />
              </label>
              <label className="block">
                <div className="text-sm mb-1">Foreground</div>
                <input type="color" value={foreground} onChange={(e) => setForeground(e.target.value)} className="w-full h-10 p-0 border rounded" />
              </label>
            </div>

            <div className="pt-2">
              <h4 className="text-sm font-medium">Review</h4>
              <div className="mt-2 p-3 border rounded bg-[var(--surface)]">
                <div className="font-semibold">r/{normalizeName(name || "communityname")}</div>
                <div className="text-sm text-[var(--text-secondary)]">{displayName}</div>
                <p className="mt-2 text-sm">{description}</p>
                <div className="mt-2 text-xs text-[var(--text-secondary)]">Tags: {tags}</div>
                {iconFile && <div className="mt-2 text-xs">Icon: {iconFile.name}</div>}
                {bannerFile && <div className="mt-2 text-xs">Banner: {bannerFile.name}</div>}
              </div>
            </div>
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div className="flex justify-between">
          <div>
            <button type="button" onClick={prevStep} disabled={step === 0} className="inline-flex items-center px-4 py-2 rounded border">
              Back
            </button>
          </div>
          <div className="flex gap-2">
            {step < 2 && (
              <button type="button" onClick={nextStep} className="inline-flex items-center px-4 py-2 rounded bg-[var(--primary)] text-white">
                Continue
              </button>
            )}
            {step === 2 && (
              <button type="submit" className="inline-flex items-center px-4 py-2 rounded bg-[var(--primary)] text-white hover:opacity-95" disabled={loading}>
                {loading ? "Creating..." : "Create Community"}
              </button>
            )}
          </div>
        </div>
      </form>

      <div className="mt-6">
        <h3 className="text-sm font-medium mb-2">Preview</h3>
        <div className="p-4 rounded" style={{ background: background, color: foreground, border: `1px solid ${accent}` }}>
          <div className="text-xl font-semibold">r/{normalizeName(name || "communityname")}</div>
          <div className="text-sm text-[var(--text-secondary)]">{displayName || "Community display name"}</div>
          <p className="mt-2 text-sm">{description || "Description preview"}</p>
        </div>
      </div>
    </div>
  );
}
