"use client";

import Link from "next/link";
import { BarChart3, BookOpen, CalendarDays, Gavel, Mail, Shield, Users } from "lucide-react";
import { Subreddit } from "@/lib/types";

export default function CommunitySidebar({
  name,
  subreddit,
  rules,
  canManage,
}: {
  name: string;
  subreddit: Subreddit;
  rules: string[];
  canManage: boolean;
}) {
  return (
    <aside className="space-y-3">
      {canManage && (
        <section className="reddit-side-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Build your community</h2>
            <Link href={`/r/${name}/mod`} className="text-xs text-[var(--primary)] hover:underline">
              Finish setup
            </Link>
          </div>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
            <div className="h-full w-1/3 bg-[var(--primary)]" />
          </div>
          <div className="grid gap-2">
            <Link href={`/r/${name}/create`} className="reddit-side-action">Create a welcome post</Link>
            <Link href={`/r/${name}/mod/settings`} className="reddit-side-action">Customize appearance</Link>
            <Link href={`/r/${name}/mod/queue`} className="reddit-side-action">Review queue</Link>
            <Link href={`/r/${name}/mod`} className="reddit-side-action-strong">View all mod tools</Link>
          </div>
        </section>
      )}

      <section className="reddit-side-card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold">{subreddit.displayName || subreddit.name}</h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{subreddit.description || "No description yet."}</p>
          </div>
          {canManage && (
            <Link href={`/r/${name}/settings`} className="rounded-full bg-[var(--muted)] p-2 hover:bg-[var(--border)]" aria-label="Edit community settings">
              <Shield size={15} />
            </Link>
          )}
        </div>
        <div className="grid gap-2 text-xs text-[var(--text-secondary)]">
          <div className="flex items-center gap-2">
            <CalendarDays size={15} />
            Created {subreddit.createdAt ? new Date(subreddit.createdAt).toLocaleDateString() : "recently"}
          </div>
          <div className="flex items-center gap-2">
            <Users size={15} />
            {(subreddit.memberCount || 0).toLocaleString()} members
          </div>
        </div>
        <div className="mt-4 grid gap-2">
          <Link href={`/r/${name}/create`} className="reddit-side-action-strong">Create Post</Link>
          <Link href={`/r/${name}/members`} className="reddit-side-action">Members</Link>
          <Link href={`/r/${name}/stats`} className="reddit-side-action">Insights</Link>
        </div>
      </section>

      <section className="reddit-side-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase text-[var(--primary)]">r/{name} rules</h2>
          {canManage && <Link href={`/r/${name}/settings`} className="text-xs text-[var(--text-secondary)] hover:text-[var(--foreground)]">Edit</Link>}
        </div>
        {rules.length > 0 ? (
          <ol className="divide-y divide-[var(--border)] text-sm">
            {rules.map((rule, index) => (
              <li key={`${rule}-${index}`} className="flex gap-3 py-3">
                <span className="text-[var(--primary)]">{index + 1}</span>
                <span>{rule}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-sm text-[var(--text-secondary)]">No rules have been added yet.</div>
        )}
      </section>

      <section className="reddit-side-card">
        <h2 className="mb-3 text-xs font-bold uppercase text-[var(--primary)]">Community tools</h2>
        <div className="grid gap-2">
          <Link href={`/r/${name}/modlog`} className="reddit-side-link"><Gavel size={15} /> Mod Log</Link>
          <Link href={`/r/${name}/reports`} className="reddit-side-link"><Shield size={15} /> Reports</Link>
          <Link href="/messages" className="reddit-side-link"><Mail size={15} /> Message Mods</Link>
          <Link href={`/r/${name}/stats`} className="reddit-side-link"><BarChart3 size={15} /> Insights</Link>
          <Link href={`/r/${name}/settings`} className="reddit-side-link"><BookOpen size={15} /> Community Guide</Link>
        </div>
      </section>
    </aside>
  );
}
