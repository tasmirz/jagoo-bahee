"use client"

import React, { useEffect, useState } from 'react'
import ModeratorControls from '../ModeratorControls'
import { getToken } from '@/lib/auth'

export default function ModerationPage({ params }: any) {
  const name = params?.name
  const [isMod, setIsMod] = useState<boolean | null>(null)
  const [modLogs, setModLogs] = useState<any[]>([])
  const [bans, setBans] = useState<any[]>([])

  useEffect(() => {
    async function check() {
      try {
        const backend = await import('@/lib/backend')
        const res = await backend.backendFetch(`/subreddits/${name}/is-moderator`)
        if (!res.ok) throw new Error('Not allowed')
        const data = await res.json()
        setIsMod(!!data.isModerator)
      } catch (e) {
        setIsMod(false)
      }
    }
    check()
  }, [name])

  useEffect(() => {
    if (!isMod) return
    const token = getToken()
    async function fetchLists() {
      try {
        const backend = await import('@/lib/backend')
        const [logsRes, bansRes] = await Promise.all([
          backend.backendFetch(`/subreddits/${name}/modlogs?limit=50`),
          backend.backendFetch(`/subreddits/${name}/bans`)
        ])
        if (logsRes.ok) setModLogs(await logsRes.json())
        if (bansRes.ok) setBans(await bansRes.json())
      } catch (e) {
        // ignore
      }
    }
    fetchLists()
  }, [isMod, name])

  if (isMod === null) return <div>Loading...</div>
  if (!isMod) return <div className="p-6">You are not a moderator of this community.</div>

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-xl font-semibold mb-4">Moderation — r/{name}</h2>
        <div className="mb-6">
          <ModeratorControls subredditName={name} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-[var(--card)] border border-[var(--border)] p-4 rounded">
            <h3 className="font-semibold mb-2">Recent Mod Logs</h3>
            <div className="text-sm text-[var(--text-secondary)]">
              {modLogs.length === 0 && <div>No recent mod logs.</div>}
              {modLogs.map((l: any) => (
                <div key={l._id} className="py-2 border-b last:border-b-0">
                  <div className="text-sm">{l.action} — <span className="text-[var(--text-secondary)]">{l.targetType} {l.targetId}</span></div>
                  <div className="text-xs text-[var(--text-secondary)]">By {String(l.moderatorId)} • {new Date(l.createdAt).toLocaleString()}</div>
                  {l.reason && <div className="text-xs mt-1">Reason: {l.reason}</div>}
                </div>
              ))}
            </div>
          </section>

          <section className="bg-[var(--card)] border border-[var(--border)] p-4 rounded">
            <h3 className="font-semibold mb-2">Banned Users</h3>
            <div className="text-sm text-[var(--text-secondary)]">
              {bans.length === 0 && <div>No banned users.</div>}
              {bans.map((b: any) => (
                <div key={String(b.member._id)} className="py-2 border-b last:border-b-0">
                  <div className="text-sm">{b.user ? b.user.username || b.user._id : String(b.member.userId)}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Until: {b.member.bannedUntil ? new Date(b.member.bannedUntil).toLocaleString() : 'Permanent'}</div>
                  {b.member.banReason && <div className="text-xs mt-1">Reason: {b.member.banReason}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
