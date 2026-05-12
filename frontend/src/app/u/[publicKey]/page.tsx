'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import backend from '@/lib/backend';
import { User, Post, Subreddit } from '@/lib/types';

export default function UserProfile() {
  const params = useParams();
  const publicKey = params.publicKey as string;
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const userRes = await backend.backendFetch(`/users/by-public-key/${publicKey}`);
        if (userRes.ok) {
          const userData = await userRes.json();
          setUser(userData);

          const postsRes = await backend.backendFetch(`/posts?authorId=${userData._id}&limit=20`);
          if (postsRes.ok) {
            const postsData = await postsRes.json();
            setPosts(Array.isArray(postsData) ? postsData : []);
          }
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [publicKey]);

  if (loading) return <div className="p-8 text-center">Loading profile...</div>;
  if (!user) return <div className="p-8 text-center">User not found.</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 py-8">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-8 text-center flex flex-col items-center mb-8">
        <div className="w-24 h-24 bg-gray-200 dark:bg-gray-800 rounded-full flex items-center justify-center text-4xl mb-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="avatar" className="w-full h-full rounded-full object-cover" />
          ) : (
            <span>👤</span>
          )}
        </div>
        <h1 className="text-2xl font-bold mb-1">u/{user.username}</h1>
        {user.bio && <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md">{user.bio}</p>}
        <div className="flex gap-6 text-sm">
          <div><span className="font-bold">{user.postKarma}</span> <span className="text-[var(--text-secondary)]">post karma</span></div>
          <div><span className="font-bold">{user.commentKarma}</span> <span className="text-[var(--text-secondary)]">comment karma</span></div>
        </div>
        <div className="text-xs text-[var(--text-secondary)] mt-4">
          Joined {new Date(user.createdAt).toLocaleDateString()}
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">Posts</h2>
      {posts.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] italic">No posts yet.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post._id} className="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)] hover:border-[var(--text-secondary)] transition-colors">
              <div className="text-xs text-[var(--text-secondary)] mb-2">
                <span>Posted in r/{(post.subredditId as Subreddit)?.name ?? 'unknown'}</span>
                <span className="mx-1">•</span>
                <span>{new Date(post.createdAt).toLocaleDateString()}</span>
              </div>
              <Link href={`/p/${post._id}`} className="text-lg font-medium hover:underline block mb-1">{post.title}</Link>
              <div className="text-xs text-[var(--text-secondary)]">{post.score} points</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
