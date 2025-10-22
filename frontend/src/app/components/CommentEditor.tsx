"use client"
import React, { useState } from 'react'
import { sha256 } from '@/lib/crypto'
import { getPrivateKey, signHash, getToken, toB64 } from '@/lib/auth'

export default function CommentEditor({ postId, parentId, onSuccess, onCancel }: { postId: string; parentId?: string | null; onSuccess?: (comment: any) => void; onCancel?: () => void }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!content || content.trim().length === 0) { setError('Comment required'); return }
    const priv = getPrivateKey()
    const token = getToken()
    if (!token || !priv) {
      try { localStorage.setItem('intended:comment', JSON.stringify({ postId, parentId, content })) } catch (e) {}
      window.location.href = '/auth'
      return
    }
    setLoading(true)
    try {
      const payload = {
        content: content,
        postId,
        parentId: parentId || null,
        attachmentIds: [],
        timestamp: Date.now()
      }
      const canonical = JSON.stringify({ content: payload.content, postId: payload.postId, parentId: payload.parentId, attachmentIds: payload.attachmentIds.slice().sort(), timestamp: payload.timestamp })
      const hashU8 = await sha256(canonical)
      const sigBytes = signHash(priv, hashU8)
  const backend = await import('@/lib/backend')
  const res = await backend.backendJson('POST', `/comments`, { ...payload, contentHash: Array.from(hashU8).map(b=>b.toString(16).padStart(2,'0')).join(''), userSignature: toB64(sigBytes) })
  if (!res.ok) throw new Error(await res.text())
  const body = await res.json()
      onSuccess && onSuccess(body)
      setContent('')
      onCancel && onCancel()
    } catch (e: any) {
      setError(e.message || String(e))
    } finally { setLoading(false) }
  }

  return (
    <div>
      <textarea value={content} onChange={(e)=>setContent(e.target.value)} rows={4} className="w-full p-2 border rounded" />
      {error && <div className="text-red-600 mt-2">{error}</div>}
      <div className="flex gap-2 mt-2">
        <button onClick={submit} disabled={loading} className="btn">{loading ? 'Posting...' : 'Comment'}</button>
        <button onClick={() => { onCancel && onCancel() }} className="btn-secondary">Cancel</button>
      </div>
    </div>
  )
}
