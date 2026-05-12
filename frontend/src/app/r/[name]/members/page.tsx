"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import backend from "@/lib/backend";
import { Shield, Users } from "lucide-react";

export default function CommunityMembersPage() {
  const { name } = useParams<{ name: string }>();
  const [subreddit, setSubreddit] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => {
    async function load() {
      const subRes = await backend.backendFetch(`/subreddits/${name}`);
      if (!subRes.ok) return;
      const sub = await subRes.json();
      setSubreddit(sub);
      const membersRes = await backend.backendFetch(`/subreddits/${sub._id}/members`);
      if (membersRes.ok) setMembers(await membersRes.json());
    }
    load();
  }, [name]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Users size={22} /> r/{subreddit?.name || name} members</h1>
      <div className="mt-5 space-y-2">
        {members.map((member) => (
          <div key={member._id} className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
            <div>
              <div className="font-medium">{member.user?.username || member.userId}</div>
              <div className="text-xs text-[var(--text-secondary)]">flags {String(member.statusFlags)}</div>
            </div>
            {(BigInt(member.statusFlags || 0) & BigInt(8)) !== BigInt(0) && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--muted)] px-2 py-1 text-xs"><Shield size={13} /> mod</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
