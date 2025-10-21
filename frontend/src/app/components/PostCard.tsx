"use client";

import useVote from '@/lib/hooks/useVote'

type Post = {
	id: string
	community: string
	title: string
	excerpt?: string
	votes: number
	comments: number
	age: string
	myVote?: 0 | 1 | -1
}

export default function PostCard({ post }: { post: Post }) {
	const { state, cast, loading } = useVote({ value: post.myVote ?? 0, score: post.votes, upvoteCount: 0, downvoteCount: 0 }, post.id, 'post')

	return (
		<article className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 shadow-sm">
			<div className="flex gap-3">
				<div className="w-10 flex flex-col items-center text-sm text-[var(--text-secondary)]">
					<button title={state.value === 1 ? 'Remove upvote' : 'Upvote - I like this'} onClick={() => cast(1)} className={state.value === 1 ? 'text-orange-500' : ''} disabled={loading}>
						▲
					</button>
					<div className="font-semibold">{state.score}</div>
					<button title={state.value === -1 ? 'Remove downvote' : "Downvote - I don't like this"} onClick={() => cast(-1)} className={state.value === -1 ? 'text-blue-500' : ''} disabled={loading}>
						▼
					</button>
				</div>

				<div className="flex-1">
					<div className="text-sm text-[var(--text-secondary)]">{post.community}</div>
					<h4 className="font-semibold mt-1">{post.title}</h4>
					<p className="text-sm text-[var(--text-secondary)] mt-2">{post.excerpt}</p>

					<div className="mt-3 text-sm text-[var(--text-secondary)] flex gap-4">
						<span>{post.comments} comments</span>
						<span>{post.age}</span>
					</div>
				</div>
			</div>
		</article>
	)
}
