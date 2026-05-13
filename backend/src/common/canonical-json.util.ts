import { createHash } from 'crypto'

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value))
}

export function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function normalize(value: any): any {
  if (value === null || value === undefined) return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object') return value
  if (typeof value.toHexString === 'function') return value.toHexString()
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => normalize(item))
  return Object.keys(value)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = normalize(value[key])
      return acc
    }, {})
}
