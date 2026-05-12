"use client";

import React, { useEffect, useState } from "react";
import backend from "@/lib/backend";
import { AceternityCard } from "@/components/ui/aceternity-card";
import { Ban, Globe2, Shield, ShieldCheck, Users } from "lucide-react";

type AdminUser = { _id: string; username: string; abac: string; publicKey?: string };
type FederatedServer = { _id: string; name: string; baseUrl: string; status: string };

export default function AdminDashboard() {
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [servers, setServers] = useState<FederatedServer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setError(null);
    try {
      const [summaryRes, usersRes, serversRes] = await Promise.all([
        backend.backendFetch("/admin/summary"),
        backend.backendFetch("/admin/users"),
        backend.backendFetch("/admin/federation/servers"),
      ]);
      if (!summaryRes.ok) throw new Error(`Admin access denied (${summaryRes.status})`);
      setSummary(await summaryRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (serversRes.ok) setServers(await serversRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin dashboard");
    }
  }

  async function setRole(user: AdminUser, moderator: boolean) {
    await backend.backendJson("PATCH", `/admin/users/${user._id}/global-role`, { moderator });
    await load();
  }

  async function addServer(event: React.FormEvent) {
    event.preventDefault();
    if (!baseUrl.trim()) return;
    await backend.backendJson("POST", "/admin/federation/servers", { baseUrl });
    setBaseUrl("");
    await load();
  }

  if (error) {
    return <div className="mx-auto max-w-3xl p-8 text-[var(--error)]">{error}</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><ShieldCheck size={22} /> Admin dashboard</h1>
      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        {["users", "communities", "posts", "federationServers"].map((key) => (
          <AceternityCard key={key} className="p-4">
            <div className="text-2xl font-semibold">{summary?.[key] ?? "-"}</div>
            <div className="text-sm capitalize text-[var(--text-secondary)]">{key.replace(/([A-Z])/g, " $1")}</div>
          </AceternityCard>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <AceternityCard className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Users size={18} /> Users and system moderators</h2>
          <div className="space-y-2">
            {users.map((user) => {
              const isMod = (BigInt(user.abac || "0") & (BigInt(1) << BigInt(4))) !== BigInt(0);
              return (
                <div key={user._id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3">
                  <div className="min-w-0">
                    <div className="font-medium">{user.username || user._id}</div>
                    <div className="truncate text-xs text-[var(--text-secondary)]">{user.publicKey || "no public key"}</div>
                  </div>
                  <button
                    onClick={() => setRole(user, !isMod)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${isMod ? "border border-[var(--border)]" : "bg-[var(--primary)] text-white"}`}
                  >
                    {isMod ? <Ban size={15} /> : <Shield size={15} />}
                    {isMod ? "Remove mod" : "Make mod"}
                  </button>
                </div>
              );
            })}
          </div>
        </AceternityCard>

        <AceternityCard className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Globe2 size={18} /> Federated servers</h2>
          <form onSubmit={addServer} className="mb-3 flex gap-2">
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://instance.example" className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm" />
            <button className="rounded-full bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white">Add</button>
          </form>
          <div className="space-y-2">
            {servers.map((server) => (
              <div key={server._id} className="rounded-lg border border-[var(--border)] p-3">
                <div className="font-medium">{server.name}</div>
                <div className="break-all text-xs text-[var(--text-secondary)]">{server.baseUrl}</div>
                <div className="mt-2 text-xs uppercase text-[var(--text-secondary)]">{server.status}</div>
              </div>
            ))}
          </div>
        </AceternityCard>
      </div>
    </div>
  );
}
