"use client";

import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type ThemeFamily = "default" | "forest" | "fluent" | "ocean" | "contrast";
export type DisplayMode = "system" | "light" | "dark";

export const themeFamilies: { id: ThemeFamily; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "forest", label: "Forest" },
  { id: "fluent", label: "Fluent" },
  { id: "ocean", label: "Ocean" },
  { id: "contrast", label: "High Contrast" },
];

export const displayModes: { id: DisplayMode; label: string }[] = [
  { id: "system", label: "Auto" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
];

const THEME_PREF_EVENT = "jagoo-theme-preference";

export default function ThemeToggle() {
  const initialPreference = getInitialThemePreference();
  const [family, setFamily] = useState<ThemeFamily>(initialPreference.family);
  const [mode, setMode] = useState<DisplayMode>(initialPreference.mode);
  const [resolved, setResolved] = useState(resolveTheme(initialPreference.family, initialPreference.mode));

  useEffect(() => {
    applyTheme(family, mode);
  }, [family, mode]);

  useEffect(() => {
    if (mode !== "system") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setResolved(applyTheme(family, "system"));
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, [family, mode]);

  useEffect(() => {
    function syncStoredTheme() {
      const preference = readThemePreference();
      setFamily(preference.family);
      setMode(preference.mode);
      setResolved(applyTheme(preference.family, preference.mode));
    }

    window.addEventListener(THEME_PREF_EVENT, syncStoredTheme);
    window.addEventListener("storage", syncStoredTheme);
    return () => {
      window.removeEventListener(THEME_PREF_EVENT, syncStoredTheme);
      window.removeEventListener("storage", syncStoredTheme);
    };
  }, []);

  function updateTheme(nextFamily: ThemeFamily, nextMode: DisplayMode) {
    setFamily(nextFamily);
    setMode(nextMode);
    writeThemePreference(nextFamily, nextMode);
    setResolved(applyTheme(nextFamily, nextMode));
  }

  function toggleMode() {
    const nextMode: DisplayMode = resolved.endsWith("-dark") ? "light" : "dark";
    updateTheme(family, nextMode);
  }

  const isDark = resolved.endsWith("-dark");

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

export function applyTheme(themeOrFamily: string = "default", mode?: DisplayMode) {
  const preference = mode ? normalizeThemePreference(themeOrFamily, mode) : normalizeLegacyTheme(themeOrFamily);
  const resolved = resolveTheme(preference.family, preference.mode);
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

export function readThemePreference() {
  const storedFamily = window.localStorage.getItem("jb-theme-family");
  const storedMode = window.localStorage.getItem("jb-theme-mode");

  if (storedFamily || storedMode) {
    return normalizeThemePreference(storedFamily || "default", storedMode || "system");
  }

  return normalizeLegacyTheme(window.localStorage.getItem("jb-theme") || "system");
}

function getInitialThemePreference() {
  if (typeof window === "undefined") {
    return { family: "default" as ThemeFamily, mode: "system" as DisplayMode };
  }

  return readThemePreference();
}

export function writeThemePreference(family: ThemeFamily, mode: DisplayMode) {
  window.localStorage.setItem("jb-theme-family", family);
  window.localStorage.setItem("jb-theme-mode", mode);
  window.localStorage.removeItem("jb-theme");
  window.dispatchEvent(new Event(THEME_PREF_EVENT));
}

export function resolveTheme(family: ThemeFamily, mode: DisplayMode) {
  const resolvedMode = mode === "system" ? getSystemMode() : mode;
  return `${family}-${resolvedMode}`;
}

function normalizeThemePreference(family: string, mode: string) {
  return {
    family: isThemeFamily(family) ? family : "default",
    mode: isDisplayMode(mode) ? mode : "system",
  };
}

function normalizeLegacyTheme(theme: string) {
  if (theme === "system") {
    return { family: "default" as ThemeFamily, mode: "system" as DisplayMode };
  }

  const [family, mode] = theme.split("-");
  return normalizeThemePreference(family, mode);
}

function isThemeFamily(value: string): value is ThemeFamily {
  return themeFamilies.some((item) => item.id === value);
}

function isDisplayMode(value: string): value is DisplayMode {
  return displayModes.some((item) => item.id === value);
}

function getSystemMode(): "light" | "dark" {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}
