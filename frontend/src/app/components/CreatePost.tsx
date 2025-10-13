"use client";

export default function CreatePost() {
	return (
		<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
			<div className="flex items-start gap-3">
				<div className="w-10 h-10 rounded-full bg-[var(--muted)]" />
				<div className="flex-1">
					<input
						placeholder="Create a post"
						className="w-full bg-transparent border border-[var(--border)] rounded-md px-3 py-2 text-sm"
					/>
					<div className="mt-3 flex items-center justify-between">
						<div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
							<button className="px-2 py-1 rounded text-[var(--text-secondary)]">Image</button>
							<button className="px-2 py-1 rounded text-[var(--text-secondary)]">Link</button>
						</div>
						<button className="bg-[var(--primary)] text-white px-3 py-1 rounded text-sm">Post</button>
					</div>
				</div>
			</div>
		</div>
	);
}
