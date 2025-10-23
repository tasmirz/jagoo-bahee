"use client";

import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { useUser } from '@/lib/context/UserContext';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAllAcknowledgements, refreshDB } from '@/lib/indexeddb';

export default function Navbar() {
  const { isAuthenticated, logout } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState('');
  const [ackCount, setAckCount] = useState<number>(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Hide search bar on /search page
  const isSearchPage = pathname === '/search';

  useEffect(() => {
    const loadCount = async () => {
      try {
        const acks = await getAllAcknowledgements();
        setAckCount(acks.length);
      } catch (error) {
        console.error('Failed to load acknowledgement count:', error);
        try {
          await refreshDB();
          const acks = await getAllAcknowledgements();
          setAckCount(acks.length);
        } catch (retryError) {
          console.error('Failed to load acknowledgements after DB refresh:', retryError);
          setAckCount(0);
        }
      }
    };

    if (isAuthenticated) {
      loadCount();
    }
  }, [isAuthenticated]);

  return (
    <nav className="sticky top-0 z-50 bg-[var(--card)] border-b border-[var(--border)] shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 relative flex-shrink-0">
              <Image src="/jagoo-bahee.png" alt="Jagoo Bahee" width={32} height={32} />
            </div>
            <span className="font-bold text-lg sm:text-xl text-[var(--foreground)] hidden xs:inline">Jagoo Bahee</span>
          </Link>

          {/* Desktop Search */}
          {!isSearchPage && (
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) {
                  router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
                  setMobileMenuOpen(false);
                }
              }}
              className="hidden md:flex flex-1 max-w-2xl mx-8"
            >
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search communities, posts..."
                className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent"
              />
            </form>
          )}

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <Link
                  href="/posts/create"
                  className="inline-flex items-center px-4 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity text-sm font-medium"
                >
                  Create Post
                </Link>
                <Link
                  href="/notifications"
                  className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors"
                  title="Notifications"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </Link>
                <div className="relative">
                  <button 
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-[var(--card)] border border-[var(--border)] rounded-md shadow-lg py-1">
                      <Link href={user?.username ? `/u/${user.username}` : '/profile'} className="block px-4 py-2 text-sm hover:bg-[var(--muted)]" onClick={() => setShowUserMenu(false)}>
                        Profile
                      </Link>
                      <Link href="/settings" className="block px-4 py-2 text-sm hover:bg-[var(--muted)]" onClick={() => setShowUserMenu(false)}>
                        Settings
                      </Link>
                      <Link href="/saved" className="block px-4 py-2 text-sm hover:bg-[var(--muted)]" onClick={() => setShowUserMenu(false)}>
                        Saved
                      </Link>
                      <Link href="/acknowledgements" className="flex items-center justify-between px-4 py-2 text-sm hover:bg-[var(--muted)]" onClick={() => setShowUserMenu(false)}>
                        <span><span className="emoji">🛡️</span> Proofs & Audit Trail</span>
                        {ackCount > 0 && (
                          <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                            {ackCount}
                          </span>
                        )}
                      </Link>
                      <hr className="my-1 border-[var(--border)]" />
                      <button
                        onClick={() => {
                          logout();
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--muted)] text-[var(--error)]"
                      >
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                href="/auth"
                className="px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity text-sm font-medium"
              >
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 hover:bg-[var(--muted)] rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-[var(--border)]">
            {/* Mobile Search - Hide on search page */}
            {!isSearchPage && (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (searchQuery.trim()) {
                    router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
                    setMobileMenuOpen(false);
                  }
                }}
                className="mb-4"
              >
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full px-4 py-2 bg-[var(--muted)] border border-[var(--border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
              </form>
            )}

            {isAuthenticated ? (
              <div className="space-y-1">
                <Link
                  href="/posts/create"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg font-medium text-[var(--primary)]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="emoji">✏️</span> Create Post
                </Link>
                <Link
                  href="/notifications"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="emoji">🔔</span> Notifications
                </Link>
                <Link
                  href={user?.username ? `/u/${user.username}` : '/profile'}
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="emoji">👤</span> Profile
                </Link>
                <Link
                  href="/settings"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="emoji">⚙️</span> Settings
                </Link>
                <Link
                  href="/saved"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="emoji">💾</span> Saved
                </Link>
                <Link
                  href="/acknowledgements"
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span><span className="emoji">🛡️</span> Proofs & Audit Trail</span>
                  {ackCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                      {ackCount}
                    </span>
                  )}
                </Link>
                <hr className="my-2 border-[var(--border)]" />
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg text-[var(--error)]"
                >
                  <span className="emoji">🚪</span> Logout
                </button>
              </div>
            ) : (
              <Link
                href="/auth"
                className="block px-4 py-3 text-center bg-[var(--primary)] text-white rounded-lg hover:opacity-90 transition-opacity font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
