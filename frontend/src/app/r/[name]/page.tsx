"use client"

import React, { useState, useEffect } from "react";
import { getToken } from '@/lib/auth'
import CreatePost from '@/app/components/CreatePost'
import PostList from '@/app/components/PostList'
import ModeratorControls from './ModeratorControls'

// Subreddit page — fetch subreddit metadata and posts, allow join/leave, create posts
export default function SubredditPage({ params }: any) {
	// Next.js may pass `params` as a Promise. Unwrap it with React.use()
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const resolvedParams: any = (React as any).use ? (React as any).use(params) : params
	const name = resolvedParams?.name || 'community'

	const [sub, setSub] = useState<any | null>(null)
	const [postsReloadKey, setPostsReloadKey] = useState(0)
	const [joined, setJoined] = useState(false)
	const [loading, setLoading] = useState(false)
	const [isMod, setIsMod] = useState<boolean | null>(null)

	useEffect(() => {
		async function load() {
			try {
				const backend = await import('@/lib/backend')
				const res = await backend.backendFetch(`/subreddits/${encodeURIComponent(name)}`)
				if (!res.ok) throw new Error('Not found')
				const data = await res.json()
				setSub(data)
			} catch (e) {
				setSub(null)
			}
		}
		load()
	}, [name])

	useEffect(() => {
		async function checkMod() {
			try {
				const backend = await import('@/lib/backend')
				const res = await backend.backendFetch(`/subreddits/${encodeURIComponent(name)}/is-moderator`)
				if (!res.ok) throw new Error('not allowed')
				const data = await res.json()
				setIsMod(!!data.isModerator)
			} catch (e) {
				setIsMod(false)
			}
		}
		checkMod()
	}, [name])

	async function handleJoin() {
		setLoading(true)
		try {
			const backend = await import('@/lib/backend')
			const res = await backend.backendFetch(`/subreddits/${encodeURIComponent(name)}/join`, { method: 'POST' })
			if (!res.ok) throw new Error(await res.text())
			setJoined(true)
			setPostsReloadKey((k) => k + 1)
		} catch (e) {
			alert('Join failed: ' + (e as Error).message)
		} finally { setLoading(false) }
	}

	async function handleLeave() {
		setLoading(true)
		try {
			const backend = await import('@/lib/backend')
			const res = await backend.backendFetch(`/subreddits/${encodeURIComponent(name)}/leave`, { method: 'POST' })
			if (!res.ok) throw new Error(await res.text())
			setJoined(false)
			setPostsReloadKey((k) => k + 1)
		} catch (e) {
			alert('Leave failed: ' + (e as Error).message)
		} finally { setLoading(false) }
	}

	function onPostCreated() {
		setPostsReloadKey((k) => k + 1)
	}

	return (
		<div className="min-h-screen p-6">
			<div className="max-w-4xl mx-auto">
				<div className="flex items-center justify-between mb-4">
					<div>
						<h2 className="text-xl font-semibold">r/{name}</h2>
						{sub?.displayName && <div className="text-sm text-[var(--text-secondary)]">{sub.displayName}</div>}
					</div>
					<div>
						{joined ? (
							<button onClick={handleLeave} disabled={loading} className="px-3 py-2 rounded border">{loading ? '...' : 'Joined'}</button>
						) : (
							<button onClick={handleJoin} disabled={loading} className="px-3 py-2 rounded bg-[var(--primary)] text-white">{loading ? '...' : 'Join'}</button>
						)}
					</div>
				</div>

				{sub ? (
					<div className="p-6 border rounded bg-[var(--card)] mb-4">
						<div className="mb-2">{sub.description}</div>
						<div className="text-xs text-[var(--text-secondary)]">Members: {sub.memberCount ?? '—'}</div>
					</div>
				) : (
					<div className="p-6 border rounded bg-[var(--card)] mb-4">Community not found</div>
				)}

				<div className="mb-4">
					<CreatePost subredditName={name} onCancel={() => {}} />
				</div>

				<PostList key={postsReloadKey} filterSubreddit={name} />

				{isMod && (
					<div className="mt-6">
						<a href={`/r/${name}/moderation`} className="inline-block px-3 py-2 bg-[var(--primary)] text-white rounded">Moderation</a>
						<div className="mt-4">
							<ModeratorControls subredditName={name} />
						</div>
					</div>
				)}
			</div>
		</div>
	)
}
