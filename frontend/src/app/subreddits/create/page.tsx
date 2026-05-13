"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { backendJson } from "@/lib/backend";
import { useAuth } from "@/lib/context/AuthContext";
import { Check, ChevronLeft, Globe2, Lock, Shield, X } from "lucide-react";

const topics = [
  "Anime & Cosplay",
  "Art",
  "Business & Finance",
  "Collectibles & Hobbies",
  "Education & Career",
  "Fashion & Beauty",
  "Food & Drinks",
  "Games",
  "Health",
  "Home & Garden",
  "Humanities & Law",
  "Identity & Relationships",
  "Internet Culture",
  "Movies & TV",
  "Music",
  "Nature & Outdoors",
  "News & Politics",
  "Places & Travel",
  "Pop Culture",
  "Q&As & Stories",
  "Reading & Writing",
  "Science",
  "Sports",
  "Technology",
  "Vehicles",
  "Wellness",
  "Mature Topics",
];

type CommunityType = "public" | "restricted" | "private";

export default function CreateSubredditPage() {
  const router = useRouter();
  const { isAuthenticated, logout } = useAuth();
  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState("Q&As & Stories");
  const [communityType, setCommunityType] = useState<CommunityType>("public");
  const [isNsfw, setIsNsfw] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("Respect others and be civil\nNo spam");
  const [primary, setPrimary] = useState("#ffb000");
  const [requirePostApproval, setRequirePostApproval] = useState(false);
  const [allowImages, setAllowImages] = useState(true);
  const [allowVideos, setAllowVideos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);

  const normalizedName = name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 21);
  const nameError = name && name !== normalizedName ? "Only lowercase letters, numbers, and underscores are allowed" : "";
  const canContinue = step === 0 ? !!topic : step === 1 ? !!communityType : normalizedName.length >= 3 && description.trim().length >= 8 && !nameError;

  const previewRules = useMemo(() => rules.split("\n").map((rule) => rule.trim()).filter(Boolean), [rules]);

  async function createCommunity() {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await backendJson("POST", "/subreddits", {
        name: normalizedName,
        displayName: normalizedName,
        description: description.trim(),
        rules,
        tags: [topic],
        isPrivate: communityType === "private",
        isNsfw,
        theme: {
          primary,
          accent: primary,
          background: "#1f1400",
          foreground: "#ffffff",
        },
        settings: {
          allowTextPosts: true,
          allowLinkPosts: true,
          allowImagePosts: allowImages,
          allowVideoPosts: allowVideos,
          allowCrossposts: true,
          requirePostApproval: requirePostApproval || communityType === "restricted",
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 401) {
          await logout();
          throw new Error("Your session expired. Please log in again before creating a community.");
        }
        throw new Error(errorData.message || "Failed to create community.");
      }

      setCreatedName(normalizedName);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-48px)] bg-[var(--background)] px-4 py-10">
      <div className="mx-auto max-w-3xl rounded-2xl bg-[var(--card)] shadow-2xl">
        <div className="flex items-start justify-between border-b border-[var(--border)] px-5 py-4">
          <div>
            <h1 className="text-2xl font-bold">
              {step === 0 && "What will your community be about?"}
              {step === 1 && "What kind of community is this?"}
              {step === 2 && "Tell us about your community"}
              {step === 3 && "You launched a new community!"}
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {step === 0 && "Choose a topic to help people discover your community."}
              {step === 1 && "Decide who can view and contribute to your community."}
              {step === 2 && "A name, rules, and description help people understand what this community is about."}
              {step === 3 && "Your community is ready. Finish setup from the mod tools when you need deeper controls."}
            </p>
          </div>
          <button onClick={() => router.back()} className="rounded-full bg-[var(--muted)] p-2 hover:bg-[var(--border)]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-[420px] px-5 py-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
              {error.includes("session expired") && (
                <Link href="/auth" className="ml-2 font-semibold underline">
                  Log in
                </Link>
              )}
            </div>
          )}

          {step === 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {topics.map((item) => (
                <button
                  key={item}
                  onClick={() => setTopic(item)}
                  className={`flex min-h-12 items-center justify-center gap-2 rounded-lg border px-3 text-center text-xs font-semibold ${topic === item ? "border-[var(--primary)] bg-[var(--muted)]" : "border-[var(--border)] hover:bg-[var(--muted)]"}`}
                >
                  {topic === item && <Check size={15} />}
                  {item}
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <TypeOption value="public" selected={communityType} onSelect={setCommunityType} icon={Globe2} title="Public" description="Anyone can view, post, and comment." />
              <TypeOption value="restricted" selected={communityType} onSelect={setCommunityType} icon={Shield} title="Restricted" description="Anyone can view, but posts can require approval." />
              <TypeOption value="private" selected={communityType} onSelect={setCommunityType} icon={Lock} title="Private" description="Only approved users can view and contribute." />
              <label className="mt-8 flex items-center justify-between border-t border-[var(--border)] pt-6">
                <span>
                  <span className="block font-medium">Mature (18+)</span>
                  <span className="text-sm text-[var(--text-secondary)]">Mark this community as NSFW.</span>
                </span>
                <input type="checkbox" checked={isNsfw} onChange={(event) => setIsNsfw(event.target.checked)} className="h-5 w-5" />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Community name *</span>
                  <div className={`mt-1 rounded-2xl border px-4 py-3 ${nameError ? "border-red-500" : "border-[var(--border)]"}`}>
                    <span className="text-[var(--text-secondary)]">r/</span>
                    <input value={name} onChange={(event) => setName(event.target.value)} className="bg-transparent outline-none" maxLength={21} placeholder="community_name" />
                  </div>
                  <div className={`mt-1 text-xs ${nameError ? "text-red-500" : "text-[var(--text-secondary)]"}`}>{nameError || `${normalizedName.length}/21`}</div>
                </label>

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Description *</span>
                  <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} className="mt-1 w-full resize-none rounded-2xl border border-[var(--border)] bg-transparent p-4 outline-none focus:border-[var(--primary)]" placeholder="What should members know before joining?" />
                </label>

                <label className="block">
                  <span className="text-xs text-[var(--text-secondary)]">Rules</span>
                  <textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={4} className="mt-1 w-full resize-none rounded-2xl border border-[var(--border)] bg-transparent p-4 outline-none focus:border-[var(--primary)]" />
                </label>

                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm"><input type="checkbox" checked={allowImages} onChange={(e) => setAllowImages(e.target.checked)} /> Allow images</label>
                  <label className="text-sm"><input type="checkbox" checked={allowVideos} onChange={(e) => setAllowVideos(e.target.checked)} /> Allow videos</label>
                  <label className="text-sm"><input type="checkbox" checked={requirePostApproval} onChange={(e) => setRequirePostApproval(e.target.checked)} /> Require approval</label>
                </div>
              </div>

                <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] shadow-lg">
                <div style={{ background: primary }} className="h-24" />
                <div className="p-4">
                  <div className="-mt-10 mb-3 grid h-14 w-14 place-items-center rounded-full border-4 border-[var(--background)] bg-[var(--card)] text-xl font-bold text-[var(--primary)]">r/</div>
                  <h2 className="text-lg font-bold">r/{normalizedName || "community"}</h2>
                  <p className="text-xs text-[var(--text-secondary)]">1 weekly visitor · 1 weekly contributor</p>
                  <p className="mt-4 text-sm">{description || "Your description preview appears here."}</p>
                  {previewRules.length > 0 && (
                    <ol className="mt-4 space-y-1 text-xs text-[var(--text-secondary)]">
                      {previewRules.slice(0, 3).map((rule, index) => <li key={rule}>{index + 1}. {rule}</li>)}
                    </ol>
                  )}
                  <label className="mt-5 flex items-center gap-3 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold">
                    Base Color
                    <input type="color" value={primary} onChange={(event) => setPrimary(event.target.value)} className="h-6 w-8 bg-transparent" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 3 && createdName && (
            <div className="grid gap-8 py-8 lg:grid-cols-[1fr_320px]">
              <div>
                <h2 className="text-2xl font-bold">You launched r/{createdName}</h2>
                <p className="mt-6 font-semibold">Here&apos;s what you should know</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">We applied your topic, privacy, rules, content settings, and theme color. You can tune all of it in mod tools.</p>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Link href={`/r/${createdName}/settings`} className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-semibold">Rules</Link>
                  <Link href={`/r/${createdName}/mod/settings`} className="rounded-lg border border-[var(--border)] px-4 py-3 text-sm font-semibold">Look and Feel</Link>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                <div style={{ background: primary }} className="mb-4 h-24 rounded-xl" />
                <h3 className="text-xl font-bold">r/{createdName}</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border)] px-5 py-4">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((item) => <span key={item} className={`h-2 w-2 rounded-full ${item === step ? "bg-[var(--foreground)]" : "bg-[var(--border)]"}`} />)}
          </div>
          <div className="flex gap-2">
            {step > 0 && step < 3 && <button onClick={() => setStep((value) => value - 1)} className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-5 py-2 font-semibold"><ChevronLeft size={16} /> Back</button>}
            {step < 2 && <button disabled={!canContinue} onClick={() => setStep((value) => value + 1)} className="rounded-full bg-[var(--primary)] px-5 py-2 font-semibold text-white disabled:opacity-50">Next</button>}
            {step === 2 && <button disabled={!canContinue || loading} onClick={createCommunity} className="rounded-full bg-[var(--primary)] px-5 py-2 font-semibold text-white disabled:opacity-50">{loading ? "Creating..." : "Create Community"}</button>}
            {step === 3 && createdName && <Link href={`/r/${createdName}`} className="rounded-full bg-[var(--primary)] px-5 py-2 font-semibold text-white">Go To Community Page</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}

function TypeOption({
  value,
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
}: {
  value: CommunityType;
  selected: CommunityType;
  onSelect: (value: CommunityType) => void;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <button onClick={() => onSelect(value)} className={`flex w-full items-center justify-between rounded-lg px-5 py-4 text-left ${selected === value ? "bg-[var(--muted)]" : "hover:bg-[var(--muted)]"}`}>
      <span className="flex items-center gap-4">
        <Icon size={20} />
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="text-sm text-[var(--text-secondary)]">{description}</span>
        </span>
      </span>
      <span className={`grid h-4 w-4 place-items-center rounded-full border ${selected === value ? "border-[var(--foreground)]" : "border-[var(--text-secondary)]"}`}>
        {selected === value && <span className="h-2 w-2 rounded-full bg-[var(--foreground)]" />}
      </span>
    </button>
  );
}
