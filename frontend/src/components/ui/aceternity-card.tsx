"use client";

import React from "react";

export function AceternityCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`group relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] ${className}`}>
      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent" />
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-[var(--primary)]/10 blur-3xl" />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
