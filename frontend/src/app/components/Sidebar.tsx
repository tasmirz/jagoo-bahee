"use client";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";

type Subreddit = { _id: string; name: string; displayName?: string };

export default function Sidebar() {
	const [subs, setSubs] = useState<Subreddit[] | null>(null);
	const [loading, setLoading] = useState(false);
	const token = getToken();

	useEffect(() => {
		let mounted = true;
			const load = async () => {
				if (!token) {
					setSubs(null);
					return;
				}
				setLoading(true);
				try {
					const res = await fetch('/api/subreddits/mine', { headers: { Authorization: token ? `Bearer ${token}` : '' } });
				if (!mounted) return;
				if (res.ok) {
					const data = await res.json();
					setSubs(data || []);
				} else {
					setSubs([]);
				}
			} catch (e) {
				setSubs([]);
			} finally {
				if (mounted) setLoading(false);
			}
		};
		load();
		return () => {
			mounted = false;
		};
	}, [token]);

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
