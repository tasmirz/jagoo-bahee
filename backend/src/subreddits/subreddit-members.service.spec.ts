import { Test, TestingModule } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { Types } from 'mongoose'
import { SubredditMembersService } from './subreddit-members.service'
import { SubredditMember } from './schemas/subreddit-member.schema'
import { ModLogService } from 'src/moderation/mod-log.service'
import { RedisService } from 'src/redis/redis.service'

describe('SubredditMembersService permission cache', () => {
  let service: SubredditMembersService
  let model: any
  let redis: any

  const subredditId = new Types.ObjectId().toString()
  const userId = new Types.ObjectId().toString()

  beforeEach(async () => {
    model = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findById: jest.fn()
    }
    redis = {
      rememberJson: jest.fn((_key: string, _ttl: number, loader: () => Promise<unknown>) => loader()),
      setJson: jest.fn(),
      getJson: jest.fn(),
      delKeys: jest.fn()
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubredditMembersService,
        { provide: getModelToken(SubredditMember.name), useValue: model },
        { provide: ModLogService, useValue: { createLog: jest.fn() } },
        { provide: RedisService, useValue: redis }
      ]
    }).compile()

    service = module.get(SubredditMembersService)
  })

  it('returns cached granular permissions for a moderator membership', async () => {
    model.findOne.mockReturnValue({
      lean: () => ({
        exec: jest.fn().mockResolvedValue({
          subredditId,
          userId,
          statusFlags: BigInt(9)
        })
      })
    })

    const result = await service.getPermissionSummary(subredditId, userId)

    expect(redis.rememberJson).toHaveBeenCalledWith(
      `jb:permissions:${subredditId}:${userId}`,
      expect.any(Number),
      expect.any(Function)
    )
    expect(result?.isMember).toBe(true)
    expect(result?.isModerator).toBe(true)
    expect(result?.permissions).toContain('post.moderate')
    expect(result?.permissions).toContain('member.role.update')
  })

  it('invalidates member and permission cache when status changes', async () => {
    model.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        _id: new Types.ObjectId(),
        subredditId,
        userId,
        statusFlags: BigInt(1)
      })
    })

    await service.updateStatus(new Types.ObjectId().toString(), BigInt(1), new Types.ObjectId().toString(), 'sig')

    expect(redis.delKeys).toHaveBeenCalledWith(`jb:member:${subredditId}:${userId}`, `jb:permissions:${subredditId}:${userId}`)
  })
})
