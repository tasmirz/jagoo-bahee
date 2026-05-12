import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import "./globals.css";
import { AuthProvider } from "@/components/providers/auth-provider";
import Navbar from "@/components/navbar";

export const metadata: Metadata = {
  title: "Jagoo Bahee",
  description: "A decentralized-identity Reddit clone",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
