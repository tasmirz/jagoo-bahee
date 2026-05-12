"use client";

import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export const themes = [
  { id: "system", label: "System" },
  { id: "default-light", label: "Default Light" },
  { id: "default-dark", label: "Default Dark" },
  { id: "forest-light", label: "Forest Light" },
  { id: "forest-dark", label: "Forest Dark" },
  { id: "fluent-light", label: "Fluent Light" },
  { id: "fluent-dark", label: "Fluent Dark" },
  { id: "ocean-light", label: "Ocean Light" },
  { id: "ocean-dark", label: "Ocean Dark" },
  { id: "contrast-light", label: "Contrast Light" },
  { id: "contrast-dark", label: "Contrast Dark" },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState("default-light");

  useEffect(() => {
    const stored = window.localStorage.getItem("jb-theme") || "system";
    setTheme(stored);
    applyTheme(stored);
  }, []);

  function updateTheme(next: string) {
    setTheme(next);
    window.localStorage.setItem("jb-theme", next);
    applyTheme(next);
  }

  function toggleMode() {
    const current = theme === "system" ? getSystemTheme() : theme;
    const family = current.endsWith("-dark") ? current.slice(0, -5) : current.endsWith("-light") ? current.slice(0, -6) : "default";
    const next = current.endsWith("-dark") ? `${family}-light` : `${family}-dark`;
    updateTheme(next);
  }

  const isDark = (theme === "system" ? getSystemTheme() : theme).endsWith("-dark");

  return (
    <button
      type="button"
      onClick={toggleMode}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"
      aria-label={isDark ? "Use light mode" : "Use dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

export function applyTheme(theme: string) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function getSystemTheme() {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "default-dark";
  }
  return "default-light";
}
