"use client";

import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { useUser } from '@/lib/context/UserContext';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getAllAcknowledgements, refreshDB } from '@/lib/indexeddb';
import ThemeToggle from './theme-toggle';
import {
  Bell,
  Crown,
  FileText,
  LogOut,
  MessageCircle,
  PlusSquare,
  Settings,
  Shield,
  Shirt,
  Sparkles,
  UserCircle,
} from 'lucide-react';

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
    <nav className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur">
      <div className="px-3 sm:px-4">
        <div className="flex h-12 items-center gap-3">
          {/* Logo */}
          <Link href="/" className="flex min-w-fit shrink-0 items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="relative h-8 w-8 flex-shrink-0">
              <Image src="/jagoo-bahee.png" alt="Jagoo Bahee" width={32} height={32} />
            </div>
            <span className="hidden whitespace-nowrap text-2xl font-bold text-[var(--foreground)] sm:inline">jagoo</span>
          </Link>

          <div className="hidden shrink-0 items-center gap-1 lg:flex">
            <NavLink href="/subreddits">Communities</NavLink>
            <NavLink href="/posts/create">Create</NavLink>
            <NavLink href="/messages">Messages</NavLink>
            <NavLink href="/notifications">Notifications</NavLink>
            <NavLink href="/awards">Awards</NavLink>
            <NavLink href="/acknowledgements">Proofs</NavLink>
            <NavLink href="/admin">Admin</NavLink>
          </div>

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
              className="hidden min-w-40 flex-1 md:flex"
            >
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find anything"
                className="mx-auto w-full max-w-xl rounded-full border border-[var(--primary)] bg-[var(--background)] px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              />
            </form>
          )}

          {/* Desktop Actions */}
          <div className="ml-auto hidden shrink-0 items-center gap-2 md:flex">
            <ThemeToggle />
            {isAuthenticated ? (
              <>
                <Link
                  href="/posts/create"
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-colors hover:bg-[var(--muted)]"
                >
                  <PlusSquare size={18} />
                  Create
                </Link>
                <Link href="/messages" className="rounded-full p-2 transition-colors hover:bg-[var(--muted)]" title="Messages">
                  <MessageCircle size={20} />
                </Link>
                <Link
                  href="/notifications"
                  className="p-2 hover:bg-[var(--muted)] rounded-full transition-colors"
                  title="Notifications"
                >
                  <Bell size={20} />
                </Link>
                <div className="relative">
                  <button 
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-[var(--muted)] transition-colors hover:bg-[var(--muted-hover)]"
                  >
                    <UserCircle size={24} />
                  </button>
                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-2 shadow-2xl">
                      <MenuLink href={user?.username ? `/u/${user.username}` : '/profile'} icon={<UserCircle size={21} />} onClick={() => setShowUserMenu(false)}>
                        <span>
                          <span className="block">View Profile</span>
                          <span className="block text-xs text-[var(--text-secondary)]">u/{user?.username || 'me'}</span>
                        </span>
                      </MenuLink>
                      <MenuLink href="/settings/profile" icon={<Shirt size={21} />} onClick={() => setShowUserMenu(false)}>Edit Avatar</MenuLink>
                      <MenuLink href="/saved" icon={<FileText size={21} />} onClick={() => setShowUserMenu(false)}>Saved</MenuLink>
                      <MenuLink href="/awards" icon={<Crown size={21} />} onClick={() => setShowUserMenu(false)}>Awards</MenuLink>
                      <div className="flex items-center justify-between px-4 py-3 text-sm">
                        <span className="flex items-center gap-4"><Sparkles size={21} /> Display Mode</span>
                        <ThemeToggle />
                      </div>
                      <MenuLink href="/admin" icon={<Settings size={21} />} onClick={() => setShowUserMenu(false)}>Server Admin</MenuLink>
                      <MenuLink href="/acknowledgements" icon={<Shield size={21} />} onClick={() => setShowUserMenu(false)}>
                        <span className="flex w-full items-center justify-between">
                          <span>Proofs & Audit Trail</span>
                          {ackCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{ackCount}</span>}
                        </span>
                      </MenuLink>
                      <hr className="my-2 border-[var(--border)]" />
                      <button
                        onClick={() => {
                          logout();
                          setShowUserMenu(false);
                        }}
                        className="flex w-full items-center gap-4 px-4 py-3 text-left text-sm hover:bg-[var(--muted)] text-[var(--error)]"
                      >
                        <LogOut size={21} />
                        Logout
                      </button>
                      <hr className="my-2 border-[var(--border)]" />
                      <MenuLink href="/settings" icon={<Settings size={21} />} onClick={() => setShowUserMenu(false)}>Settings</MenuLink>
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
            className="ml-auto rounded-lg p-2 transition-colors hover:bg-[var(--muted)] md:hidden"
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
                <div className="flex px-4 py-2">
                  <ThemeToggle />
                </div>
                <Link
                  href="/subreddits"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Communities
                </Link>
                <Link
                  href="/posts/create"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg font-medium text-[var(--primary)]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="emoji">✏️</span> Create Post
                </Link>
                <Link
                  href="/messages"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Messages
                </Link>
                <Link
                  href="/notifications"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="emoji">🔔</span> Notifications
                </Link>
                <Link
                  href="/awards"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Awards
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
                  href="/admin"
                  className="block px-4 py-3 text-sm hover:bg-[var(--muted)] rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Server Admin
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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium hover:bg-[var(--muted)]">
      {children}
    </Link>
  );
}

function MenuLink({
  href,
  icon,
  children,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <Link href={href} className="flex items-center gap-4 px-4 py-3 text-sm hover:bg-[var(--muted)]" onClick={onClick}>
      <span className="shrink-0 text-[var(--text-secondary)]">{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}
