"use client"
import { useState } from 'react'
import { getToken } from '@/lib/auth'
import { useRouter } from 'next/navigation'

export default function useVote(initial: { value: 0 | 1 | -1; score: number; upvoteCount: number; downvoteCount: number }, targetId: string, targetType: 'post' | 'comment') {
  const [state, setState] = useState(initial)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function cast(v: 0 | 1 | -1) {
    const prev = state.value
    let scoreDelta = 0
    if (v === prev) {
      // toggling off
      if (v === 1) scoreDelta = -1
      else if (v === -1) scoreDelta = 1
    } else {
      // new vote or switch
      if (prev === 0) scoreDelta = v
      else scoreDelta = v - prev
    }
    // optimistic
    setState(s => ({ ...s, value: v === prev ? 0 : v, score: s.score + scoreDelta }))
    setLoading(true)
    try {
        const token = getToken()
        if (!token) {
          // persist intended action and redirect to auth
          try { localStorage.setItem('intended:vote', JSON.stringify({ targetId, targetType, value: v === prev ? 0 : v })) } catch (e) {}
          router.push('/auth')
          return
        }
        const res = await fetch('/api/votes', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' }, body: JSON.stringify({ targetId, targetType, value: v === prev ? 0 : v }) })
        if (!res.ok) {
          // rollback
          setState(s => ({ ...s, value: prev }))
        } else {
          const data = await res.json()
          // reconcile with server data if provided
        }
    } catch (e) {
      setState(s => ({ ...s, value: prev }))
    } finally {
      setLoading(false)
    }
  }

  return { state, cast, loading }
}
