"use client";

import React, { useEffect, useState } from "react";
import { Palette } from "lucide-react";

export const themes = [
  { id: "system", label: "System" },
  { id: "default-light", label: "Default Light" },
  { id: "default-dark", label: "Default Dark" },
  { id: "forest-light", label: "Forest Light" },
  { id: "forest-dark", label: "Forest Dark" },
  { id: "ocean-light", label: "Ocean Light" },
  { id: "ocean-dark", label: "Ocean Dark" },
  { id: "contrast-light", label: "Contrast Light" },
  { id: "contrast-dark", label: "Contrast Dark" },
];

export default function ThemeToggle() {
  const [theme, setTheme] = useState("system");

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

  return (
    <label className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-sm">
      <Palette size={15} />
      <select
        value={theme}
        onChange={(event) => updateTheme(event.target.value)}
        className="bg-transparent text-sm outline-none"
        aria-label="Theme"
      >
        {themes.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function applyTheme(theme: string) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = theme;
  }
}
