"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, ExternalLink, KeyRound, Server, ShieldCheck } from "lucide-react";
import backend from "@/lib/backend";
import { getPublicKey } from "@/lib/auth";
import { applyTheme, displayModes, readThemePreference, themeFamilies, writeThemePreference, type DisplayMode, type ThemeFamily } from "@/components/theme-toggle";

type SettingsTab = "account" | "profile" | "privacy" | "preferences" | "notifications" | "email";

const tabs: { id: SettingsTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "profile", label: "Profile" },
  { id: "privacy", label: "Privacy" },
  { id: "preferences", label: "Preferences" },
  { id: "notifications", label: "Notifications" },
  { id: "email", label: "Email" },
];

export default function UserSettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>("account");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [themeFamily, setThemeFamily] = useState<ThemeFamily>("default");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("system");
  const [homeserver, setHomeserver] = useState("http://localhost:6000");
  const [toggles, setToggles] = useState({
    matureProfile: false,
    showNsfw: false,
    recommendations: true,
    autoplay: true,
    reduceMotion: false,
    push: false,
    emailDigest: true,
    twoFactor: false,
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await backend.backendFetch("/users/me/profile");
        if (res.status === 401) {
          router.push("/auth");
          return;
        }
        if (res.ok) {
          const data = await res.json();
          setUsername(data.username || "");
          setBio(data.bio || "");
          setAvatarUrl(data.avatarUrl || "");
        }
        const storedTheme = readThemePreference();
        setThemeFamily(storedTheme.family);
        setDisplayMode(storedTheme.mode);
        setHomeserver(window.localStorage.getItem("jb-homeserver") || "http://localhost:6000");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [router]);

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await backend.backendJson("PATCH", "/users/me/profile", {
        username,
        bio,
        avatarUrl,
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(String(errData.message || "Failed to save"));
      }
      setSuccess("Settings saved.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function saveLocalPreference(nextFamily = themeFamily, nextMode = displayMode, nextHomeserver = homeserver) {
    writeThemePreference(nextFamily, nextMode);
    window.localStorage.setItem("jb-homeserver", nextHomeserver.trim().replace(/\/$/, ""));
    applyTheme(nextFamily, nextMode);
    setSuccess("Preferences saved.");
  }

  if (loading) return <div className="p-8 text-center text-[var(--text-secondary)]">Loading settings...</div>;

  const pubKey = getPublicKey();

  return (
    <div className="mx-auto w-full max-w-[1040px] px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-[var(--text-secondary)]">Settings</h1>

      <div className="mb-6 flex flex-wrap gap-5 border-b border-transparent">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 text-sm ${activeTab === tab.id ? "border-b-2 border-[var(--foreground)] text-[var(--foreground)]" : "text-[var(--text-secondary)]"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">{error}</div>}
      {success && <div className="mb-4 rounded-lg border border-green-500/20 bg-green-500/10 p-3 text-sm text-green-500">{success}</div>}

      <div className="max-w-[1040px]">
        {activeTab === "account" && (
          <SettingsSection title="General">
            <SettingRow label="Email address" value="Managed by your account provider" />
            <SettingRow label="Password" />
            <SettingRow label="Gender" />
            <SettingRow label="Location customization" value="Use approximate location based on IP" />
            <SettingsHeading>Account authorization</SettingsHeading>
            <SettingRow label="Google" description="Connect to log in with your Google account" action="Connect" />
            <SettingRow label="Apple" description="Connect to log in with your Apple account" action="Connect" />
            <ToggleRow label="Two-factor authentication" checked={toggles.twoFactor} onChange={() => setToggles((v) => ({ ...v, twoFactor: !v.twoFactor }))} />
            <SettingsHeading>Apps</SettingsHeading>
            <SettingRow label="App settings" value="0" />
            <SettingLink href="/admin" label="Learn about Developer Platform" icon={<ExternalLink size={17} />} />
            {pubKey && (
              <div className="mt-6 rounded-lg bg-[var(--muted)] p-4 text-xs text-[var(--text-secondary)]">
                <div className="mb-2 flex items-center gap-2 font-semibold text-[var(--foreground)]">
                  <KeyRound size={16} />
                  Public key
                </div>
                <div className="break-all">{pubKey}</div>
              </div>
            )}
          </SettingsSection>
        )}

        {activeTab === "profile" && (
          <SettingsSection title="General">
            <EditableRow label="Display name" value={username} onChange={setUsername} maxLength={30} />
            <EditableRow label="About description" value={bio} onChange={setBio} multiline maxLength={500} />
            <EditableRow label="Avatar" value={avatarUrl} onChange={setAvatarUrl} placeholder="Image URL" />
            <SettingRow label="Banner" description="Upload a profile background image" />
            <SettingRow label="Social links" />
            <ToggleRow label="Mark as mature (18+)" description="Label your profile as Not Safe for Work" checked={toggles.matureProfile} onChange={() => setToggles((v) => ({ ...v, matureProfile: !v.matureProfile }))} />
            <SettingsHeading>Curate your profile</SettingsHeading>
            <SettingRow label="Content and activity" value="Show all" description="Posts, comments, and communities you are active in" />
            <ToggleRow label="NSFW" description="Show all NSFW posts and comments" checked={toggles.showNsfw} onChange={() => setToggles((v) => ({ ...v, showNsfw: !v.showNsfw }))} />
            <div className="mt-6 flex justify-end">
              <button onClick={saveProfile} disabled={saving} className="rounded-full bg-[var(--primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? "Saving..." : "Save profile"}
              </button>
            </div>
          </SettingsSection>
        )}

        {activeTab === "privacy" && (
          <SettingsSection title="Privacy & Discovery">
            <div className="mb-6 rounded-xl bg-[var(--muted)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              Making a temporary change because of increased activity? <Link href="/admin" className="underline">Set up a temporary event</Link>.
            </div>
            <SettingRow label="Community type" value="Public" description="Who can view and contribute to your account activity" />
            <ToggleRow label="Appear in Reddit feeds" description="Allow your public posts to appear in feeds and search results" checked={toggles.recommendations} onChange={() => setToggles((v) => ({ ...v, recommendations: !v.recommendations }))} />
            <ToggleRow label="Appear in recommendations" description="Recommend your profile to people with similar interests" checked={toggles.recommendations} onChange={() => setToggles((v) => ({ ...v, recommendations: !v.recommendations }))} />
          </SettingsSection>
        )}

        {activeTab === "preferences" && (
          <SettingsSection title="Language">
            <SettingRow label="Display language" value="English (US)" />
            <SettingRow label="Content languages" value="0" description="Content in the listed languages will not be translated" />
            <SettingsHeading>Content</SettingsHeading>
            <ToggleRow label="Show mature content (I'm over 18)" description="See mature content in your feeds and search results" checked={toggles.showNsfw} onChange={() => setToggles((v) => ({ ...v, showNsfw: !v.showNsfw }))} />
            <ToggleRow label="Show recommendations in home feed" checked={toggles.recommendations} onChange={() => setToggles((v) => ({ ...v, recommendations: !v.recommendations }))} />
            <SettingRow label="Muted communities" />
            <SettingsHeading>Accessibility</SettingsHeading>
            <ToggleRow label="Autoplay media" checked={toggles.autoplay} onChange={() => setToggles((v) => ({ ...v, autoplay: !v.autoplay }))} />
            <ToggleRow label="Reduce Motion" checked={toggles.reduceMotion} onChange={() => setToggles((v) => ({ ...v, reduceMotion: !v.reduceMotion }))} />
            <SettingsHeading>Experience</SettingsHeading>
            <div className="grid gap-3 py-3 lg:grid-cols-3">
              <label className="grid gap-1 text-sm">
                Select theme
                <select
                  value={themeFamily}
                  onChange={(event) => {
                    const nextFamily = event.target.value as ThemeFamily;
                    setThemeFamily(nextFamily);
                    saveLocalPreference(nextFamily, displayMode, homeserver);
                  }}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                >
                  {themeFamilies.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Auto / dark / light
                <select
                  value={displayMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as DisplayMode;
                    setDisplayMode(nextMode);
                    saveLocalPreference(themeFamily, nextMode, homeserver);
                  }}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                >
                  {displayModes.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="flex items-center gap-2"><Server size={16} /> Homeserver</span>
                <input
                  value={homeserver}
                  onChange={(event) => setHomeserver(event.target.value)}
                  onBlur={() => saveLocalPreference(themeFamily, displayMode, homeserver)}
                  className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2"
                />
              </label>
            </div>
          </SettingsSection>
        )}

        {activeTab === "notifications" && (
          <SettingsSection title="General">
            <SettingRow label="Community notifications" />
            <ToggleRow label="Web push notifications" checked={toggles.push} onChange={() => setToggles((v) => ({ ...v, push: !v.push }))} />
            <SettingsHeading>Messages</SettingsHeading>
            <SettingRow label="Chat messages" value="All on" />
            <SettingRow label="Chat requests" value="All on" />
            <SettingRow label="Mark all as read" action="Mark as read" description="Mark all chat conversations as read" />
            <SettingsHeading>Activity</SettingsHeading>
            {["Mentions of u/username", "Comments on your posts", "Upvotes on your posts", "Replies to your comments", "New followers"].map((label) => (
              <SettingRow key={label} label={label} value="All on" />
            ))}
          </SettingsSection>
        )}

        {activeTab === "email" && (
          <SettingsSection title="Email">
            <ToggleRow label="Email digest" description="Receive a periodic summary of account activity" checked={toggles.emailDigest} onChange={() => setToggles((v) => ({ ...v, emailDigest: !v.emailDigest }))} />
            <SettingRow label="Messages" value="Important only" />
            <SettingRow label="Community activity" value="Weekly" />
            <SettingRow label="Security alerts" value="Always on" />
            <div className="mt-6 rounded-lg bg-[var(--muted)] p-4 text-sm text-[var(--text-secondary)]">
              <ShieldCheck className="mb-2 text-green-500" size={20} />
              Security and verification messages remain enabled for account safety.
            </div>
          </SettingsSection>
        )}
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-4 text-xl font-semibold text-[var(--text-secondary)]">{title}</h2>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function SettingsHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 text-xl font-semibold text-[var(--text-secondary)]">{children}</h3>;
}

function SettingRow({ label, description, value, action }: { label: string; description?: string; value?: string; action?: string }) {
  return (
    <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-[var(--text-secondary)]">{description}</div>}
      </div>
      <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
        {value && <span>{value}</span>}
        {action ? <button className="rounded-full bg-[var(--muted)] px-4 py-2 font-semibold text-[var(--foreground)]">{action}</button> : <ChevronRight size={18} />}
      </div>
    </div>
  );
}

function SettingLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 hover:text-[var(--primary)]">
      <span className="text-sm">{label}</span>
      {icon}
    </Link>
  );
}

function EditableRow({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
}) {
  return (
    <label className="grid gap-2 py-3">
      <span className="text-sm">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          rows={4}
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={maxLength}
          placeholder={placeholder}
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
      )}
    </label>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3">
      <div>
        <div className="text-sm">{label}</div>
        {description && <div className="text-xs text-[var(--text-secondary)]">{description}</div>}
      </div>
      <button
        type="button"
        onClick={onChange}
        className={`relative h-8 w-12 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-[var(--muted)]"}`}
        aria-pressed={checked}
      >
        <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
