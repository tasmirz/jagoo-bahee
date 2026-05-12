'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/components/providers/auth-provider';

export default function Navbar() {
  const { isAuthenticated, logout, publicKey } = useAuth();
  
  const shortPubKey = publicKey ? `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}` : '';

  return (
    <nav className="sticky top-0 z-50 bg-[var(--card)] border-b border-[var(--border)] px-4 py-2">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/jagoo-bahee.svg"
              alt="Logo"
              width={32}
              height={32}
            />
            <span className="font-bold text-lg hidden sm:inline">
              jagoo-bahee
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/subreddits"
            className="text-sm font-medium hover:text-[var(--primary)]"
          >
            Communities
          </Link>
          {isAuthenticated && publicKey ? (
            <div className="flex items-center gap-4">
              <Link
                href={`/u/${publicKey}`}
                className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                👤 {shortPubKey}
              </Link>
              <Link
                href="/profile"
                className="text-sm font-medium hover:text-[var(--primary)]"
              >
                Profile
              </Link>
              <Link
                href="/settings"
                className="text-sm font-medium hover:text-[var(--primary)]"
              >
                Settings
              </Link>
              <button
                onClick={logout}
                className="text-sm font-medium hover:text-red-500"
              >
                Logout
              </button>
            </div>
          ) : (
            <Link
              href="/auth"
              className="px-4 py-1.5 bg-[var(--primary)] text-white rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}