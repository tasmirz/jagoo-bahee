"use client";

export default function TopBar() {
	return (
		<header className="w-full bg-[var(--card)] border-b border-[var(--border)]">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold">
						J
					</div>
					<div className="font-semibold">Jagoo Bahee</div>
				</div>

				<div className="ml-6 flex items-center gap-2 bg-[var(--muted)] rounded-full px-3 py-1 text-sm text-[var(--text-secondary)]">
					<span>Home</span>
					<span className="px-2">•</span>
					<span>Discover</span>
				</div>

				<div className="ml-auto flex items-center gap-3">
					<button className="text-sm px-3 py-1 rounded-md bg-[var(--primary)] text-white">Create Post</button>
					<div className="w-8 h-8 rounded-full bg-[var(--muted)]" />
				</div>
			</div>
		</header>
	);
}
