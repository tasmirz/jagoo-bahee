"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { User, Post, Comment } from '@/lib/types';
import { backendFetch } from '@/lib/backend';
import { useAuth } from '@/lib/context/AuthContext';
import PostCard from '@/components/PostCard';
import Link from 'next/link';

export default function UserProfilePage() {
  const params = useParams();
  const username = params?.username as string;
  const { isAuthenticated } = useAuth();
  
  const [user, setUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'posts' | 'comments' | 'about'>('posts');

  useEffect(() => {
    if (!username) return;

    async function fetchUserData() {
      setLoading(true);
      try {
        // Fetch user by username
        const userRes = await backendFetch(`/users/username/${username}`);
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);

          // Fetch user's posts
          const postsRes = await backendFetch(`/users/${userData._id}/posts?limit=50`);
          if (postsRes.ok) {
            const postsData = await postsRes.json();
            setPosts(Array.isArray(postsData) ? postsData : postsData.data || []);
          }

          // Fetch user's comments
          const commentsRes = await backendFetch(`/users/${userData._id}/comments?limit=50`);
          if (commentsRes.ok) {
            const commentsData = await commentsRes.json();
            setComments(Array.isArray(commentsData) ? commentsData : commentsData.data || []);
          }
        }

        // Fetch current user if authenticated
        if (isAuthenticated) {
          const meRes = await backendFetch('/users/me/profile');
          if (meRes.ok) {
            const meData = await meRes.json();
            setCurrentUser(meData);
          }
        }
      } catch (error) {
        console.error('Failed to fetch user:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchUserData();
  }, [username, isAuthenticated]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--primary)]"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">User not found</h2>
          <Link href="/" className="text-[var(--primary)] hover:underline">
            Go back home
          </Link>
        </div>
      </div>
    );
  }

  const joinDate = new Date(user.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const isOwnProfile = currentUser && currentUser.username === user.username;
  const totalKarma = (user.postKarma || 0) + (user.commentKarma || 0);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      {/* Banner */}
      <div 
        className="h-32 bg-gradient-to-r from-[var(--primary)] to-[var(--accent)]"
        style={{
          backgroundImage: user.banner ? `url(${user.banner})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Profile Header */}
      <div className="max-w-5xl mx-auto px-4">
        <div className="relative">
          {/* Avatar */}
          <div className="absolute -top-16 left-0">
            <div className="w-32 h-32 bg-[var(--card)] border-4 border-[var(--background)] rounded-full overflow-hidden">
              {user.avatar || user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={user.avatar || user.avatarUrl} 
                  alt={user.username} 
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[var(--muted)] text-4xl font-bold">
                  {user.username[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* User Info */}
          <div className="pt-20 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold">u/{user.username}</h1>
                {user.displayName && (
                  <p className="text-lg text-[var(--text-secondary)]">{user.displayName}</p>
                )}
                {user.bio && (
                  <p className="mt-2 text-[var(--foreground)]">{user.bio}</p>
                )}
              </div>

              <div className="flex gap-2">
                {isOwnProfile ? (
                  <Link
                    href="/settings/profile"
                    className="px-4 py-2 border border-[var(--border)] rounded-full hover:bg-[var(--muted)] transition-colors"
                  >
                    Edit Profile
                  </Link>
                ) : (
                  <>
                    <Link
                      href={`/messages/new?to=${user.username}`}
                      className="px-4 py-2 border border-[var(--border)] rounded-full hover:bg-[var(--muted)] transition-colors"
                    >
                      Send Message
                    </Link>
                    <button className="px-4 py-2 bg-[var(--primary)] text-white rounded-full hover:opacity-90 transition-opacity">
                      Follow
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6 mt-4 text-sm">
              <div>
                <span className="font-semibold">{totalKarma.toLocaleString()}</span>
                <span className="text-[var(--text-secondary)] ml-1">Karma</span>
              </div>
              <div>
                <span className="font-semibold">{posts.length}</span>
                <span className="text-[var(--text-secondary)] ml-1">Posts</span>
              </div>
              <div>
                <span className="font-semibold">{comments.length}</span>
                <span className="text-[var(--text-secondary)] ml-1">Comments</span>
              </div>
              <div className="text-[var(--text-secondary)]">
                Joined {joinDate}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[var(--border)] mb-6">
          <div className="flex gap-6">
            <button
              onClick={() => setActiveTab('posts')}
              className={`px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'posts'
                  ? 'border-[var(--primary)] text-[var(--primary)] font-medium'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              Posts
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'comments'
                  ? 'border-[var(--primary)] text-[var(--primary)] font-medium'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              Comments
            </button>
            <button
              onClick={() => setActiveTab('about')}
              className={`px-4 py-3 border-b-2 transition-colors ${
                activeTab === 'about'
                  ? 'border-[var(--primary)] text-[var(--primary)] font-medium'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              About
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="pb-8">
          {activeTab === 'posts' && (
            <div className="space-y-4">
              {posts.length === 0 ? (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
                  <p className="text-[var(--text-secondary)]">No posts yet</p>
                </div>
              ) : (
                posts.map((post) => <PostCard key={post._id} post={post} />)
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-4">
              {comments.length === 0 ? (
                <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-12 text-center">
                  <p className="text-[var(--text-secondary)]">No comments yet</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment._id} className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
                    <div className="text-xs text-[var(--text-secondary)] mb-2">
                      <Link href={`/posts/${comment.postId}`} className="hover:underline">
                        View full post
                      </Link>
                    </div>
                    <p className="text-[var(--foreground)]">{comment.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[var(--text-secondary)]">
                      <span>{comment.score} points</span>
                      <span>•</span>
                      <span>{new Date(comment.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'about' && (
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-6">
              <h3 className="font-semibold text-lg mb-4">About u/{user.username}</h3>
              <div className="space-y-3 text-sm">
                {user.displayName && (
                  <div>
                    <span className="text-[var(--text-secondary)]">Display Name:</span>
                    <span className="ml-2 font-medium">{user.displayName}</span>
                  </div>
                )}
                <div>
                  <span className="text-[var(--text-secondary)]">Total Karma:</span>
                  <span className="ml-2 font-medium">{totalKarma.toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Post Karma:</span>
                  <span className="ml-2">{((user as any).postKarma || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Comment Karma:</span>
                  <span className="ml-2">{((user as any).commentKarma || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-[var(--text-secondary)]">Cake day:</span>
                  <span className="ml-2">{joinDate}</span>
                </div>
                {user.bio && (
                  <div className="mt-4 pt-4 border-t border-[var(--border)]">
                    <h4 className="font-medium mb-2">Bio</h4>
                    <p className="text-[var(--foreground)] whitespace-pre-wrap">{user.bio}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
