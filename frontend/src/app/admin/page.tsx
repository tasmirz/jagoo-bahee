"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import backend from "@/lib/backend";
import {
  Activity,
  Ban,
  BookOpen,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  Link2,
  Lock,
  RadioTower,
  RefreshCcw,
  Shield,
  ShieldCheck,
  Siren,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

type AdminUser = {
  _id: string;
  username: string;
  abac: string;
  publicKey?: string;
  bannedUntil?: string;
  banReason?: string;
};
type FederatedServer = { _id: string; name: string; baseUrl: string; status: string; publicKey?: string };
type IpBlock = { _id?: string; ip: string; reason?: string; createdAt?: string };
type SecurityConfig = {
  security: { registrationsOpen: boolean };
  rateLimits: Record<string, { limit: number; windowMs: number }>;
  rules: string[];
};

const rateScopes = [
  "auth-challenge",
  "auth-submit",
  "account-create",
  "post-create",
  "post-update",
  "comment-create",
  "message-send",
  "message-reply",
  "attachment-upload-url",
];

const defaultRateLimits = Object.fromEntries(
  rateScopes.map((scope) => [scope, { limit: scope === "account-create" ? 5 : 60, windowMs: 60 * 60 * 1000 }])
);

export default function AdminDashboard() {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [servers, setServers] = useState<FederatedServer[]>([]);
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>({
    security: { registrationsOpen: true },
    rateLimits: defaultRateLimits,
    rules: [],
  });
  const [ipBlocks, setIpBlocks] = useState<IpBlock[]>([]);
  const [moderation, setModeration] = useState<{ reports: any[]; logs: any[] }>({ reports: [], logs: [] });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverForm, setServerForm] = useState({ baseUrl: "", name: "", publicKey: "" });
  const [ipForm, setIpForm] = useState({ ip: "", reason: "" });
  const [rulesText, setRulesText] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError(null);
    try {
      const [summaryRes, usersRes, serversRes, securityRes, blocksRes, moderationRes] = await Promise.all([
        backend.backendFetch("/admin/summary"),
        backend.backendFetch("/admin/users"),
        backend.backendFetch("/admin/federation/servers"),
        backend.backendFetch("/admin/security/config"),
        backend.backendFetch("/admin/security/ip-blocks"),
        backend.backendFetch("/admin/moderation/overview"),
      ]);
      if (!summaryRes.ok) throw new Error(`Admin access denied (${summaryRes.status})`);
      setSummary(await summaryRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (serversRes.ok) setServers(await serversRes.json());
      if (securityRes.ok) {
        const data = (await securityRes.json()) as SecurityConfig;
        const merged = { ...data, rateLimits: { ...defaultRateLimits, ...(data.rateLimits || {}) } };
        setSecurityConfig(merged);
        setRulesText((data.rules || []).join("\n"));
      }
      if (blocksRes.ok) setIpBlocks(await blocksRes.json());
      if (moderationRes.ok) setModeration(await moderationRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin dashboard");
    }
  }

  async function setRole(user: AdminUser, moderator: boolean, admin?: boolean) {
    await backend.backendJson("PATCH", `/admin/users/${user._id}/global-role`, { moderator, ...(typeof admin === "boolean" ? { admin } : {}) });
    await load();
  }

  async function banUser(user: AdminUser) {
    const reason = window.prompt("Ban reason", user.banReason || "server policy");
    if (reason === null) return;
    const days = Number(window.prompt("Ban duration in days", "7") || 7);
    await backend.backendJson("PATCH", `/admin/users/${user._id}/ban`, { reason, days });
    await load();
  }

  async function unbanUser(user: AdminUser) {
    await backend.backendJson("PATCH", `/admin/users/${user._id}/unban`, {});
    await load();
  }

  async function addServer(event: React.FormEvent) {
    event.preventDefault();
    if (!serverForm.baseUrl.trim()) return;
    const res = await backend.backendJson("POST", "/admin/federation/servers", {
      baseUrl: serverForm.baseUrl,
      name: serverForm.name || undefined,
      publicKey: serverForm.publicKey || undefined,
    });
    if (!res.ok) throw new Error(await readError(res));
    setServerForm({ baseUrl: "", name: "", publicKey: "" });
    await load();
  }

  async function updateServer(server: FederatedServer, status: string) {
    await backend.backendJson("PATCH", `/admin/federation/servers/${server._id}`, { status });
    await load();
  }

  async function removeServer(server: FederatedServer) {
    await backend.backendFetch(`/admin/federation/servers/${server._id}`, { method: "DELETE" });
    await load();
  }

  async function saveSecurityConfig() {
    setSaving(true);
    try {
      const rules = rulesText.split("\n").map((rule) => rule.trim()).filter(Boolean);
      const res = await backend.backendJson("PUT", "/admin/security/config", {
        registrationsOpen: securityConfig.security.registrationsOpen,
        rateLimits: securityConfig.rateLimits,
        rules,
      });
      if (!res.ok) throw new Error(await readError(res));
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function addIpBlock(event: React.FormEvent) {
    event.preventDefault();
    if (!ipForm.ip.trim()) return;
    const res = await backend.backendJson("POST", "/admin/security/ip-blocks", ipForm);
    if (!res.ok) throw new Error(await readError(res));
    setIpForm({ ip: "", reason: "" });
    await load();
  }

  async function removeIpBlock(ip: string) {
    await backend.backendFetch(`/admin/security/ip-blocks/${encodeURIComponent(ip)}`, { method: "DELETE" });
    await load();
  }

  const health = useMemo(() => [
    { key: "users", label: "Users", icon: Users },
    { key: "communities", label: "Communities", icon: RadioTower },
    { key: "posts", label: "Posts", icon: FileText },
    { key: "federationServers", label: "Peers", icon: Globe2 },
    { key: "pendingReports", label: "Reports", icon: Siren },
    { key: "blockedIps", label: "IP blocks", icon: Lock },
  ], []);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <div className="rounded-lg border border-[var(--error)]/30 bg-[var(--error)]/10 p-4 text-[var(--error)]">{error}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck size={22} /> Server Admin</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <AdminLink href="/admin" icon={Gauge}>Overview</AdminLink>
            <AdminLink href="/subreddits" icon={RadioTower}>Communities</AdminLink>
            <AdminLink href="/admin" icon={Siren}>Reports</AdminLink>
            <AdminLink href="/audit" icon={BookOpen}>Audit</AdminLink>
            <AdminLink href="/settings" icon={UserCog}>Settings</AdminLink>
          </div>
        </div>
        <button onClick={load} className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--muted)]">
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {health.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex items-center justify-between text-[var(--text-secondary)]"><span className="text-sm">{label}</span><Icon size={17} /></div>
            <div className="mt-3 text-2xl font-semibold">{summary?.[key] ?? "-"}</div>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <SectionTitle icon={Users} title="Users" />
          <div className="divide-y divide-[var(--border)]">
            {users.map((user) => {
              const flags = BigInt(user.abac || "0");
              const isMod = (flags & (BigInt(1) << BigInt(4))) !== BigInt(0);
              const isAdmin = (flags & (BigInt(1) << BigInt(5))) !== BigInt(0);
              const banned = user.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now();
              return (
                <div key={user._id} className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/users/${user.username}`} className="font-medium hover:underline">{user.username || user._id}</Link>
                      {isAdmin && <Badge>admin</Badge>}
                      {isMod && <Badge>mod</Badge>}
                      {banned && <Badge tone="danger">banned</Badge>}
                    </div>
                    <div className="mt-1 truncate text-xs text-[var(--text-secondary)]">{user.publicKey || "no public key"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <SmallButton onClick={() => setRole(user, !isMod)} icon={Shield}>{isMod ? "Remove mod" : "Make mod"}</SmallButton>
                    <SmallButton onClick={() => setRole(user, isMod, !isAdmin)} icon={ShieldCheck}>{isAdmin ? "Remove admin" : "Make admin"}</SmallButton>
                    <SmallButton onClick={() => banned ? unbanUser(user) : banUser(user)} icon={Ban}>{banned ? "Unban" : "Ban"}</SmallButton>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <SectionTitle icon={Globe2} title="Federation" />
          <form onSubmit={addServer} className="grid gap-2 border-b border-[var(--border)] p-3">
            <input value={serverForm.baseUrl} onChange={(event) => setServerForm({ ...serverForm, baseUrl: event.target.value })} placeholder="https://instance.example" className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={serverForm.name} onChange={(event) => setServerForm({ ...serverForm, name: event.target.value })} placeholder="Name" className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
              <input value={serverForm.publicKey} onChange={(event) => setServerForm({ ...serverForm, publicKey: event.target.value })} placeholder="Server public key" className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            </div>
            <button className="inline-flex w-fit items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white"><Link2 size={16} /> Add peer</button>
          </form>
          <div className="divide-y divide-[var(--border)]">
            {servers.map((server) => (
              <div key={server._id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{server.name || server.baseUrl}</div>
                    <div className="break-all text-xs text-[var(--text-secondary)]">{server.baseUrl}</div>
                  </div>
                  <Badge>{server.status}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["approved", "pending", "blocked"].map((status) => (
                    <SmallButton key={status} onClick={() => updateServer(server, status)}>{status}</SmallButton>
                  ))}
                  <SmallButton onClick={() => removeServer(server)} icon={Trash2}>Delete</SmallButton>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <SectionTitle icon={Siren} title="Moderation" />
          <div className="grid gap-3 p-3">
            {moderation.reports.slice(0, 5).map((report) => (
              <div key={String(report._id)} className="rounded-md border border-[var(--border)] p-3 text-sm">
                <div className="font-medium">{report.targetType || "report"} · {report.status || "pending"}</div>
                <div className="mt-1 text-[var(--text-secondary)]">{report.reason || "other"}</div>
              </div>
            ))}
            <Link href="/subreddits" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--primary)]">Open community tools <ExternalLink size={14} /></Link>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <SectionTitle icon={Activity} title="Rate limits" />
          <div className="grid gap-2 p-3">
            {rateScopes.map((scope) => {
              const item = securityConfig.rateLimits[scope] || defaultRateLimits[scope];
              return (
                <div key={scope} className="grid grid-cols-[minmax(0,1fr)_80px_110px] items-center gap-2 text-sm">
                  <span className="truncate">{scope}</span>
                  <input type="number" min={1} value={item.limit} onChange={(event) => setSecurityConfig(updateLimit(securityConfig, scope, "limit", event.target.value))} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1" />
                  <input type="number" min={1000} value={item.windowMs} onChange={(event) => setSecurityConfig(updateLimit(securityConfig, scope, "windowMs", event.target.value))} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1" />
                </div>
              );
            })}
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={securityConfig.security.registrationsOpen} onChange={(event) => setSecurityConfig({ ...securityConfig, security: { registrationsOpen: event.target.checked } })} />
              Registrations open
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
          <SectionTitle icon={Lock} title="IP blocks" />
          <form onSubmit={addIpBlock} className="grid gap-2 border-b border-[var(--border)] p-3">
            <input value={ipForm.ip} onChange={(event) => setIpForm({ ...ipForm, ip: event.target.value })} placeholder="203.0.113.10" className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            <input value={ipForm.reason} onChange={(event) => setIpForm({ ...ipForm, reason: event.target.value })} placeholder="Reason" className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            <button className="inline-flex w-fit items-center gap-2 rounded-md bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white"><Ban size={16} /> Block IP</button>
          </form>
          <div className="divide-y divide-[var(--border)]">
            {ipBlocks.map((block) => (
              <div key={block.ip} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">{block.ip}</div>
                  <div className="truncate text-xs text-[var(--text-secondary)]">{block.reason}</div>
                </div>
                <button onClick={() => removeIpBlock(block.ip)} className="rounded-md p-2 hover:bg-[var(--muted)]" aria-label="Remove IP block"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <SectionTitle icon={BookOpen} title="Server rules" />
        <div className="p-3">
          <textarea value={rulesText} onChange={(event) => setRulesText(event.target.value)} rows={6} className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
          <button onClick={saveSecurityConfig} disabled={saving} className="mt-3 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving" : "Save controls"}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminLink({ href, icon: Icon, children }: { href: string; icon: any; children: React.ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-[var(--muted)]"><Icon size={15} />{children}</Link>;
}

function SectionTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-3 font-semibold"><Icon size={18} /> {title}</div>;
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${tone === "danger" ? "bg-[var(--error)]/10 text-[var(--error)]" : "bg-[var(--muted)] text-[var(--text-secondary)]"}`}>{children}</span>;
}

function SmallButton({ onClick, icon: Icon, children }: { onClick: () => void; icon?: any; children: React.ReactNode }) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-sm hover:bg-[var(--muted)]">{Icon && <Icon size={14} />}{children}</button>;
}

function updateLimit(config: SecurityConfig, scope: string, key: "limit" | "windowMs", value: string): SecurityConfig {
  return {
    ...config,
    rateLimits: {
      ...config.rateLimits,
      [scope]: {
        ...(config.rateLimits[scope] || defaultRateLimits[scope]),
        [key]: Number(value),
      },
    },
  };
}

async function readError(res: Response) {
  const data = await res.json().catch(() => null);
  return String(data?.message || `Request failed (${res.status})`);
}
