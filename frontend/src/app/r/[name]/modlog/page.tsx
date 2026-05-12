"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import backend from "@/lib/backend";
import { Shield } from "lucide-react";

export default function CommunityModlogPage() {
  const { name } = useParams<{ name: string }>();
  const [subreddit, setSubreddit] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const subRes = await backend.backendFetch(`/subreddits/${name}`);
      if (!subRes.ok) return;
      const sub = await subRes.json();
      setSubreddit(sub);
      const logsRes = await backend.backendFetch(`/subreddits/${sub._id}/modlogs?limit=100`);
      if (logsRes.ok) setLogs(await logsRes.json());
    }
    load();
  }, [name]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Shield size={22} /> r/{subreddit?.name || name} mod log</h1>
      <div className="mt-5 space-y-2">
        {logs.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No moderation events yet.</p> : logs.map((log) => (
          <div key={log._id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="font-medium">{log.action}</div>
            <div className="text-sm text-[var(--text-secondary)]">{log.reason || "No reason recorded"}</div>
            <pre className="mt-2 overflow-auto rounded bg-[var(--muted)] p-2 text-xs">{JSON.stringify(log, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
