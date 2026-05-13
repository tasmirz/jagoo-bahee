"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, LayoutList, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { backendFetch } from "@/lib/backend";

interface Report {
  _id: string;
  reporterId: {
    _id: string;
    username: string;
    displayName?: string;
    avatar?: string;
  };
  targetId: string;
  targetType: "post" | "comment" | "user";
  subredditId: string;
  reason: string;
  description?: string;
  status: "pending" | "reviewed" | "resolved" | "dismissed";
  reviewedBy?: {
    _id: string;
    username: string;
    displayName?: string;
  };
  reviewedAt?: string;
  actionTaken?: "removed" | "warned" | "banned" | "none";
  createdAt: string;
  updatedAt: string;
}

interface Subreddit {
  _id: string;
  name: string;
}

type QueueTab = "pending" | "reported" | "removed" | "edited" | "unmoderated";

export default function ModQueuePage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const params = useParams();
  const subredditName = params?.name as string;

  const [subreddit, setSubreddit] = useState<Subreddit | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QueueTab>("pending");
  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/auth");
      return;
    }

    async function fetchData() {
      try {
        const subRes = await backendFetch(`/subreddits/${subredditName}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubreddit(subData);

          const statusParam = filter === "pending" ? "?status=pending" : "";
          const reportsRes = await backendFetch(`/moderation/subreddits/${subData._id}/reports${statusParam}`);
          if (reportsRes.ok) {
            const reportsData = await reportsRes.json();
            setReports(Array.isArray(reportsData) ? reportsData : []);
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    }

    void fetchData();
  }, [isAuthenticated, router, subredditName, filter]);

  const handleApprove = async (reportId: string) => {
    try {
      const res = await backendFetch(`/moderation/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          actionTaken: "none",
        }),
      });

      if (res.ok) {
        setReports((prev) => prev.map((report) => (report._id === reportId ? { ...report, status: "resolved", actionTaken: "none" } : report)));
      }
    } catch (error) {
      console.error("Failed to approve:", error);
    }
  };

  const handleRemove = async (reportId: string, actionTaken: "removed" | "warned" | "banned") => {
    try {
      const res = await backendFetch(`/moderation/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          actionTaken,
        }),
      });

      if (res.ok) {
        setReports((prev) => prev.map((report) => (report._id === reportId ? { ...report, status: "resolved", actionTaken } : report)));
      }
    } catch (error) {
      console.error("Failed to remove:", error);
    }
  };

  const handleDismiss = async (reportId: string) => {
    try {
      const res = await backendFetch(`/moderation/reports/${reportId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });

      if (res.ok) {
        setReports((prev) => prev.map((report) => (report._id === reportId ? { ...report, status: "dismissed" } : report)));
      }
    } catch (error) {
      console.error("Failed to dismiss:", error);
    }
  };

  const visibleReports = reports.filter((report) => {
    if (filter === "pending") return report.status === "pending";
    if (filter === "reported") return true;
    if (filter === "removed") return report.actionTaken === "removed";
    return false;
  });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="relative grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
      <main className="min-w-0 px-6 py-5">
        <div className="mb-5 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-[var(--text-secondary)]">Queue</h1>
          <div className="flex items-center gap-6 text-[var(--text-secondary)]">
            <button type="button" onClick={() => setShowTutorial(true)} title="Queue tutorial">
              <HelpCircle size={20} />
            </button>
            <ChevronLeft size={20} />
            <ChevronRight size={20} />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div className="flex flex-wrap gap-2">
            {[
              ["pending", "Needs Review"],
              ["reported", "Reported"],
              ["removed", "Removed"],
              ["edited", "Edited"],
              ["unmoderated", "Unmoderated"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id as QueueTab)}
                className={`rounded-full px-4 py-3 text-sm font-semibold ${
                  filter === id ? "bg-[var(--muted)] text-[var(--foreground)]" : "text-[var(--text-secondary)] hover:bg-[var(--muted)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
            <button className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-4 py-3">Communities <ChevronDown size={16} /></button>
            <button className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-4 py-3">All content <ChevronDown size={16} /></button>
            <button className="inline-flex items-center gap-2 text-[var(--text-secondary)]"><ArrowUpDown size={17} /> Newest First <ChevronDown size={16} /></button>
            <LayoutList size={20} className="text-[var(--text-secondary)]" />
          </div>
        </div>

        {visibleReports.length === 0 ? (
          <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
            <ShieldCheck className="mb-5 text-[var(--primary)]" size={92} />
            <h2 className="text-2xl font-bold">Queue is clean.</h2>
            <p className="mt-1 text-[var(--text-secondary)]">No items need moderator review right now.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {visibleReports.map((report) => (
              <article key={report._id} className="py-5">
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-[var(--text-secondary)]">
                      Reported by u/{report.reporterId.username} · {new Date(report.createdAt).toLocaleString()} · {report.targetType}
                    </div>
                    <h2 className="mt-2 text-lg font-semibold">{report.reason.replace(/_/g, " ")}</h2>
                    {report.description && <p className="mt-2 text-sm text-[var(--text-secondary)]">{report.description}</p>}
                  </div>
                  <span className="rounded-full bg-yellow-500/15 px-3 py-1 text-xs font-semibold text-yellow-500">{report.status}</span>
                </div>
                {report.reviewedBy && (
                  <div className="mb-3 text-xs text-[var(--text-secondary)]">
                    Reviewed by u/{report.reviewedBy.username}
                    {report.reviewedAt ? ` · ${new Date(report.reviewedAt).toLocaleString()}` : ""}
                    {report.actionTaken ? ` · Action: ${report.actionTaken}` : ""}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Link href={report.targetType === "post" ? `/posts/${report.targetId}` : "#"} className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--muted)]">
                    View {report.targetType}
                  </Link>
                  {report.status === "pending" && (
                    <>
                      <button onClick={() => handleApprove(report._id)} className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white">Approve</button>
                      <button onClick={() => handleRemove(report._id, "removed")} className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">Remove</button>
                      <button onClick={() => handleDismiss(report._id)} className="rounded-full bg-[var(--muted)] px-4 py-2 text-sm font-semibold">Dismiss</button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <aside className="hidden border-l border-[var(--border)] px-6 py-5 lg:block">
        <div className="sticky top-16">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[var(--text-secondary)]">Insights and activity</h2>
            <X size={20} className="text-[var(--text-secondary)]" />
          </div>
          <div className="space-y-8">
            <InsightBlock title="Last 7 days" value={`r/${subreddit?.name || subredditName}`} />
            <Metric label="Active mods" value="0" helper="Your team made 0 mod actions this week" />
            <Metric label="Published posts" value="0" helper="It's the same as the previous 7 days" />
            <Metric label="Published comments" value="0" helper="It's the same as the previous 7 days" />
            <Metric label="Reports on posts and comments" value={String(reports.length)} />
            <Link href={`/r/${subredditName}/mod/insights`} className="text-sm text-blue-500 hover:underline">View more insights</Link>
            <div className="border-t border-[var(--border)] pt-6">
              <div className="flex items-center justify-between">
                <span>No mods are active</span>
                <ChevronDown size={18} />
              </div>
              <div className="mt-5 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary)] font-bold text-white">{subredditName.slice(0, 1).toUpperCase()}</div>
                <div>
                  <div className="text-[var(--foreground)]">r/{subredditName}</div>
                  <div>No recent actions</div>
                </div>
              </div>
            </div>
            <div className="border-t border-[var(--border)] pt-6">
              <div className="flex items-center justify-between">
                <span>Actively being moderated</span>
                <ChevronDown size={18} />
              </div>
            </div>
          </div>
        </div>
      </aside>

      {showTutorial && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 px-4">
          <div className="w-full max-w-3xl rounded-2xl bg-[var(--card)] p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold">Mod Queue Tutorial</h2>
              <button type="button" onClick={() => setShowTutorial(false)} className="rounded-full bg-[var(--muted)] p-2">
                <X size={20} />
              </button>
            </div>
            <div className="grid aspect-video place-items-center rounded-xl border border-[var(--border)] bg-[var(--background)]">
              <ShieldCheck size={96} className="text-[var(--primary)]" />
            </div>
            <h3 className="mt-5 text-2xl font-bold">Introducing contextual panels</h3>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
              Click an item in the mod queue to view reports in context. Open a username or content link to inspect the source before approving, removing, or dismissing it.
            </p>
            <div className="mt-8 flex items-center justify-between">
              <div className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)]" />
                <span className="h-2 w-2 rounded-full bg-[var(--muted)]" />
                <span className="h-2 w-2 rounded-full bg-[var(--muted)]" />
              </div>
              <button type="button" onClick={() => setShowTutorial(false)} className="rounded-full bg-[var(--muted)] px-5 py-3 text-sm font-semibold">
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InsightBlock({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-lg">{title}</span>
        <ChevronDown size={18} />
      </div>
      <button className="rounded-full bg-[var(--muted)] px-4 py-2 text-sm font-semibold">{value}</button>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
      <div>
        <div>{label}</div>
        {helper && <div className="text-xs text-[var(--text-secondary)]">{helper}</div>}
      </div>
      <div className="text-xl font-semibold text-[var(--text-secondary)]">{value}</div>
    </div>
  );
}
