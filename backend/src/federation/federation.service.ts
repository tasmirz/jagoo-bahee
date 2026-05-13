import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection } from 'mongoose'
import { createHash } from 'crypto'
import {
  getServerPublicKeyBase64,
  serverKeyId,
  signServerMessage,
  verifyServerSignatureWithPublicKey
} from 'src/common/server-sign.util'

export interface FederationActivity {
  activityId: string
  type: string
  actorServerId: string
  actorKeyId: string
  object: Record<string, unknown>
  objectHash: string
  createdAt: string
  signature: string
}

@Injectable()
export class FederationService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  identity() {
    const baseUrl = this.publicServerUrl()
    return {
      serverId: baseUrl,
      name: process.env.SERVER_NAME || 'Jagoo Bahee',
      software: 'jagoo-bahee',
      version: '0.1.0',
      baseUrl,
      keyId: serverKeyId,
      publicKey: getServerPublicKeyBase64(),
      capabilities: ['discovery', 'signed-inbox', 'outbox', 'approved-server-registry'],
      endpoints: {
        inbox: `${baseUrl}/federation/inbox`,
        outbox: `${baseUrl}/federation/outbox`
      }
    }
  }

  nodeInfo() {
    const baseUrl = this.publicServerUrl()
    return {
      version: '2.1',
      software: { name: 'jagoo-bahee', version: '0.1.0' },
      protocols: ['jagoo-bahee'],
      services: { inbound: [], outbound: [] },
      openRegistrations: true,
      usage: { users: { total: 0 } },
      metadata: { baseUrl, keyId: serverKeyId }
    }
  }

  async listApprovedServers() {
    return this.connection
      .collection('federationservers')
      .find({ status: 'approved' })
      .project({ name: 1, baseUrl: 1, publicKey: 1, status: 1, updatedAt: 1 })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray()
  }

  async listOutbox(limit = 50): Promise<any[]> {
    return this.connection
      .collection('federationactivities')
      .find({ direction: 'out' })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || 50, 1), 100))
      .toArray()
  }

  async emitLocalActivity(type: string, object: Record<string, unknown>) {
    const createdAt = new Date().toISOString()
    const activity: Omit<FederationActivity, 'signature'> = {
      activityId: `${this.publicServerUrl()}/activities/${createHash('sha256').update(type + createdAt + canonicalJson(object)).digest('hex')}`,
      type,
      actorServerId: this.publicServerUrl(),
      actorKeyId: serverKeyId,
      object,
      objectHash: this.hashObject(object),
      createdAt
    }
    const signature = signServerMessage(canonicalJson(activity))
    const signed = { ...activity, signature }
    await this.connection.collection('federationactivities').updateOne(
      { activityId: signed.activityId, direction: 'out' },
      { $setOnInsert: { ...signed, direction: 'out', receivedAt: new Date() } },
      { upsert: true }
    )
    return signed
  }

  async receive(activity: FederationActivity) {
    this.assertInboxSize(activity)
    this.assertEnvelope(activity)
    const existing = await this.connection.collection('federationactivities').findOne({ activityId: activity.activityId, direction: 'in' })
    if (existing) {
      return { accepted: true, duplicate: true, activityId: activity.activityId }
    }

    const remote = await this.connection.collection('federationservers').findOne({
      baseUrl: activity.actorServerId.replace(/\/$/, ''),
      status: 'approved'
    })
    if (!remote?.publicKey) throw new ForbiddenException('Remote server is not approved')
    if (remote.keyId && remote.keyId !== activity.actorKeyId) throw new ForbiddenException('Remote key id mismatch')

    const expectedHash = this.hashObject(activity.object)
    if (expectedHash !== activity.objectHash) throw new BadRequestException('Object hash mismatch')

    const { signature, ...unsigned } = activity
    if (!verifyServerSignatureWithPublicKey(canonicalJson(unsigned), signature, remote.publicKey)) {
      throw new ForbiddenException('Invalid federation signature')
    }

    try {
      await this.connection.collection('federationactivities').insertOne({
        ...activity,
        direction: 'in',
        remoteServerId: String(remote._id),
        receivedAt: new Date()
      })
    } catch (error: any) {
      if (String(error?.code) === '11000') throw new ConflictException('Duplicate federation activity')
      throw error
    }
    return { accepted: true, duplicate: false, activityId: activity.activityId }
  }

  hashObject(object: unknown) {
    return createHash('sha256').update(canonicalJson(object)).digest('hex')
  }

  private assertEnvelope(activity: FederationActivity) {
    for (const field of ['activityId', 'type', 'actorServerId', 'actorKeyId', 'objectHash', 'createdAt', 'signature'] as const) {
      if (!activity?.[field]) throw new BadRequestException(`Missing federation field: ${field}`)
    }
    if (!activity.object || typeof activity.object !== 'object' || Array.isArray(activity.object)) {
      throw new BadRequestException('Federation object must be an object')
    }
    const createdAt = new Date(activity.createdAt).getTime()
    if (!Number.isFinite(createdAt)) throw new BadRequestException('Invalid createdAt')
    const now = Date.now()
    const futureMs = Number(process.env.FEDERATION_MAX_CLOCK_SKEW_MS || 10 * 60 * 1000)
    const staleMs = Number(process.env.FEDERATION_MAX_ACTIVITY_AGE_MS || 7 * 24 * 60 * 60 * 1000)
    if (createdAt - now > futureMs) throw new BadRequestException('Federation activity is future dated')
    if (now - createdAt > staleMs) throw new BadRequestException('Federation activity is too old')
  }

  private assertInboxSize(activity: FederationActivity) {
    const maxBytes = Number(process.env.FEDERATION_INBOX_MAX_BODY_BYTES || 256 * 1024)
    const bytes = Buffer.byteLength(canonicalJson(activity), 'utf8')
    if (bytes > maxBytes) throw new HttpException('Federation inbox payload too large', HttpStatus.PAYLOAD_TOO_LARGE)
  }

  private publicServerUrl() {
    return (process.env.PUBLIC_SERVER_URL || `http://localhost:${process.env.PORT || 6000}`).replace(/\/$/, '')
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value))
}

function normalize(value: any): any {
  if (value === null || value === undefined) return value
  if (typeof value !== 'object') return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => normalize(item))
  return Object.keys(value)
    .sort()
    .reduce((acc: Record<string, unknown>, key) => {
      acc[key] = normalize(value[key])
      return acc
    }, {})
}
