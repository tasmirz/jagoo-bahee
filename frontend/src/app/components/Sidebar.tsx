"use client";

export default function Sidebar() {
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
					<li>r/Banglasahityo</li>
					<li>r/Bangladesh</li>
					<li>r/learnprogramming</li>
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
