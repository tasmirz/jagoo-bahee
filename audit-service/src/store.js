import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { randomUUID } from 'crypto'
import { sha256Hex } from './verification.js'

export class ReceiptStore {
  constructor(path) {
    this.path = path
    this.records = new Map()
  }

  async load() {
    await mkdir(dirname(this.path), { recursive: true })
    try {
      const raw = await readFile(this.path, 'utf8')
      const rows = JSON.parse(raw || '[]')
      for (const row of rows) this.records.set(row.id, row)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      await this.persist()
    }
  }

  async submit(receipt, verification) {
    const id = randomUUID()
    const payloadHash = String(receipt.payloadHash || receipt.contentHash || sha256Hex(String(receipt.canonicalPayload || '')))
    const record = {
      id,
      receipt,
      verification,
      receiptHash: sha256Hex(JSON.stringify(receipt)),
      contentHash: payloadHash,
      serverId: String(receipt.serverId || receipt.serverBaseUrl || ''),
      publicKey: String(receipt.actorPublicKey || receipt.userPublicKey || ''),
      submittedAt: new Date().toISOString()
    }
    this.records.set(id, record)
    await this.persist()
    return record
  }

  get(id) {
    return this.records.get(id) || null
  }

  byContentHash(hash) {
    return [...this.records.values()].filter((record) => record.contentHash === hash)
  }

  byServer(serverId) {
    return [...this.records.values()].filter((record) => record.serverId === serverId)
  }

  byPublicKey(publicKey) {
    return [...this.records.values()].filter((record) => record.publicKey === publicKey)
  }

  async persist() {
    await writeFile(this.path, JSON.stringify([...this.records.values()], null, 2))
  }
}
