import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection, Types } from 'mongoose'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { RedisService } from 'src/redis/redis.service'
import { lookup } from 'dns/promises'

const GLOBAL_MOD_BIT = BigInt(1) << BigInt(4)
const GLOBAL_ADMIN_BIT = BigInt(1) << BigInt(5)

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly redis: RedisService
  ) {}

  @Get('summary')
  async summary(@Req() req: any) {
    await this.assertAdmin(req)
    const [users, communities, posts, federationServers, pendingReports, modLogs, blockedIps] = await Promise.all([
      this.connection.collection('users').countDocuments(),
      this.connection.collection('subreddits').countDocuments(),
      this.connection.collection('posts').countDocuments(),
      this.connection.collection('federationservers').countDocuments().catch(() => 0),
      this.connection.collection('reports').countDocuments({ status: 'pending' }).catch(() => 0),
      this.connection.collection('modlogs').countDocuments().catch(() => 0),
      this.connection.collection('ipblocks').countDocuments().catch(() => 0)
    ])
    return { users, communities, posts, federationServers, pendingReports, modLogs, blockedIps }
  }

  @Get('users')
  async users(@Req() req: any) {
    await this.assertAdmin(req)
    const users = await this.connection
      .collection('users')
      .aggregate([
        { $sort: { createdAt: -1 } },
        { $limit: 100 },
        { $lookup: { from: 'auths', localField: '_id', foreignField: '_id', as: 'auth' } },
        { $unwind: { path: '$auth', preserveNullAndEmptyArrays: true } },
        { $project: { username: 1, postKarma: 1, commentKarma: 1, createdAt: 1, bannedUntil: 1, banReason: 1, abac: '$auth.abac', publicKey: '$auth.publicKey' } }
      ])
      .toArray()
    return users.map((user: any) => ({
      ...user,
      abac: String(user.abac || 0),
      publicKey: user.publicKey ? Buffer.from(user.publicKey.buffer || user.publicKey).toString('base64') : undefined
    }))
  }

  @Patch('users/:id/ban')
  async banUser(@Req() req: any, @Param('id') id: string, @Body() body: { days?: number; reason?: string }) {
    await this.assertAdmin(req)
    if (!Types.ObjectId.isValid(id)) throw new ForbiddenException('Invalid user id')
    const days = Math.min(Math.max(Number(body.days || 7), 1), 3650)
    const bannedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    await this.connection.collection('users').updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { bannedUntil, banReason: String(body.reason || 'server_admin_ban').slice(0, 500), updatedAt: new Date() } }
    )
    return { userId: id, bannedUntil }
  }

  @Patch('users/:id/unban')
  async unbanUser(@Req() req: any, @Param('id') id: string) {
    await this.assertAdmin(req)
    if (!Types.ObjectId.isValid(id)) throw new ForbiddenException('Invalid user id')
    await this.connection.collection('users').updateOne(
      { _id: new Types.ObjectId(id) },
      { $unset: { bannedUntil: '', banReason: '' }, $set: { updatedAt: new Date() } }
    )
    return { userId: id, bannedUntil: null }
  }

  @Patch('users/:id/global-role')
  async setGlobalRole(@Req() req: any, @Param('id') id: string, @Body() body: { moderator?: boolean; admin?: boolean }) {
    await this.assertAdmin(req)
    if (!Types.ObjectId.isValid(id)) throw new ForbiddenException('Invalid user id')
    const auth = await this.connection.collection('auths').findOne({ _id: new Types.ObjectId(id) })
    if (!auth) throw new ForbiddenException('Auth record not found')
    let flags = BigInt(auth.abac || 0)
    flags = body.moderator ? flags | GLOBAL_MOD_BIT : flags & ~GLOBAL_MOD_BIT
    if (typeof body.admin === 'boolean') flags = body.admin ? flags | GLOBAL_ADMIN_BIT : flags & ~GLOBAL_ADMIN_BIT
    await this.connection.collection('auths').updateOne({ _id: new Types.ObjectId(id) }, { $set: { abac: flags } })
    return { userId: id, abac: flags.toString() }
  }

  @Get('federation/servers')
  async listFederationServers(@Req() req: any): Promise<any[]> {
    await this.assertAdmin(req)
    return this.connection.collection('federationservers').find({}).sort({ createdAt: -1 }).limit(100).toArray()
  }

  @Post('federation/servers')
  async addFederationServer(@Req() req: any, @Body() body: { name?: string; baseUrl: string; publicKey?: string; status?: string }) {
    await this.assertAdmin(req)
    const baseUrl = await validateFederationBaseUrl(body.baseUrl)
    const discovered = await discoverFederationIdentity(baseUrl)
    const doc = {
      name: body.name || discovered.name || baseUrl,
      baseUrl,
      publicKey: body.publicKey || discovered.publicKey,
      keyId: discovered.keyId,
      discoveredAt: new Date(),
      keyRotation: {
        currentKeyId: discovered.keyId || null,
        previousKeyIds: [],
        rotatedAt: null
      },
      status: body.status || 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const result = await this.connection.collection('federationservers').insertOne(doc)
    return { _id: result.insertedId, ...doc }
  }

  @Patch('federation/servers/:id')
  async updateFederationServer(@Req() req: any, @Param('id') id: string, @Body() body: any): Promise<any> {
    await this.assertAdmin(req)
    const update = { ...body }
    if (update.baseUrl) update.baseUrl = await validateFederationBaseUrl(update.baseUrl)
    await this.connection.collection('federationservers').updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { ...update, updatedAt: new Date() } }
    )
    return this.connection.collection('federationservers').findOne({ _id: new Types.ObjectId(id) })
  }

  @Delete('federation/servers/:id')
  async deleteFederationServer(@Req() req: any, @Param('id') id: string) {
    await this.assertAdmin(req)
    if (!Types.ObjectId.isValid(id)) throw new ForbiddenException('Invalid federation server id')
    await this.connection.collection('federationservers').deleteOne({ _id: new Types.ObjectId(id) })
    return { success: true }
  }

  @Get('moderation/overview')
  async moderationOverview(@Req() req: any): Promise<any> {
    await this.assertAdmin(req)
    const [reports, logs] = await Promise.all([
      this.connection.collection('reports').find({}).sort({ createdAt: -1 }).limit(20).toArray().catch(() => []),
      this.connection.collection('modlogs').find({}).sort({ createdAt: -1 }).limit(20).toArray().catch(() => [])
    ])
    return { reports, logs }
  }

  @Get('security/config')
  async securityConfig(@Req() req: any) {
    await this.assertAdmin(req)
    let [security, rateLimits, rules] = await Promise.all([
      this.redis.getJson('jb:config:security'),
      this.redis.getJson('jb:config:rate-limits'),
      this.redis.getJson('jb:config:server-rules')
    ])
    if (!security && !rateLimits && !rules) {
      const persisted = await this.connection.collection('serverconfigs').findOne({ key: 'security' })
      security = persisted?.security
      rateLimits = persisted?.rateLimits
      rules = persisted?.rules
    }
    return {
      security: security || { registrationsOpen: true },
      rateLimits: rateLimits || {},
      rules: rules || []
    }
  }

  @Put('security/config')
  async updateSecurityConfig(
    @Req() req: any,
    @Body() body: { registrationsOpen?: boolean; rateLimits?: Record<string, { limit?: number; windowMs?: number }>; rules?: string[] }
  ) {
    await this.assertAdmin(req)
    const security = { registrationsOpen: body.registrationsOpen !== false, updatedAt: new Date().toISOString() }
    const rateLimits = sanitizeRateLimits(body.rateLimits || {})
    const rules = Array.isArray(body.rules) ? body.rules.map((rule) => String(rule).trim()).filter(Boolean).slice(0, 25) : []
    await Promise.all([
      this.redis.setJson('jb:config:security', security, 60 * 60 * 24 * 365),
      this.redis.setJson('jb:config:rate-limits', rateLimits, 60 * 60 * 24 * 365),
      this.redis.setJson('jb:config:server-rules', rules, 60 * 60 * 24 * 365),
      this.connection.collection('serverconfigs').updateOne(
        { key: 'security' },
        { $set: { key: 'security', security, rateLimits, rules, updatedAt: new Date() } },
        { upsert: true }
      )
    ])
    return { security, rateLimits, rules }
  }

  @Get('security/ip-blocks')
  async listIpBlocks(@Req() req: any): Promise<any[]> {
    await this.assertAdmin(req)
    return this.connection.collection('ipblocks').find({}).sort({ createdAt: -1 }).limit(200).toArray()
  }

  @Post('security/ip-blocks')
  async addIpBlock(@Req() req: any, @Body() body: { ip: string; reason?: string }) {
    await this.assertAdmin(req)
    const ip = normalizeIp(body.ip)
    const doc = {
      ip,
      reason: String(body.reason || 'server_admin_block').slice(0, 500),
      createdBy: new Types.ObjectId(String(req.user.id)),
      createdAt: new Date()
    }
    await this.connection.collection('ipblocks').updateOne({ ip }, { $set: doc }, { upsert: true })
    await this.redis.getClient().set(`jb:security:ip-block:${ip}`, '1')
    return doc
  }

  @Delete('security/ip-blocks/:ip')
  async deleteIpBlock(@Req() req: any, @Param('ip') ipParam: string) {
    await this.assertAdmin(req)
    const ip = normalizeIp(decodeURIComponent(ipParam))
    await this.connection.collection('ipblocks').deleteOne({ ip })
    await this.redis.delKeys(`jb:security:ip-block:${ip}`)
    return { success: true }
  }

  private async assertAdmin(req: any) {
    const flags = BigInt(req.user?.abac || 0)
    if ((flags & GLOBAL_ADMIN_BIT) !== BigInt(0)) return
    const auth = await this.connection.collection('auths').findOne({ _id: new Types.ObjectId(String(req.user?.id)) })
    const storedFlags = BigInt(auth?.abac || 0)
    if ((storedFlags & GLOBAL_ADMIN_BIT) === BigInt(0)) throw new ForbiddenException('Global admin required')
  }
}

function sanitizeRateLimits(input: Record<string, { limit?: number; windowMs?: number }>) {
  const allowed = new Set([
    'auth-challenge',
    'auth-submit',
    'account-create',
    'account-create-subnet',
    'post-create',
    'post-update',
    'comment-create',
    'message-send',
    'message-reply',
    'attachment-upload-url',
    'federation-inbox'
  ])
  return Object.entries(input).reduce((acc: Record<string, { limit: number; windowMs: number }>, [scope, value]) => {
    if (!allowed.has(scope)) return acc
    const limit = Math.min(Math.max(Number(value.limit || 1), 1), 10000)
    const windowMs = Math.min(Math.max(Number(value.windowMs || 60000), 1000), 24 * 60 * 60 * 1000)
    acc[scope] = { limit: Math.floor(limit), windowMs: Math.floor(windowMs) }
    return acc
  }, {})
}

function normalizeIp(raw: string) {
  const ip = String(raw || '').trim()
  if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw new BadRequestException('Invalid IP address')
  return ip
}

async function validateFederationBaseUrl(raw: string) {
  let parsed: URL
  try {
    parsed = new URL(String(raw || '').trim())
  } catch {
    throw new BadRequestException('Invalid federation baseUrl')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new BadRequestException('Federation baseUrl must use http or https')
  if (parsed.username || parsed.password) throw new BadRequestException('Federation baseUrl must not contain credentials')
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) throw new BadRequestException('Federation baseUrl must be an origin only')

  const hostname = parsed.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) throw new BadRequestException('Local federation baseUrl is not allowed')
  if (isPrivateHost(hostname)) throw new BadRequestException('Private federation baseUrl is not allowed')
  await assertPublicDns(hostname)

  return parsed.origin
}

async function discoverFederationIdentity(baseUrl: string) {
  const url = `${baseUrl}/.well-known/jagoo-bahee`
  const identity = await boundedJsonFetch(url, 0)
  if (!identity || typeof identity !== 'object') throw new BadRequestException('Federation discovery response must be an object')
  if (identity.baseUrl && String(identity.baseUrl).replace(/\/$/, '') !== baseUrl) {
    throw new BadRequestException('Federation discovery baseUrl mismatch')
  }
  return identity as any
}

async function boundedJsonFetch(raw: string, redirectCount: number): Promise<any> {
  if (redirectCount > Number(process.env.FEDERATION_DISCOVERY_MAX_REDIRECTS || 2)) {
    throw new BadRequestException('Federation discovery redirect limit exceeded')
  }
  const parsed = new URL(raw)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new BadRequestException('Federation discovery must use http or https')
  if (isPrivateHost(parsed.hostname.toLowerCase())) throw new BadRequestException('Federation discovery resolved to a private address')
  await assertPublicDns(parsed.hostname)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.FEDERATION_DISCOVERY_TIMEOUT_MS || 5000))
  try {
    const response = await fetch(parsed.toString(), { redirect: 'manual', signal: controller.signal })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new BadRequestException('Federation discovery redirect missing Location')
      return boundedJsonFetch(new URL(location, parsed).toString(), redirectCount + 1)
    }
    if (!response.ok) throw new BadRequestException('Federation discovery failed')
    const maxBytes = Number(process.env.FEDERATION_DISCOVERY_MAX_RESPONSE_BYTES || 64 * 1024)
    const reader = response.body?.getReader()
    if (!reader) throw new BadRequestException('Federation discovery response is not readable')
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) throw new BadRequestException('Federation discovery response too large')
        chunks.push(value)
      }
    }
    const rawBody = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
    return JSON.parse(rawBody)
  } finally {
    clearTimeout(timeout)
  }
}

async function assertPublicDns(hostname: string) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':')) return
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true })
    if (addresses.length === 0 || addresses.some((item) => isPrivateHost(item.address.toLowerCase()))) {
      throw new BadRequestException('Federation baseUrl must resolve to public addresses')
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error
    throw new BadRequestException('Federation baseUrl DNS resolution failed')
  }
}

function isPrivateHost(hostname: string) {
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number)
    if (parts.some((part) => part < 0 || part > 255)) return true
    const [a, b] = parts
    return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0
  }

  if (hostname === '::1' || hostname === '[::1]') return true
  if (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) return true
  return false
}
