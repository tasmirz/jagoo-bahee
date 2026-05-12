"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import backend from "@/lib/backend";
import { Flag } from "lucide-react";

export default function CommunityReportsPage() {
  const { name } = useParams<{ name: string }>();
  const [subreddit, setSubreddit] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const subRes = await backend.backendFetch(`/subreddits/${name}`);
      if (!subRes.ok) return;
      const sub = await subRes.json();
      setSubreddit(sub);
      const reportRes = await backend.backendFetch(`/reports?subredditId=${sub._id}&status=pending`);
      if (reportRes.ok) setReports(await reportRes.json());
    }
    load();
  }, [name]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Flag size={22} /> r/{subreddit?.name || name} reports</h1>
      <div className="mt-5 space-y-2">
        {reports.length === 0 ? <p className="text-sm text-[var(--text-secondary)]">No pending reports.</p> : reports.map((report) => (
          <div key={report._id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <div className="font-medium">{report.reason}</div>
            <div className="text-sm text-[var(--text-secondary)]">{report.description || "No description"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
