"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";

type Subreddit = { _id: string; name: string; displayName?: string };

export default function Sidebar() {
	const [subs, setSubs] = useState<Subreddit[] | null>(null);
	const [loading, setLoading] = useState(false);
	const [mounted, setMounted] = useState(false);
	const [token, setToken] = useState<string | null>(null);

	useEffect(() => {
		// run only on client
		let alive = true;
		const t = getToken();
		setToken(t);
		setMounted(true);

		const load = async () => {
			if (!t) {
				if (alive) setSubs(null);
				return;
			}
			if (alive) setLoading(true);
			try {
				const backend = await import('@/lib/backend')
				const res = await backend.backendFetch('/users/me/subreddits')
				if (!alive) return;
				if (res.ok) {
					const data = await res.json();
					setSubs(data || []);
				} else {
					setSubs([]);
				}
			} catch (e) {
				if (alive) setSubs([]);
			} finally {
				if (alive) setLoading(false);
			}
		};

		load();

		return () => { alive = false };
	}, []);

	// Avoid rendering dynamic membership state until after client mount to prevent SSR/client hydration mismatch
	if (!mounted) {
		return (
			<div className="space-y-4">
				<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
					<h4 className="text-sm font-semibold">Custom feeds</h4>
					<ul className="mt-3 text-sm text-[var(--text-secondary)] space-y-2">
						<li className="hover:text-[var(--foreground)]">Create Custom Feed</li>
					</ul>
				</div>

				<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
					<h4 className="text-sm font-semibold">Communities</h4>
					<ul className="mt-3 text-sm text-[var(--text-secondary)] space-y-2">
						<li>
							<a href="/subreddits/create" className="text-[var(--primary)] font-medium">+ Create Community</a>
						</li>
						<li className="text-sm text-[var(--text-secondary)]">Loading…</li>
					</ul>
				</div>

				<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
					<h4 className="text-sm font-semibold">Resources</h4>
					<ul className="mt-3 text-sm text-[var(--text-secondary)] space-y-2">
						<li>About</li>
						<li>Help</li>
					</ul>
				</div>
			</div>
		)
	}

	return (
		<div className="space-y-4">
			<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
				<h4 className="text-sm font-semibold">Custom feeds</h4>
				<ul className="mt-3 text-sm text-[var(--text-secondary)] space-y-2">
					<li className="hover:text-[var(--foreground)]">Create Custom Feed</li>
				</ul>
			</div>

			<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
				<h4 className="text-sm font-semibold">Communities</h4>
				<ul className="mt-3 text-sm text-[var(--text-secondary)] space-y-2">
					<li>
						<a href="/subreddits/create" className="text-[var(--primary)] font-medium">+ Create Community</a>
					</li>
					{token ? (
						loading ? (
							<li>Loading...</li>
						) : subs && subs.length > 0 ? (
							subs.map((s) => (
								<li key={s._id}>
									<a href={`/r/${s.name}`} className="hover:text-[var(--foreground)]">r/{s.name}</a>
								</li>
							))
						) : (
							<li className="text-sm text-[var(--text-secondary)]">You are not a member of any communities yet.</li>
						)
					) : (
						<li>
							<a href="/auth" className="text-[var(--primary)]">Sign in to see your communities</a>
						</li>
					)}
				</ul>
			</div>

			<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
				<h4 className="text-sm font-semibold">Resources</h4>
				<ul className="mt-3 text-sm text-[var(--text-secondary)] space-y-2">
					<li>About</li>
					<li>Help</li>
				</ul>
			</div>
		</div>
	);
}
