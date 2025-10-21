"use client";

import React, { useState } from "react";
import CreatePost from "./CreatePost";
import { usePathname } from "next/navigation";

export default function TopBar() {
	return (
		<header className="w-full bg-[var(--card)] border-b border-[var(--border)]">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center gap-4">
				<div className="flex items-center gap-3">
					<div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold">J</div>
					<div className="font-semibold">Jagoo Bahee</div>
				</div>

				<div className="ml-6 flex items-center gap-2 bg-[var(--muted)] rounded-full px-3 py-1 text-sm text-[var(--text-secondary)]">
					<span>Home</span>
					<span className="px-2">•</span>
					<span>Discover</span>
				</div>

				<div className="ml-auto flex items-center gap-3">
					<CreateButton />
					<div className="w-8 h-8 rounded-full bg-[var(--muted)]" />
				</div>
			</div>
		</header>
	);
}

function CreateButton() {
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	let subredditName: string | undefined;
	if (pathname) {
		const m = pathname.match(/^\/r\/([^\/]+)/);
		if (m) subredditName = decodeURIComponent(m[1]);
	}

	return (
		<>
			<button onClick={() => setOpen(true)} className="text-sm px-3 py-1 rounded-md bg-[var(--primary)] text-white">Create Post</button>
			{open && (
				<div className="fixed inset-0 z-50 flex items-start justify-center p-6">
					<div className="absolute inset-0 bg-black opacity-40" onClick={() => setOpen(false)} />
					<div className="relative w-full max-w-3xl">
						<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
							<div className="flex justify-end">
								<button onClick={() => setOpen(false)} className="px-2 py-1">Close</button>
							</div>
							<CreatePost subredditName={subredditName} onCancel={() => setOpen(false)} />
						</div>
					</div>
				</div>
			)}
		</>
	);
}
