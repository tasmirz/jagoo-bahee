"use client";

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Subreddit, Post } from '@/lib/types';
import { backendFetch } from '@/lib/backend';
import PostCard from '@/components/PostCard';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { useUser } from '@/lib/context/UserContext';
import { BarChart3, Flag, ListChecks, Plus, Shield, Users } from 'lucide-react';
import CommunitySidebar from '@/components/CommunitySidebar';

export default function SubredditPage() {
  const params = useParams();
  const name = params?.name as string;
  const { isAuthenticated } = useAuth();
  const { user } = useUser();
  
  const [subreddit, setSubreddit] = useState<Subreddit | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'new' | 'top'>('new');
  const [timeRange, setTimeRange] = useState<'hour' | 'day' | 'week' | 'month' | 'year' | 'all'>('day');
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  const fetchAttachmentUrl = useCallback(async (attachmentId: string, type: 'icon' | 'banner') => {
    try {
      const presignedResponse = await backendFetch(`/attachments/${attachmentId}/presigned-get`);
      if (presignedResponse.ok) {
        const { url } = await presignedResponse.json();
        if (type === 'icon') {
          setIconUrl(url);
        } else {
          setBannerUrl(url);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch ${type} URL:`, error);
    }
  }, []);

  const checkMembership = useCallback(async (subredditId: string) => {
    try {
      const response = await backendFetch('/users/me/subreddits');
      if (response.ok) {
        const joinedSubs = await response.json() as Array<{ _id?: string; name?: string }>;
        const isMember = joinedSubs.some((sub) => sub._id === subredditId || sub.name === name);
        setIsJoined(isMember);
      }
    } catch (error) {
      console.error('Failed to check membership:', error);
    }
  }, [name]);

  const checkModeratorStatus = useCallback(async (subredditId: string) => {
    if (!user || !user._id) {
      return;
    }

    try {
      const response = await backendFetch(`/subreddits/${subredditId}/is-moderator`);

      if (response.ok) {
        const data = await response.json();

        setIsCreator(!!data.isCreator);
        setIsModerator(!!data.isModerator || !!data.isCreator);
      } else {
        setIsModerator(false);
        setIsCreator(false);
      }
    } catch (error) {
      console.error('[checkModeratorStatus] Failed to check moderator status:', error);
      setIsModerator(false);
      setIsCreator(false);
    }
  }, [user]);

  useEffect(() => {
    if (!name) return;

    async function fetchData() {
      setLoading(true);
      try {
        // Fetch subreddit info
        const subRes = await backendFetch(`/subreddits/${name}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubreddit(subData);
          
          // Fetch icon and banner URLs if they exist
          if (subData.iconAttachmentId) {
            fetchAttachmentUrl(subData.iconAttachmentId, 'icon');
          }
          if (subData.bannerAttachmentId) {
            fetchAttachmentUrl(subData.bannerAttachmentId, 'banner');
          }
          
          // Check if user has joined this subreddit
          if (isAuthenticated) {
            checkMembership(subData._id);
            checkModeratorStatus(subData._id);
          }
        }

        // Fetch posts with sort parameter
        const params = new URLSearchParams({
          subreddit: name,
          limit: '10',
          skip: '0',
          sort: sortBy,
        });
        
        if (sortBy === 'top') {
          params.append('time', timeRange);
        }
        
        const postsRes = await backendFetch(`/posts?${params}`);
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setPosts(Array.isArray(postsData) ? postsData : postsData.data || []);
        }
      } catch (error) {
        console.error('Failed to fetch:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [name, sortBy, timeRange, isAuthenticated, fetchAttachmentUrl, checkMembership, checkModeratorStatus]);

  const handleJoinLeave = async () => {
    if (!subreddit || !isAuthenticated) return;

    setIsJoining(true);
    try {
      const endpoint = isJoined 
        ? `/subreddits/${subreddit._id}/leave` 
        : `/subreddits/${subreddit._id}/join`;
      
      const response = await backendFetch(endpoint, {
        method: 'POST',
      });

      if (response.ok) {
        setIsJoined(!isJoined);
        
        // Refetch subreddit data to get accurate member count from backend
        const subRes = await backendFetch(`/subreddits/${name}`);
        if (subRes.ok) {
          const subData = await subRes.json();
          setSubreddit(subData);
        }
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'Failed to update membership');
      }
    } catch (error) {
      console.error('Failed to join/leave:', error);
      alert('Failed to update membership');
    } finally {
      setIsJoining(false);
    }
  };

  const handleTransferOwnership = async (newOwnerUsername: string) => {
    if (!subreddit) return;

    try {
      // First, find the user by username
      const userRes = await backendFetch(`/users/username/${newOwnerUsername}`);
      if (!userRes.ok) {
        alert('User not found. Please check the username and try again.');
        return;
      }

      const newOwner = await userRes.json();
      
      // Transfer ownership via backend endpoint
      const response = await backendFetch(`/subreddits/${subreddit._id}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newOwnerId: newOwner._id }),
      });

      if (response.ok) {
        alert(`✅ Ownership transferred to u/${newOwnerUsername} successfully!`);
        window.location.reload(); // Reload to update permissions
      } else {
        const errorData = await response.json();
        alert(`Failed to transfer ownership: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to transfer ownership:', error);
      alert('Failed to transfer ownership. Please try again.');
    }
  };

  const handleDeleteSubreddit = async () => {
    if (!subreddit) return;

    try {
      const response = await backendFetch(`/subreddits/${subreddit._id}`, {
        method: 'DELETE',
      });

      if (response.ok || response.status === 204) {
        alert('✅ Subreddit deleted successfully.');
        window.location.href = '/'; // Redirect to home
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Failed to delete subreddit: ${errorData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Failed to delete subreddit:', error);
      alert('Failed to delete subreddit. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  if (!subreddit) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Subreddit not found</h2>
          <Link href="/" className="text-[var(--primary)] hover:underline">
            Go back home
          </Link>
        </div>
      </div>
    );
  }

  const rules = Array.isArray(subreddit.rules) ? subreddit.rules : (subreddit.rules || '').split('\n').filter(Boolean);
  const canManage = isModerator || isCreator;
  const communityLinks = [
    { href: `/r/${name}/members`, label: 'Members', icon: Users },
    { href: `/r/${name}/stats`, label: 'Stats', icon: BarChart3 },
    { href: `/r/${name}/reports`, label: 'Reports', icon: Flag },
    { href: `/r/${name}/modlog`, label: 'Mod Log', icon: ListChecks },
  ];
  return (
    <div className="reddit-community-page">
      {/* Banner */}
      <div 
        className="reddit-community-inner h-20 rounded-b-lg bg-gradient-to-r from-[var(--primary)] to-[var(--warning)] sm:h-32"
        style={{
          backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Subreddit Header */}
      <div>
        <div className="reddit-community-inner px-3">
          <div className="flex flex-col gap-4 pb-4 sm:flex-row sm:items-end">
            {/* Icon */}
            <div className="-mt-8 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-[var(--background)] bg-[var(--card)] shadow-lg sm:h-24 sm:w-24">
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconUrl} alt={subreddit.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl font-bold text-[var(--primary)]">{(subreddit?.name?.[0] ?? 'r').toUpperCase()}</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pb-2">
              <h1 className="text-3xl font-bold">r/{subreddit?.name || 'Community'}</h1>
              <p className="text-sm text-[var(--text-secondary)]">{subreddit?.displayName || ''}</p>
            </div>

            {/* Primary actions */}
            <div className="flex items-center gap-2 pb-2">
              {isAuthenticated ? (
                <>
                <Link
                  href={`/r/${name}/create`}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--border)] px-4 text-sm font-semibold hover:bg-[var(--muted)]"
                >
                  <Plus size={17} />
                  Create Post
                </Link>
                {isModerator && (
                  <Link
                    href={`/r/${name}/mod`}
                    className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:opacity-90"
                  >
                    <Shield size={17} />
                    Mod Tools
                  </Link>
                )}
                <button
                  onClick={handleJoinLeave}
                  disabled={isJoining}
                  className={`px-6 py-2 rounded-full font-medium transition-colors ${
                    isJoined
                      ? 'bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--error)] hover:text-white'
                      : 'bg-[var(--primary)] text-white hover:opacity-90'
                  } ${isJoining ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isJoining ? 'Loading...' : isJoined ? 'Joined' : 'Join'}
                </button>
                </>
              ) : (
                <Link
                  href="/auth"
                  className="inline-flex h-10 items-center rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:opacity-90"
                >
                  Log In to Join
                </Link>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 pb-4 text-sm">
            <div>
              <span className="font-semibold">{(subreddit?.memberCount ?? 0).toLocaleString()}</span>
              <span className="text-[var(--text-secondary)] ml-1">members</span>
            </div>
            <div>
              <span className="font-semibold">{(subreddit?.postCount ?? 0).toLocaleString()}</span>
              <span className="text-[var(--text-secondary)] ml-1">posts</span>
            </div>
            {subreddit?.isNsfw && (
              <span className="px-2 py-1 bg-[var(--error)] text-white text-xs rounded">NSFW</span>
            )}
          </div>
        </div>
      </div>

      {/* Community navigation */}
      <div>
        <div className="reddit-community-inner flex gap-2 overflow-x-auto border-b border-[var(--border)] px-3 py-2">
          <Link href={`/r/${name}`} className="whitespace-nowrap border-b-2 border-[var(--primary)] px-3 py-2 text-sm font-medium text-[var(--primary)]">
            Posts
          </Link>
          {communityLinks.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]">
                <Icon size={16} />
                {item.label}
              </Link>
            );
          })}
          {canManage && (
            <Link href={`/r/${name}/mod`} className="inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-[var(--primary)] hover:bg-[var(--muted)]">
              <Shield size={16} />
              Mod Tools
            </Link>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="reddit-community-inner px-3 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Posts */}
          <div className="lg:col-span-2 space-y-4">
            {/* Sort Bar */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-3">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Sort Options */}
                <div className="flex gap-1">
                  <button
                    onClick={() => setSortBy('new')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      sortBy === 'new'
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    ✨ New
                  </button>
                  <button
                    onClick={() => setSortBy('top')}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      sortBy === 'top'
                        ? 'bg-[var(--primary)] text-white'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--muted)]'
                    }`}
                  >
                    ⬆️ Top
                  </button>
                </div>

                {/* Time Range (for Top) */}
                {sortBy === 'top' && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-secondary)]">from</span>
                    <select
                      value={timeRange}
                      onChange={(e) => setTimeRange(e.target.value as typeof timeRange)}
                      className="px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    >
                      <option value="hour">Past Hour</option>
                      <option value="day">Past 24 Hours</option>
                      <option value="week">Past Week</option>
                      <option value="month">Past Month</option>
                      <option value="year">Past Year</option>
                      <option value="all">All Time</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Posts List */}
            {posts.length === 0 ? (
              <div className="py-28 text-center">
                <h3 className="text-2xl font-semibold text-[var(--foreground)]">This community doesn&apos;t have any posts yet</h3>
                <p className="mb-5 mt-2 text-[var(--primary)]">Make one and get this feed started.</p>
                <Link
                  href={`/r/${name}/create`}
                  className="inline-block rounded-full bg-[var(--primary)] px-6 py-2 text-sm font-bold text-white hover:opacity-90"
                >
                  Create Post
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {posts.map((post) => <PostCard key={post._id} post={post} />)}
              </div>
            )}
          </div>

          <div>
            <CommunitySidebar name={name} subreddit={subreddit} rules={rules} canManage={canManage} />
            {/* Creator Tools - Only for Creators */}
            {isCreator && (
              <div className="reddit-side-card mt-3">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-[var(--primary)]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <h3 className="font-bold text-[var(--foreground)]">Creator Tools</h3>
              </div>
              <div className="space-y-2">
                <button
                onClick={() => {
                  if (confirm('⚠️ WARNING: Transfer ownership will give another user full control of this subreddit. This action cannot be undone. Are you sure?')) {
                  const newOwner = prompt('Enter the username of the new owner:');
                  if (newOwner) {
                    handleTransferOwnership(newOwner);
                  }
                  }
                }}
                className="w-full px-4 py-2 bg-[var(--muted)] hover:bg-[var(--border)] rounded-md transition-colors text-sm font-medium text-[var(--foreground)] text-left"
                >
                🔄 Transfer Ownership
                </button>
                <button
                onClick={() => {
                  if (confirm('⚠️ DANGER: This will permanently delete the entire subreddit, including all posts, comments, and members. This action CANNOT be undone!\n\nType the subreddit name to confirm.')) {
                  const confirmation = prompt(`Type "${subreddit.name}" to confirm deletion:`);
                  if (confirmation === subreddit.name) {
                    handleDeleteSubreddit();
                  } else if (confirmation) {
                    alert('Confirmation failed. Subreddit name did not match.');
                  }
                  }
                }}
                className="w-full px-4 py-2 bg-[var(--error)] hover:opacity-90 rounded-md transition-colors text-sm font-medium text-white text-left"
                >
                🗑️ Delete Subreddit
                </button>
              </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
