import { Injectable, BadRequestException, NotFoundException, Inject, HttpException, HttpStatus } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Vote } from './schemas/vote.schema'
import { PostsService } from 'src/posts/posts.service'
import { CommentsService } from 'src/comments/comments.service'
import { UsersService } from 'src/users/users.service'
import { SubredditMembersService } from 'src/subreddits/subreddit-members.service'
import { RedisService } from 'src/redis/redis.service'

@Injectable()
export class VotesService {
  constructor(
    @InjectModel(Vote.name) private voteModel: Model<Vote>,
    private readonly postsService: PostsService,
    private readonly commentsService: CommentsService,
    private readonly usersService: UsersService,
    private readonly redis: RedisService,
    private readonly membersService: SubredditMembersService
  ) {}

  private async checkRateLimit(userId: string) {
    const client = this.redis.getClient()
    const key = `vote-limit:${userId}:60`
    const val = await client.incr(key)
    if (val === 1) await client.expire(key, 60)
    const max = Number(process.env.VOTE_RATE_LIMIT_PER_MINUTE || 100)
    if (val > max) throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS)
  }

  /** value: 1 | -1 | 0 (0=remove) */
  async castVote(userId: string, targetId: string, targetType: 'post' | 'comment', value: 1 | -1 | 0) {
    if (!['post', 'comment'].includes(targetType)) throw new BadRequestException('invalid targetType')
    await this.checkRateLimit(userId)

    try {
      const existing = await this.voteModel.findOne({ userId, targetId, targetType })

      // Prevent banned users from voting: find subreddit of target (if post/comment)
      let subredditId: string | null = null
      if (targetType === 'post') {
        const post = await this.postsService.findById(targetId)
        subredditId = String((post as any).subredditId)
      } else {
        const comment = await this.commentsService.findById(targetId)
        subredditId = String((comment as any).subredditId)
      }
      if (subredditId) {
        const member = await this.membersService.findBySubredditAndUser(subredditId, userId)
        if (member && (Number(member.statusFlags) & 4) !== 0) {
          throw new BadRequestException('You are banned from this subreddit')
        }
      }

      if (value === 0) {
        if (!existing) {
          return { action: 'noop' }
        }
        // remove existing
        const prev = existing.value as -1 | 1
        await this.voteModel.deleteOne({ _id: existing._id })
        // update counters
        if (targetType === 'post') {
          const post = await this.postsService.applyVoteChange(targetId, prev, 0 as 0)
          // adjust author karma by -prev
          await this.usersService.adjustKarma(String((post as any).authorId), 'post', -prev)
        } else {
          const comment = await this.commentsService.applyVoteChange(targetId, prev, 0 as 0)
          await this.usersService.adjustKarma(String((comment as any).authorId), 'comment', -prev)
        }
        return { action: 'removed' }
      }

      if (!existing) {
        // create new
        await this.voteModel.create({
          userId: new Types.ObjectId(userId),
          targetId: new Types.ObjectId(targetId),
          targetType,
          value
        })
        // inc counters
        if (targetType === 'post') {
          const post = await this.postsService.applyVoteChange(targetId, 0 as 0, value)
          await this.usersService.adjustKarma(String((post as any).authorId), 'post', value)
        } else {
          const comment = await this.commentsService.applyVoteChange(targetId, 0 as 0, value)
          await this.usersService.adjustKarma(String((comment as any).authorId), 'comment', value)
        }
        return { action: 'created', value }
      }

      // existing found
      if (existing.value === value) {
        // toggle off
        await this.voteModel.deleteOne({ _id: existing._id })
        if (targetType === 'post') {
          const prev = existing.value as -1 | 1
          const post = await this.postsService.applyVoteChange(targetId, prev, 0 as 0)
          await this.usersService.adjustKarma(String((post as any).authorId), 'post', -prev)
        } else {
          const prev = existing.value as -1 | 1
          const comment = await this.commentsService.applyVoteChange(targetId, prev, 0 as 0)
          await this.usersService.adjustKarma(String((comment as any).authorId), 'comment', -prev)
        }
        return { action: 'removed' }
      }

      // switch
      const prevVal = existing.value as -1 | 1
      await this.voteModel.updateOne({ _id: existing._id }, { $set: { value } })
      if (targetType === 'post') {
        const post = await this.postsService.applyVoteChange(targetId, prevVal, value as -1 | 1)
        await this.usersService.adjustKarma(String((post as any).authorId), 'post', (value as number) - prevVal)
      } else {
        const comment = await this.commentsService.applyVoteChange(targetId, prevVal, value as -1 | 1)
        await this.usersService.adjustKarma(String((comment as any).authorId), 'comment', (value as number) - prevVal)
      }
      return { action: 'updated', value }
    } catch (e) {
      throw e
    }
  }
}
