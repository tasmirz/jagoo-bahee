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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
