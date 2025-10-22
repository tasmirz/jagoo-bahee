"use client"

import React, { useState } from 'react'
import { getPrivateKey, getToken } from '@/lib/auth'
import { sha256 } from '@/lib/crypto'

export default function ModeratorControls({ subredditName }: { subredditName: string }) {
  const [targetUser, setTargetUser] = useState('')
  const [reason, setReason] = useState('')
  const [duration, setDuration] = useState<number | null>(7)
  const [loading, setLoading] = useState(false)

  async function signPayload(payload: string) {
    const priv = getPrivateKey()
    if (!priv) throw new Error('Private key not found; login required')
    const h = await sha256(payload)
    // tiny-secp expects Uint8Array and returns signature bytes; use window.crypto + tiny-secp in lib.auth
    const tinySecp = await import('tiny-secp256k1')
    const sig = tinySecp.sign(Buffer.from(h), Buffer.from(priv))
    if (!sig) throw new Error('Failed to sign')
    return Buffer.from(sig).toString('base64')
  }

  async function handleKick() {
    if (!targetUser) return alert('target required')
    setLoading(true)
    try {
      const payload = `kick|${subredditName}|${targetUser}|${reason || ''}`
      const signature = await signPayload(payload)
      const token = getToken()
  const backend = await import('@/lib/backend')
  const res = await backend.backendJson('POST', `/subreddits/${subredditName}/kick`, { userId: targetUser, reason, signature })
      if (!res.ok) throw new Error(await res.text())
      alert('Kick successful')
    } catch (e) {
      alert('Kick failed: ' + (e as Error).message)
    } finally { setLoading(false) }
  }

  async function handleBan(permanent = false) {
    if (!targetUser) return alert('target required')
    setLoading(true)
    try {
      const banType = permanent ? 'permanent' : 'temporary'
      const payload = `ban|${subredditName}|${targetUser}|${banType}|${duration || 0}|${reason || ''}`
      const signature = await signPayload(payload)
      const token = getToken()
  const backend = await import('@/lib/backend')
  const res = await backend.backendJson('POST', `/subreddits/${subredditName}/ban`, { userId: targetUser, reason, duration, banType, signature, deleteContent: false })
      if (!res.ok) throw new Error(await res.text())
      alert('Ban successful')
    } catch (e) {
      alert('Ban failed: ' + (e as Error).message)
    } finally { setLoading(false) }
  }

  async function handleUnban() {
    if (!targetUser) return alert('target required')
    setLoading(true)
    try {
      const payload = `unban|${subredditName}|${targetUser}|${reason || ''}`
      const signature = await signPayload(payload)
      const token = getToken()
  const backend = await import('@/lib/backend')
  const res = await backend.backendFetch(`/subreddits/${subredditName}/ban/${targetUser}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature, reason }) })
      if (!res.ok) throw new Error(await res.text())
      alert('Unbanned')
    } catch (e) {
      alert('Unban failed: ' + (e as Error).message)
    } finally { setLoading(false) }
  }

  return (
    <div className="p-4 border rounded bg-[var(--card)] mt-4">
      <h3 className="font-semibold mb-2">Moderator Controls (dev)</h3>
      <div className="mb-2">
        <input placeholder="target user id" value={targetUser} onChange={(e) => setTargetUser(e.target.value)} className="border p-1 mr-2" />
        <input placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="border p-1" />
      </div>
      <div className="mb-2">
        <button onClick={handleKick} disabled={loading} className="px-3 py-1 mr-2 bg-red-600 text-white rounded">Kick</button>
        <button onClick={() => handleBan(false)} disabled={loading} className="px-3 py-1 mr-2 bg-orange-600 text-white rounded">Temp Ban</button>
        <button onClick={() => handleBan(true)} disabled={loading} className="px-3 py-1 mr-2 bg-black text-white rounded">Perm Ban</button>
        <button onClick={handleUnban} disabled={loading} className="px-3 py-1 bg-green-600 text-white rounded">Unban</button>
      </div>
      <div className="text-sm text-muted">Note: This control signs payloads with your stored private key.</div>
    </div>
  )
}
