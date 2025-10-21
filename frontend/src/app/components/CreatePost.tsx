"use client";

import { useEffect, useState } from "react";
import { sha256, toBase64 } from "../../lib/crypto";
import { getPrivateKey, signHash, getToken } from "../../lib/auth";

type Tab = "post" | "media" | "link";

function hexFromU8(u8: Uint8Array) {
	return Array.from(u8)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export default function CreatePost({ subredditName, onCancel }: { subredditName?: string | null; onCancel?: () => void }) {
	const [tab, setTab] = useState<Tab>("post");
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");
	const [linkUrl, setLinkUrl] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [availableSubs, setAvailableSubs] = useState<{ _id: string; name: string }[]>([]);
	const [selectedSub, setSelectedSub] = useState<string | undefined>(subredditName || undefined);

	useEffect(() => {
		let mounted = true;
		const token = getToken();
		if (!token) return;
			fetch('/api/subreddits/mine', { headers: { Authorization: token ? `Bearer ${token}` : '' } })
			.then((r) => r.ok ? r.json() : [])
			.then((data) => {
				if (!mounted) return;
				if (Array.isArray(data)) {
					setAvailableSubs(data);
					if (!selectedSub && data.length > 0) setSelectedSub(data[0]._id || data[0].name);
				}
			})
			.catch(() => {})
		return () => { mounted = false }
	}, []);

	// basic validations
	const canPost = () => {
		if (title.trim().length < 3 || title.trim().length > 300) return false;
		if (tab === "media" && files.length === 0) return false;
		if (tab === "link" && !linkUrl) return false;
		// further checks (file sizes/types) are done during upload
		return true;
	};

	async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
		const selected = e.target.files;
		if (!selected) return;
		const arr = Array.from(selected).slice(0, 10);
		setFiles(arr);
	}

	async function uploadAttachment(file: File) {
		// compute SHA-256 of file
		const buf = await file.arrayBuffer();
		const hashU8 = await sha256(new Uint8Array(buf));
		const contentHash = hexFromU8(hashU8);

		const priv = getPrivateKey();
		if (!priv) throw new Error("No private key available for signing");

		const sigBytes = signHash(priv, hashU8);
		const signatureB64 = toBase64(sigBytes);

		// request presigned upload
		const token = getToken();
		const res = await fetch(`/api/attachments/presigned-upload`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
			body: JSON.stringify({
				type: file.type.startsWith("image") ? "image" : file.type.startsWith("video") ? "video" : "document",
				originalFilename: file.name,
				mimeType: file.type,
				sizeBytes: file.size,
				width: undefined,
				height: undefined,
				contentHash,
				signature: signatureB64
			})
		});
		if (!res.ok) {
			const txt = await res.text();
			throw new Error(`presigned-upload failed: ${txt}`);
		}
		const body = await res.json();
		const uploadUrl = body.uploadUrl || body.presignedUrl;
		const minioKey = body.minioKey || (body.attachment && body.attachment.minioKey) || null;

		if (!uploadUrl || !minioKey) throw new Error("invalid presigned upload response");

		// upload file to storage (PUT)
		const putRes = await fetch(uploadUrl, {
			method: "PUT",
			headers: { "Content-Type": file.type },
			body: buf
		});
		if (!putRes.ok) throw new Error(`upload to storage failed: ${putRes.status}`);

		// confirm upload
		const confirmRes = await fetch(`/api/attachments/confirm-upload`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
			body: JSON.stringify({ key: minioKey, ownerId: null })
		});
		if (!confirmRes.ok) {
			const txt = await confirmRes.text();
			throw new Error(`confirm upload failed: ${txt}`);
		}
		const confirmBody = await confirmRes.json();
		// return attachment id
		return confirmBody._id || (confirmBody.attachment && confirmBody.attachment._id) || confirmBody.attachmentId || null;
	}

	async function handlePost() {
		setError(null);
		if (!canPost()) {
			setError("Validation failed");
			return;
		}

		setUploading(true);
		try {
			// upload attachments first
			const attachmentIds: string[] = [];
			for (const f of files) {
				const aid = await uploadAttachment(f);
				if (aid) attachmentIds.push(aid);
			}

			// build canonical payload and sign
			const attachmentsSorted = attachmentIds.slice().sort().join(",");
			const canonical = `${title}|${content || ""}|${tab === "link" ? linkUrl : ""}|${attachmentsSorted}`;
			const contentHashBytes = await sha256(canonical);
			const contentHashHex = hexFromU8(contentHashBytes);

			const priv = getPrivateKey();
			if (!priv) throw new Error("No private key available");
			const sig = signHash(priv, contentHashBytes);
			const sigB64 = toBase64(sig);

			// submit post
			const token = getToken();
			if (!token) {
				// persist intended post to localStorage and redirect to auth
				try {
					localStorage.setItem('intended:post', JSON.stringify({ title, content, linkUrl, files: files.map(f => f.name), selectedSub }));
				} catch (e) {}
				window.location.href = '/auth';
				return;
			}
					const payload: any = {
						subredditId: selectedSub || subredditName || undefined,
						authorId: undefined,
				title: title.trim(),
				type: tab === "media" ? (files.length && files[0].type.startsWith("video") ? "video" : "image") : tab === "link" ? "link" : "text",
				content: tab === "post" ? content : undefined,
				url: tab === "link" ? linkUrl : undefined,
				attachmentIds: attachmentIds,
				flair: null,
				isNSFW: false,
				isSpoiler: false,
				contentHash: contentHashHex,
				userSignature: sigB64
			};

					const postRes = await fetch(`/api/posts`, {
						method: "POST",
						headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
				body: JSON.stringify(payload)
			});
			if (!postRes.ok) {
				const txt = await postRes.text();
				throw new Error(`post creation failed: ${txt}`);
			}
			const postBody = await postRes.json();
			// TODO: redirect to post page or show success
			console.log("post created", postBody);
			// clear form
			setTitle("");
			setContent("");
			setFiles([]);
					// close modal if requested
					try {
						onCancel && onCancel()
					} catch (e) {}
		} catch (e: any) {
			console.error(e);
			setError(e.message || String(e));
		} finally {
			setUploading(false);
		}
	}

	return (
		<div className="bg-[var(--card)] border border-[var(--border)] rounded-md p-4">
			<div className="flex items-start gap-3">
				<div className="w-10 h-10 rounded-full bg-[var(--muted)]" />
				<div className="flex-1">
					<div className="flex gap-2 mb-3">
						<button onClick={() => setTab("post")} className={`px-3 py-1 rounded ${tab === "post" ? "bg-[var(--primary)] text-white" : "text-[var(--text-secondary)]"}`}>Post</button>
						<button onClick={() => setTab("media")} className={`px-3 py-1 rounded ${tab === "media" ? "bg-[var(--primary)] text-white" : "text-[var(--text-secondary)]"}`}>Image & Video</button>
						<button onClick={() => setTab("link")} className={`px-3 py-1 rounded ${tab === "link" ? "bg-[var(--primary)] text-white" : "text-[var(--text-secondary)]"}`}>Link</button>
					</div>

					<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full bg-transparent border border-[var(--border)] rounded-md px-3 py-2 text-sm mb-2" />

					{tab === "post" && (
						<textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Text (optional)" className="w-full bg-transparent border border-[var(--border)] rounded-md px-3 py-2 text-sm h-32" />
					)}

					{tab === "link" && (
						<input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.com" className="w-full bg-transparent border border-[var(--border)] rounded-md px-3 py-2 text-sm" />
					)}

					{tab === "media" && (
						<div className="mt-2">
							<input type="file" accept="image/*,video/*" multiple onChange={handleFileSelect} />
							<div className="mt-2 flex gap-2">
								{files.map((f) => (
									<div key={f.name} className="text-xs text-[var(--text-secondary)]">{f.name}</div>
								))}
							</div>
						</div>
					)}

					<div className="mt-3 flex items-center justify-between">
						<div className="text-sm text-[var(--text-secondary)]">{error && <span className="text-red-400">{error}</span>}</div>
						<div className="flex items-center gap-2">
							<button className="px-3 py-1 rounded text-sm" onClick={() => { setTitle(""); setContent(""); setFiles([]); }}>Cancel</button>
							<button disabled={!canPost() || uploading} onClick={handlePost} className={`px-3 py-1 rounded text-sm ${canPost() ? "bg-[var(--primary)] text-white" : "bg-[var(--muted)] text-[var(--text-secondary)]"}`}>
								{uploading ? "Posting..." : "Post"}
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
