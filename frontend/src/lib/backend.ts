import backendConfig from '@/config/backend.config'
import { getToken } from '@/lib/auth'

export const getBackendOrigin = () => {
  if (backendConfig.url) return backendConfig.url
  const port = process.env.NEXT_PUBLIC_PORT || '3001'
  return `http://localhost:${port}`
}

export async function backendFetch(path: string, opts: RequestInit = {}) {
  const origin = getBackendOrigin()
  const url = path.startsWith('http') ? path : `${origin}${path.startsWith('/') ? path : '/' + path}`

  const token = getToken()
  const headers = new Headers(opts.headers || {})
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(url, { ...opts, headers })
  return res
}

export async function backendJson(method: string, path: string, body?: any, opts: RequestInit = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) }
  const res = await backendFetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return res
}

export default {
  getBackendOrigin,
  backendFetch,
  backendJson
}
