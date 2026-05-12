import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider as LegacyAuthProvider } from "@/components/providers/auth-provider";
import { AuthProvider } from "@/lib/context/AuthContext";
import { UserProvider } from "@/lib/context/UserContext";
import { ToastProvider } from "@/lib/context/ToastContext";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "Jagoo Bahee",
  description: "A decentralized-identity Reddit clone",
  manifest: "/manifest.json",
};

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
                <main>{children}</main>
              </ToastProvider>
            </UserProvider>
          </AuthProvider>
        </LegacyAuthProvider>
      </body>
    </html>
  );
}
