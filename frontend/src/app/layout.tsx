import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider as LegacyAuthProvider } from "@/components/providers/auth-provider";
import { AuthProvider } from "@/lib/context/AuthContext";
import { UserProvider } from "@/lib/context/UserContext";
import { ToastProvider } from "@/lib/context/ToastContext";
import Navbar from "@/components/Navbar";
import RedditAppFrame from "@/components/RedditAppFrame";

export const metadata: Metadata = {
  title: "Jagoo Bahee",
  description: "A decentralized-identity Reddit clone",
  manifest: "/manifest.json",
};

export const dynamic = "force-dynamic";

const themeInitScript = `
(function () {
  try {
    var families = { default: true, forest: true, fluent: true, ocean: true, contrast: true };
    var modes = { system: true, light: true, dark: true };
    var family = localStorage.getItem("jb-theme-family") || "default";
    var mode = localStorage.getItem("jb-theme-mode") || "system";
    var legacy = localStorage.getItem("jb-theme");
    if ((!localStorage.getItem("jb-theme-family") || !localStorage.getItem("jb-theme-mode")) && legacy) {
      if (legacy === "system") {
        family = "default";
        mode = "system";
      } else {
        var parts = legacy.split("-");
        family = parts[0] || family;
        mode = parts[1] || mode;
      }
    }
    if (!families[family]) family = "default";
    if (!modes[mode]) mode = "system";
    var resolvedMode = mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : mode === "system" ? "light" : mode;
    document.documentElement.dataset.theme = family + "-" + resolvedMode;
  } catch (_) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <LegacyAuthProvider>
          <AuthProvider>
            <UserProvider>
              <ToastProvider>
                <Navbar />
                <RedditAppFrame>{children}</RedditAppFrame>
              </ToastProvider>
            </UserProvider>
          </AuthProvider>
        </LegacyAuthProvider>
      </body>
    </html>
  );
}
