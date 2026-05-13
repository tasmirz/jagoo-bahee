"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Bot,
  Box,
  CalendarDays,
  ChevronLeft,
  FileText,
  Flag,
  Gavel,
  Inbox,
  ListChecks,
  Mail,
  MessageSquareQuote,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  UserMinus,
  Users,
} from "lucide-react";

type ModToolsShellProps = {
  name: string;
  children: React.ReactNode;
};

const groups = [
  {
    title: "Overview",
    links: [
      { href: "mod", label: "Set up", icon: ListChecks },
      { href: "mod/queue", label: "Queues", icon: Inbox },
      { href: "reports", label: "Reports", icon: Flag },
      { href: "stats", label: "Insights", icon: BarChart3 },
      { href: "mod/members", label: "Mods & Members", icon: Users },
      { href: "mod/moderators", label: "Moderators", icon: Shield },
      { href: "mod/banned", label: "Restricted Users", icon: UserMinus },
    ],
  },
  {
    title: "Moderation",
    links: [
      { href: "settings", label: "Rules", icon: Gavel },
      { href: "modlog", label: "Mod Log", icon: ListChecks },
      { href: "mod/roles", label: "Roles & Permissions", icon: Shield },
      { href: "mod/settings", label: "Safety Filters", icon: SlidersHorizontal },
      { href: "mod/settings", label: "Automod", icon: Bot },
    ],
  },
  {
    title: "Content",
    links: [
      { href: "create", label: "Create Post", icon: FileText },
      { href: "mod/settings", label: "Look and Feel", icon: Box },
      { href: "mod/settings", label: "Posts & Comments", icon: MessageSquareQuote },
      { href: "mod/settings", label: "Wiki / Guides", icon: BookOpen },
      { href: "mod/settings", label: "Scheduled Posts", icon: CalendarDays },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "messages", label: "Mod Mail", icon: Mail },
      { href: "mod/settings", label: "General Settings", icon: Settings },
    ],
  },
];

export default function ModToolsShell({ name, children }: ModToolsShellProps) {
  const pathname = usePathname();

  return (
    <div className="reddit-mod-shell">
      <aside className="reddit-mod-rail">
        <Link href={`/r/${name}`} className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)]">
          <ChevronLeft size={17} />
          Exit mod tools
        </Link>
        <div className="mb-6 flex items-center gap-3 px-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">
            {name?.[0]?.toUpperCase() || "R"}
          </div>
          <div className="min-w-0 text-sm font-semibold">r/{name}</div>
        </div>
        <div className="mb-6 flex items-center gap-2 rounded-full bg-[var(--muted)] px-3 py-2 text-sm text-[var(--text-secondary)]">
          <Search size={16} />
          Search tools
        </div>
        {groups.map((group) => (
          <section key={group.title} className="mb-6 border-b border-[var(--border)] pb-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-secondary)]">
              {group.title}
            </div>
            <div className="space-y-1">
              {group.links.map((item) => {
                const href = item.href === "messages" ? "/messages" : `/r/${name}/${item.href}`;
                const active = pathname === href;
                const Icon = item.icon;
                return (
                  <Link key={`${group.title}-${item.label}`} href={href} className={`reddit-mod-link ${active ? "reddit-mod-link-active" : ""}`}>
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </aside>
      <main className="reddit-mod-main">{children}</main>
    </div>
  );
}
