'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import backend from '@/lib/backend';
import { getToken } from '@/lib/auth';
import { Post, Subreddit, User } from '@/lib/types';

export default function MyProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const token = getToken();
        if (!token) {
          router.push('/auth');
          return;
        }

        const meRes = await backend.backendFetch('/users/me/profile');
        if (!meRes.ok) throw new Error('Failed to load profile');

        const me = await meRes.json();
        setUser(me);

        const postsRes = await backend.backendFetch(`/posts?authorId=${me._id}&limit=20`);
        if (postsRes.ok) {
          const postsData = await postsRes.json();
          setPosts(Array.isArray(postsData) ? postsData : []);
        }
      } catch (e) {
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;
  if (!user) return <div className="p-8 text-center">Profile unavailable.</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">u/{user.username}</h1>
            {user.bio ? (
              <p className="text-sm text-[var(--text-secondary)] mt-1">{user.bio}</p>
            ) : (
              <p className="text-sm text-[var(--text-secondary)] mt-1">No bio set yet.</p>
            )}
          </div>
          <Link
            href="/settings"
            className="px-4 py-2 rounded-full border border-[var(--border)] text-sm font-medium hover:bg-[var(--muted)]"
          >
            Edit Profile
          </Link>
        </div>
        <div className="mt-4 text-sm text-[var(--text-secondary)]">
          <span className="mr-4"><strong className="text-[var(--foreground)]">{user.postKarma}</strong> post karma</span>
          <span><strong className="text-[var(--foreground)]">{user.commentKarma}</strong> comment karma</span>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4">Recent Posts</h2>
        {posts.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] italic">No posts yet.</p>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <div key={post._id} className="border border-[var(--border)] rounded-lg p-4">
                <div className="text-xs text-[var(--text-secondary)] mb-1">
                  Posted in r/{(post.subredditId as Subreddit)?.name ?? 'unknown'}
                </div>
                <Link href={`/p/${post._id}`} className="font-medium hover:underline">
                  {post.title}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
