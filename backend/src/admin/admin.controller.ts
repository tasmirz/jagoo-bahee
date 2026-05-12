import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { InjectConnection } from '@nestjs/mongoose'
import { Connection, Types } from 'mongoose'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'

const GLOBAL_MOD_BIT = BigInt(1) << BigInt(4)
const GLOBAL_ADMIN_BIT = BigInt(1) << BigInt(5)

@Controller('admin')
@UseGuards(JwtAuthGuard)
export class AdminController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get('summary')
  async summary(@Req() req: any) {
    await this.assertAdmin(req)
    const [users, communities, posts, federationServers] = await Promise.all([
      this.connection.collection('users').countDocuments(),
      this.connection.collection('subreddits').countDocuments(),
      this.connection.collection('posts').countDocuments(),
      this.connection.collection('federationservers').countDocuments().catch(() => 0)
    ])
    return { users, communities, posts, federationServers }
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
        { $project: { username: 1, postKarma: 1, commentKarma: 1, createdAt: 1, abac: '$auth.abac', publicKey: '$auth.publicKey' } }
      ])
      .toArray()
    return users.map((user: any) => ({
      ...user,
      abac: String(user.abac || 0),
      publicKey: user.publicKey ? Buffer.from(user.publicKey.buffer || user.publicKey).toString('base64') : undefined
    }))
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
    const doc = {
      name: body.name || body.baseUrl,
      baseUrl: body.baseUrl?.replace(/\/$/, ''),
      publicKey: body.publicKey,
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
    await this.connection.collection('federationservers').updateOne(
      { _id: new Types.ObjectId(id) },
      { $set: { ...body, updatedAt: new Date() } }
    )
    return this.connection.collection('federationservers').findOne({ _id: new Types.ObjectId(id) })
  }

  private async assertAdmin(req: any) {
    const flags = BigInt(req.user?.abac || 0)
    if ((flags & GLOBAL_ADMIN_BIT) !== BigInt(0)) return
    const auth = await this.connection.collection('auths').findOne({ _id: new Types.ObjectId(String(req.user?.id)) })
    const storedFlags = BigInt(auth?.abac || 0)
    if ((storedFlags & GLOBAL_ADMIN_BIT) === BigInt(0)) throw new ForbiddenException('Global admin required')
  }
}
