"use client";

import { useEffect, useState } from "react";
import PostCard from "./PostCard";

type ApiPost = any; // intentionally loose until strict shapes are stabilized

function timeAgo(iso?: string | number) {
    if (!iso) return "";
    const then = typeof iso === "number" ? new Date(iso) : new Date(iso);
    const sec = Math.floor((Date.now() - then.getTime()) / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
}

export default function PostList({ filterSubreddit }: { filterSubreddit?: string }) {
    const [posts, setPosts] = useState<ApiPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;
        const ctrl = new AbortController();

    async function load() {
            setLoading(true);
            setError(null);
            try {
        const qs = new URLSearchParams({ limit: '50', skip: '0' })
        if (filterSubreddit) qs.set('subreddit', String(filterSubreddit))
                const res = await (await import('@/lib/backend')).backendFetch(`/posts?${qs.toString()}`, { signal: ctrl.signal });
                if (!res.ok) throw new Error(`Failed to load posts (${res.status})`);
                const body = await res.json();
                if (!mounted) return;
                // map server posts to the PostCard shape safely
                const mapped = (Array.isArray(body) ? body : (body.posts || [])).map((p: ApiPost) => ({
                    id: p._id || p.id,
                    community: p.subredditName || (p.subreddit && p.subreddit.name) || "r/unknown",
                    title: p.title,
                    excerpt: p.excerpt || (p.content ? String(p.content).slice(0, 240) : ""),
                    votes: typeof p.score === "number" ? p.score : (typeof p.votes === "number" ? p.votes : 0),
                    comments: p.commentCount ?? p.commentsCount ?? p.comments ?? 0,
                    age: timeAgo(p.createdAt || p.created_at || p.createdAtISO),
                    myVote: (typeof p.myVote === "number" ? p.myVote : (p.myVote === undefined ? 0 : p.myVote)),
                    upvoteCount: p.upvoteCount ?? p.upvotes ?? 0,
                    downvoteCount: p.downvoteCount ?? p.downvotes ?? 0,
                }));
                setPosts(mapped);
            } catch (e: any) {
                if (e.name === "AbortError") return;
                console.error(e);
                setError(e.message || String(e));
            } finally {
                if (mounted) setLoading(false);
            }
        }

        load();
        return () => {
            mounted = false;
            ctrl.abort();
        };
    }, []);

    if (loading) return <div className="text-sm text-[var(--text-secondary)]">Loading posts…</div>;
    if (error) return <div className="text-sm text-red-400">Error loading posts: {error}</div>;

    return (
        <div className="space-y-4">
            {posts.length === 0 && <div className="text-sm text-[var(--text-secondary)]">No posts yet.</div>}
            {posts.map((p) => (
                <PostCard
                    key={p.id}
                    post={{
                        id: p.id,
                        community: p.community,
                        title: p.title,
                        excerpt: p.excerpt,
                        votes: p.votes,
                        comments: p.comments,
                        age: p.age,
                        myVote: p.myVote,
                    }}
                />
            ))}
        </div>
    );
}
