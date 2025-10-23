import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { UsersService } from './users.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { Types } from 'mongoose'

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@Query('q') q?: string, @Query('limit') limit = '50', @Query('skip') skip = '0') {
    let filter: any = {}
    if (q) {
      const searchRegex = { $regex: q, $options: 'i' }
      filter = { $or: [{ username: searchRegex }, { displayName: searchRegex }, { bio: searchRegex }] }
    }
    return this.usersService.findAll(filter, Number(limit), Number(skip))
  }

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Get('username/:username')
  async getUserByUsername(@Param('username') username: string) {
    // Find user by username
    return this.usersService.findByUsername(username)
  }

  @Get(':id/posts')
  async getUserPosts(@Param('id') id: string, @Query('limit') limit = '50', @Query('skip') skip = '0') {
    // Get posts by user ID
    console.log('[getUserPosts] Fetching posts for user ID:', id)
    const db = (this as any).usersService?.userModel?.db
    if (!db) {
      console.warn('[getUserPosts] Database not available')
      return []
    }

    try {
      const posts = await db
        .collection('posts')
        .find({ authorId: new Types.ObjectId(id) })
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(skip))
        .toArray()

      console.log(`[getUserPosts] Found ${posts.length} posts for user ${id}`)
      return posts
    } catch (error) {
      console.error('[getUserPosts] Error fetching posts:', error)
      return []
    }
  }

  @Get(':id/comments')
  async getUserComments(@Param('id') id: string, @Query('limit') limit = '50', @Query('skip') skip = '0') {
    // Get comments by user ID
    console.log('[getUserComments] Fetching comments for user ID:', id)
    const db = (this as any).usersService?.userModel?.db
    if (!db) {
      console.warn('[getUserComments] Database not available')
      return []
    }

    try {
      const comments = await db
        .collection('comments')
        .find({ authorId: new Types.ObjectId(id) })
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(skip))
        .toArray()

      console.log(`[getUserComments] Found ${comments.length} comments for user ${id}`)
      return comments
    } catch (error) {
      console.error('[getUserComments] Error fetching comments:', error)
      return []
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/profile')
  async me(@Req() req: any) {
    const authId = req.user?.id
    return this.usersService.findByAuthId(authId)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/subreddits')
  async mySubreddits(@Req() req: any) {
    // Return the list of subreddits the current authenticated user is a member of
    const authId = req.user?.id
    console.log(`Fetching subreddits for authId ${authId}`)
    if (!authId) return []
    // find the User document for this auth; if missing, create one so membership records can be resolved
    let me = await this.usersService.findByAuthId(authId)
    if (!me || !(me as any)._id) {
      try {
        me = await this.usersService.ensureUserForAuth(authId)
      } catch (e) {
        me = null as any
      }
    }
    if (!me || !(me as any)._id) return []
    console.log(`Fetching subreddits for user ${me._id}`)
    try {
      // Use a direct collection aggregation to avoid changing module DI.
      const { Types } = await import('mongoose')
      const db = (this as any).usersService?.userModel?.db || (await import('mongoose')).connection.db
      const pipeline = [
        { $match: { userId: new Types.ObjectId(String(me._id)) } },
        {
          $lookup: {
            from: 'subreddits',
            localField: 'subredditId',
            foreignField: '_id',
            as: 'subreddit'
          }
        },
        { $unwind: { path: '$subreddit', preserveNullAndEmptyArrays: false } },
        { $replaceRoot: { newRoot: '$subreddit' } },
        { $sort: { createdAt: -1 } }
      ]
      const col = db.collection('subredditmembers')
      const results = await col.aggregate(pipeline).toArray()
      return results
    } catch (e) {
      return []
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/create')
  async createForAuth(@Req() req: any, @Body() body: CreateUserDto) {
    const authId = req.user?.id
    // Use ensureUserForAuth which will try to create a unique username and
    // respects the preferred username supplied by the client.
    return this.usersService.ensureUserForAuth(authId, body.username)
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  async updateProfile(@Req() req: any, @Body() body: UpdateUserDto) {
    const authId = req.user?.id
    const existing = await this.usersService.findByAuthId(authId)
    if (!existing) return null
    return this.usersService.updateProfile(existing._id as any, body as any)
  }

  // Follow / Unfollow
  @UseGuards(JwtAuthGuard)
  @Post('me/follow/:targetId')
  async follow(@Req() req: any, @Param('targetId') targetId: string) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return null
    return this.usersService.followUser(me._id as Types.ObjectId, new Types.ObjectId(targetId))
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/unfollow/:targetId')
  async unfollow(@Req() req: any, @Param('targetId') targetId: string) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return null
    return this.usersService.unfollowUser(me._id as Types.ObjectId, new Types.ObjectId(targetId))
  }

  // Save / Unsave content
  @UseGuards(JwtAuthGuard)
  @Post('me/save')
  async saveContent(@Req() req: any, @Body() body: { targetId: string; targetType: string; category?: string }) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return null
    // Normalize targetType to capitalized model name
    const normalizedType =
      body.targetType === 'post' ? 'Post' : body.targetType === 'comment' ? 'Comment' : body.targetType
    return this.usersService.saveContent(
      me._id as Types.ObjectId,
      new Types.ObjectId(body.targetId),
      normalizedType,
      body.category
    )
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/unsave')
  async unsaveContent(@Req() req: any, @Body() body: { targetId: string; targetType: string }) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return null
    // Normalize targetType to capitalized model name
    const normalizedType =
      body.targetType === 'post' ? 'Post' : body.targetType === 'comment' ? 'Comment' : body.targetType
    return this.usersService.unsaveContent(me._id as Types.ObjectId, new Types.ObjectId(body.targetId), normalizedType)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/saved/:targetType')
  async getSavedContent(@Req() req: any, @Param('targetType') targetType: string) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return []
    // Normalize targetType to capitalized model name
    const normalizedType = targetType === 'posts' ? 'Post' : targetType === 'comments' ? 'Comment' : targetType
    return this.usersService.getSavedContent(me._id as Types.ObjectId, normalizedType)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/is-saved/:targetId')
  async isSaved(@Req() req: any, @Param('targetId') targetId: string) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return { saved: false }
    const saved = await this.usersService.isSaved(me._id as Types.ObjectId, new Types.ObjectId(targetId))
    return { saved }
  }

  // Block / Unblock
  @UseGuards(JwtAuthGuard)
  @Post('me/block/:targetId')
  async block(@Req() req: any, @Param('targetId') targetId: string, @Body() body: { reason?: string }) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return null
    return this.usersService.blockUser(me._id as Types.ObjectId, new Types.ObjectId(targetId), body?.reason)
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/unblock/:targetId')
  async unblock(@Req() req: any, @Param('targetId') targetId: string) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return null
    return this.usersService.unblockUser(me._id as Types.ObjectId, new Types.ObjectId(targetId))
  }

  // Feed preferences
  @UseGuards(JwtAuthGuard)
  @Get('me/feed-preferences')
  async getFeedPreferences(@Req() req: any) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return null
    return this.usersService.getFeedPreferences(me._id as Types.ObjectId)
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/feed-preferences')
  async upsertFeedPreferences(@Req() req: any, @Body() body: Partial<any>) {
    const authId = req.user?.id
    const me = await this.usersService.findByAuthId(authId)
    if (!me) return null
    return this.usersService.upsertFeedPreferences(me._id as Types.ObjectId, body)
  }
}
