import React from "react";
import Image from 'next/image'
const logoPath = '/jagoo-bahee.svg'

export default function SubredditsListPage() {
	return (
		<div className="min-h-screen p-6 bg-[var(--background)] text-[var(--foreground)]">
			<div className="max-w-4xl mx-auto">
				<div className="flex items-center gap-4 mb-6">
								<div className="w-14 h-14 relative">
									<Image src={logoPath} alt="jagoo-bahee" fill sizes="56px" />
								</div>
					<div>
						<h1 className="text-2xl font-semibold">Communities</h1>
						<div className="text-sm text-[var(--text-secondary)]">Create and discover communities</div>
					</div>
				</div>

				<div className="grid grid-cols-1 gap-4">
					<div className="p-6 border rounded bg-[var(--card)]">Subreddits (placeholder)</div>
				</div>
			</div>
		</div>
	)
}
