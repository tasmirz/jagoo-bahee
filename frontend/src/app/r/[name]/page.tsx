"use client"

import React, { useState, useEffect } from "react";
import { getToken } from '@/lib/auth'
// ...existing code...

export default function SubredditPage({ params }: any) {
	// Next.js may pass `params` as a Promise. Unwrap it with React.use() per migration guidance.
	// React.use is provided by Next and will unwrap the Promise during rendering. Fallback to params directly if unavailable.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const resolvedParams: any = (React as any).use ? (React as any).use(params) : params
	const name = resolvedParams?.name || 'community'
	const [joined, setJoined] = useState(false)
	const [loading, setLoading] = useState(false)
	const [isMod, setIsMod] = useState<boolean | null>(null)

	useEffect(() => {
		async function check() {
			const token = getToken()
			try {
				const res = await fetch(`/api/subreddits/${name}/is-moderator`, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
				if (!res.ok) throw new Error('not allowed')
				const data = await res.json()
				setIsMod(!!data.isModerator)
			} catch (e) {
				setIsMod(false)
			}
		}
		check()
	}, [name])

	async function handleJoin() {
		setLoading(true)
		try {
			const token = getToken()
			const res = await fetch(`/api/subreddits/${name}/join`, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
			if (!res.ok) throw new Error(await res.text())
			setJoined(true)
		} catch (e) {
			alert('Join failed: ' + (e as Error).message)
		} finally { setLoading(false) }
	}

	async function handleLeave() {
		setLoading(true)
		try {
			const token = getToken()
			const res = await fetch(`/api/subreddits/${name}/leave`, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
			if (!res.ok) throw new Error(await res.text())
			setJoined(false)
		} catch (e) {
			alert('Leave failed: ' + (e as Error).message)
		} finally { setLoading(false) }
	}

	return (
		<div className="min-h-screen p-6">
			<div className="max-w-4xl mx-auto">
				<div className="flex items-center justify-between mb-4">
					<h2 className="text-xl font-semibold">r/{name}</h2>
					<div>
						{joined ? (
							<button onClick={handleLeave} disabled={loading} className="px-3 py-2 rounded border">{loading ? '...' : 'Joined'}</button>
						) : (
							<button onClick={handleJoin} disabled={loading} className="px-3 py-2 rounded bg-[var(--primary)] text-white">{loading ? '...' : 'Join'}</button>
						)}
					</div>
				</div>

				<div className="p-6 border rounded bg-[var(--card)]">Subreddit (placeholder)</div>
				{/* Moderation link - visible only to moderators */}
				{isMod && (
					<a href={`/r/${name}/moderation`} className="inline-block mt-4 px-3 py-2 bg-[var(--primary)] text-white rounded">Moderation</a>
				)}
			</div>
		</div>
	)
}
