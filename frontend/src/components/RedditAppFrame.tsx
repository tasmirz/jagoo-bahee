"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  Bell,
  Compass,
  FileCheck2,
  Home,
  Mail,
  Plus,
  RadioTower,
  Search,
  Settings,
  Shield,
  Star,
} from "lucide-react";
import { useAuth } from "@/lib/context/AuthContext";
import { backendFetch } from "@/lib/backend";

interface RailCommunity {
  _id: string;
  name: string;
  memberCount?: number;
}

export default function RedditAppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const hideRail = pathname?.startsWith("/auth") || pathname?.includes("/mod");
  const [communities, setCommunities] = useState<RailCommunity[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      const id = window.setTimeout(() => setCommunities([]), 0);
      return () => window.clearTimeout(id);
    }

    let cancelled = false;
    async function loadCommunities() {
      try {
        const response = await backendFetch("/users/me/subreddits");
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) setCommunities(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch (error) {
        console.error("Failed to load rail communities:", error);
      }
    }
    void loadCommunities();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  if (hideRail) return <main>{children}</main>;

  return (
    <div className="reddit-shell">
      <aside className="reddit-left-rail">
        <nav className="space-y-1">
          <RailLink href="/" icon={Home} label="Home" />
          <RailLink href="/subreddits" icon={Compass} label="Explore" />
          <RailLink href="/search" icon={Search} label="Search" />
          <RailLink href="/subreddits/create" icon={Plus} label="Start a community" />
        </nav>

        <RailSection title="Personal">
          <RailLink href="/messages" icon={Mail} label="Messages" />
          <RailLink href="/notifications" icon={Bell} label="Notifications" />
          <RailLink href="/saved" icon={Star} label="Saved" />
          <RailLink href="/settings" icon={Settings} label="User settings" />
        </RailSection>

        <RailSection title="Platform">
          <RailLink href="/awards" icon={Award} label="Awards" />
          <RailLink href="/acknowledgements" icon={FileCheck2} label="Proofs & audit" />
          <RailLink href="/audit" icon={Shield} label="Verification" />
          <RailLink href="/admin" icon={RadioTower} label="Server admin" />
        </RailSection>

        <RailSection title="Communities">
          {!isAuthenticated ? (
            <Link href="/auth" className="reddit-muted-action">
              Log in to see joined communities
            </Link>
          ) : communities.length === 0 ? (
            <Link href="/subreddits" className="reddit-muted-action">
              Explore communities
            </Link>
          ) : (
            <div className="space-y-1">
              {communities.map((community) => (
                <Link key={community._id} href={`/r/${community.name}`} className="reddit-rail-link">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">
                    {community.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 truncate">r/{community.name}</span>
                </Link>
              ))}
            </div>
          )}
        </RailSection>
      </aside>
      <main className="reddit-main">{children}</main>
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 border-t border-[var(--border)] pt-5">
      <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-secondary)]">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function RailLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <Link href={href} className="reddit-rail-link">
      <Icon size={19} />
      <span>{label}</span>
    </Link>
  );
}
