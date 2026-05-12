"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Subreddit, Post } from '@/lib/types';
import { backendFetch, getBackendOrigin } from '@/lib/backend';
import PostCard from '@/components/PostCard';
import Link from 'next/link';
import { useAuth } from '@/lib/context/AuthContext';
import { useUser } from '@/lib/context/UserContext';

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
  const [userStatusFlags, setUserStatusFlags] = useState<number>(0);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

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
  }, [name, sortBy, timeRange, isAuthenticated]);

  const fetchAttachmentUrl = async (attachmentId: string, type: 'icon' | 'banner') => {
    try {
      const response = await backendFetch(`/attachments/${attachmentId}`);
      if (response.ok) {
        const attachment = await response.json();
        
        // Get a presigned URL from the backend
        const presignedResponse = await backendFetch(`/attachments/${attachmentId}/presigned-get`);
        if (presignedResponse.ok) {
          const { url } = await presignedResponse.json();
          if (type === 'icon') {
            setIconUrl(url);
          } else {
            setBannerUrl(url);
          }
        }
      }
    } catch (error) {
      console.error(`Failed to fetch ${type} URL:`, error);
    }
  };

  const checkMembership = async (subredditId: string) => {
    try {
      const response = await backendFetch('/users/me/subreddits');
      if (response.ok) {
        const joinedSubs = await response.json();
        const isMember = joinedSubs.some((sub: any) => sub._id === subredditId || sub.name === name);
        setIsJoined(isMember);
      }
    } catch (error) {
      console.error('Failed to check membership:', error);
    }
  };

  const checkModeratorStatus = async (subredditId: string) => {
    if (!user || !user._id) {
      console.log('[checkModeratorStatus] No user or user ID, skipping');
      return;
    }
    
    console.log('[checkModeratorStatus] Checking for subreddit:', subredditId, 'user:', user._id);
    
    try {
      // Use the is-moderator endpoint which now returns full status
      const response = await backendFetch(`/subreddits/${subredditId}/is-moderator`);
      console.log('[checkModeratorStatus] Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[checkModeratorStatus] Response data:', data);
        
        setUserStatusFlags(data.statusFlags || 0);
        setIsCreator(data.isCreator || false);
        setIsModerator(data.isModerator || false);
        
        console.log('[checkModeratorStatus] State updated:', { 
          subredditId, 
          userId: user._id,
          statusFlags: data.statusFlags,
          isCreator: data.isCreator,
          isModerator: data.isModerator,
          isBanned: data.isBanned
        });
      } else {
        console.log('[checkModeratorStatus] Response not OK, setting to false');
        setIsModerator(false);
        setIsCreator(false);
        setUserStatusFlags(0);
      }
    } catch (error) {
      console.error('[checkModeratorStatus] Failed to check moderator status:', error);
      setIsModerator(false);
      setIsCreator(false);
      setUserStatusFlags(0);
    }
  };

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

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Banner */}
      <div 
        className="h-32 sm:h-48 bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]"
        style={{
          backgroundImage: bannerUrl ? `url(${bannerUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Subreddit Header */}
      <div className="bg-[var(--card)] border-b border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-end gap-4 -mt-4 pb-4">
            {/* Icon */}
            <div className="w-20 h-20 bg-[var(--card)] border-4 border-[var(--background)] rounded-full overflow-hidden flex items-center justify-center shadow-lg">
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconUrl} alt={subreddit.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-bold text-[var(--primary)]">{(subreddit?.name?.[0] ?? 'r').toUpperCase()}</span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 pb-2">
              <h1 className="text-2xl font-bold">r/{subreddit?.name || 'Community'}</h1>
              <p className="text-sm text-[var(--text-secondary)]">{subreddit?.displayName || ''}</p>
            </div>

            {/* Join Button */}
            {isAuthenticated && (
              <div className="flex items-center gap-3">
                {isModerator && (
                  <Link
                    href={`/r/${name}/mod`}
                    className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity font-medium"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M9.504 1.132a1 1 0 01.992 0l1.75 1a1 1 0 11-.992 1.736L10 3.152l-1.254.716a1 1 0 11-.992-1.736l1.75-1zM5.618 4.504a1 1 0 01-.372 1.364L5.016 6l.23.132a1 1 0 11-.992 1.736L4 7.723V8a1 1 0 01-2 0V6a.996.996 0 01.52-.878l1.734-.99a1 1 0 011.364.372zm8.764 0a1 1 0 011.364-.372l1.733.99A1.002 1.002 0 0118 6v2a1 1 0 11-2 0v-.277l-.254.145a1 1 0 11-.992-1.736l.23-.132-.23-.132a1 1 0 01-.372-1.364zm-7 4a1 1 0 011.364-.372L10 8.848l1.254-.716a1 1 0 11.992 1.736L11 10.58V12a1 1 0 11-2 0v-1.42l-1.246-.712a1 1 0 01-.372-1.364zM3 11a1 1 0 011 1v1.42l1.246.712a1 1 0 11-.992 1.736l-1.75-1A1 1 0 012 14v-2a1 1 0 011-1zm14 0a1 1 0 011 1v2a1 1 0 01-.504.868l-1.75 1a1 1 0 11-.992-1.736L16 13.42V12a1 1 0 011-1zm-9.618 5.504a1 1 0 011.364-.372l.254.145V16a1 1 0 112 0v.277l.254-.145a1 1 0 11.992 1.736l-1.735.992a.995.995 0 01-1.022 0l-1.735-.992a1 1 0 01-.372-1.364z" clipRule="evenodd" />
                    </svg>
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
              </div>
            )}
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

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
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
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
                <h3 className="text-xl font-semibold mb-2">No posts yet</h3>
                <p className="text-[var(--text-secondary)] mb-4">Be the first to post in this community!</p>
                <Link
                  href="/posts/create"
                  className="inline-block px-6 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity"
                >
                  Create Post
                </Link>
              </div>
            ) : (
              posts.map((post) => <PostCard key={post._id} post={post} />)
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Moderator Tools */}
            {isModerator && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
              <div className="flex items-center gap-2 mb-3">
                <svg className="w-5 h-5 text-[var(--primary)]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M9.504 1.132a1 1 0 01.992 0l1.75 1a1 1 0 11-.992 1.736L10 3.152l-1.254.716a1 1 0 11-.992-1.736l1.75-1zM5.618 4.504a1 1 0 01-.372 1.364L5.016 6l.23.132a1 1 0 11-.992 1.736L4 7.723V8a1 1 0 01-2 0V6a.996.996 0 01.52-.878l1.734-.99a1 1 0 011.364.372zm8.764 0a1 1 0 011.364-.372l1.733.99A1.002 1.002 0 0118 6v2a1 1 0 11-2 0v-.277l-.254.145a1 1 0 11-.992-1.736l.23-.132-.23-.132a1 1 0 01-.372-1.364zm-7 4a1 1 0 011.364-.372L10 8.848l1.254-.716a1 1 0 11.992 1.736L11 10.58V12a1 1 0 11-2 0v-1.42l-1.246-.712a1 1 0 01-.372-1.364zM3 11a1 1 0 011 1v1.42l1.246.712a1 1 0 11-.992 1.736l-1.75-1A1 1 0 012 14v-2a1 1 0 011-1zm14 0a1 1 0 011 1v2a1 1 0 01-.504.868l-1.75 1a1 1 0 11-.992-1.736L16 13.42V12a1 1 0 011-1zm-9.618 5.504a1 1 0 011.364-.372l.254.145V16a1 1 0 112 0v.277l.254-.145a1 1 0 11.992 1.736l-1.735.992a.995.995 0 01-1.022 0l-1.735-.992a1 1 0 01-.372-1.364z" clipRule="evenodd" />
                </svg>
                <h3 className="font-bold text-[var(--foreground)]">Moderator Tools</h3>
              </div>
              <div className="space-y-2">
                <Link
                href={`/r/${name}/mod/queue`}
                className="block px-4 py-2 bg-[var(--muted)] hover:bg-[var(--border)] rounded-md transition-colors text-sm font-medium text-[var(--foreground)]"
                >
                📥 Mod Queue
                </Link>
                <Link
                href={`/r/${name}/mod/settings`}
                className="block px-4 py-2 bg-[var(--muted)] hover:bg-[var(--border)] rounded-md transition-colors text-sm font-medium text-[var(--foreground)]"
                >
                ⚙️ Settings
                </Link>
                <Link
                href={`/r/${name}/mod`}
                className="block px-4 py-2 bg-[var(--muted)] hover:bg-[var(--border)] rounded-md transition-colors text-sm font-medium text-[var(--foreground)]"
                >
                🛡️ All Mod Tools
                </Link>
              </div>
              </div>
            )}

            {/* Creator Tools - Only for Creators */}
            {isCreator && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
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

            {/* About */}
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
              <h3 className="font-semibold mb-3 text-[var(--foreground)]">About Community</h3>
              {subreddit.description && (
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                {subreddit.description}
              </p>
              )}
              <div className="text-xs text-[var(--text-secondary)] mb-4">
              Created {subreddit?.createdAt ? new Date(subreddit.createdAt).toLocaleDateString() : 'recently'}
              </div>
              {isAuthenticated && (
              <Link
                href={`/posts/create?subreddit=${subreddit?._id || ''}`}
                className="block w-full px-4 py-2 bg-[var(--primary)] text-white text-center rounded-md hover:opacity-90 transition-opacity"
              >
                Create Post
              </Link>
              )}
            </div>

            {/* Rules */}
            {subreddit?.rules && (Array.isArray(subreddit.rules) ? subreddit.rules : subreddit.rules.split('\n').filter(Boolean)).length > 0 && (
              <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
                <h3 className="font-semibold mb-3">Rules</h3>
                <ol className="space-y-2 text-sm">
                  {(Array.isArray(subreddit.rules) ? subreddit.rules : subreddit.rules.split('\n').filter(Boolean)).map((rule, index) => (
                    <li key={index} className="text-[var(--text-secondary)]">
                      {index + 1}. {rule}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
