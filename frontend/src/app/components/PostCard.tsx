"use client";

type Post = {
	id: string;
	community: string;
	title: string;
	excerpt?: string;
	votes: number;
	comments: number;
	age: string;
};

export default function PostCard({ post }: { post: Post }) {
	return (
		<article className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4 shadow-sm">
			<div className="flex gap-3">
				<div className="w-10 flex flex-col items-center text-sm text-[var(--text-secondary)]">
					<button className="text-[var(--text-secondary)]">▲</button>
					<div className="font-semibold">{post.votes}</div>
					<button className="text-[var(--text-secondary)]">▼</button>
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
	);
}
