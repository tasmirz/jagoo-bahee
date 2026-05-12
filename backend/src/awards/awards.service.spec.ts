import { Test, TestingModule } from '@nestjs/testing'
import { AwardsService } from './awards.service'
import { getModelToken } from '@nestjs/mongoose'
import { NotFoundException } from '@nestjs/common'
import { UsersService } from 'src/users/users.service'
import { NotificationsService } from 'src/notifications/notifications.service'
import { PostsService } from 'src/posts/posts.service'
import { CommentsService } from 'src/comments/comments.service'

describe('AwardsService', () => {
  let service: AwardsService
  let awardTypeModel: any
  let awardModel: any
  let usersService: any
  let notificationsService: any
  let postsService: any
  let commentsService: any

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AwardsService,
        {
          provide: getModelToken('AwardType'),
          useValue: {
            findById: jest.fn(),
            create: jest.fn(),
            find: jest.fn(),
            countDocuments: jest.fn(),
            findByIdAndUpdate: jest.fn(),
            deleteOne: jest.fn()
          }
        },
        {
          provide: getModelToken('Award'),
          useValue: {
            create: jest.fn(),
            find: jest.fn()
          }
        },
        {
          provide: UsersService,
          useValue: {
            adjustKarma: jest.fn()
          }
        },
        {
          provide: NotificationsService,
          useValue: {
            create: jest.fn()
          }
        },
        {
          provide: PostsService,
          useValue: {
            findById: jest.fn()
          }
        },
        {
          provide: CommentsService,
          useValue: {
            findById: jest.fn()
          }
        }
      ]
    }).compile()

    service = module.get<AwardsService>(AwardsService)
    awardTypeModel = module.get(getModelToken('AwardType'))
    awardModel = module.get(getModelToken('Award'))
    usersService = module.get(UsersService)
    notificationsService = module.get(NotificationsService)
    postsService = module.get(PostsService)
    commentsService = module.get(CommentsService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('giveAward', () => {
    it('should throw NotFoundException if awardType not found', async () => {
      awardTypeModel.findById.mockResolvedValue(null)
      await expect(
        service.giveAward('665b3f2a9c5a7d0012a1b235', {
          awardTypeId: '665b3f2a9c5a7d0012a1b234',
          targetId: '665b3f2a9c5a7d0012a1b300',
          targetType: 'post'
        } as any)
      ).rejects.toThrow(NotFoundException)
    })

    it('should successfully give an award to a post', async () => {
      const awardType = { _id: '665b3f2a9c5a7d0012a1b234', name: 'Gold', cost: 100 }
      const post = { _id: '665b3f2a9c5a7d0012a1b300', authorId: '665b3f2a9c5a7d0012a1b400' }
      const awardDoc = {
        _id: '665b3f2a9c5a7d0012a1b500',
        awardTypeId: '665b3f2a9c5a7d0012a1b234',
        giverId: '665b3f2a9c5a7d0012a1b235',
        targetId: '665b3f2a9c5a7d0012a1b300',
        targetType: 'post'
      }

      awardTypeModel.findById.mockResolvedValue(awardType)
      postsService.findById.mockResolvedValue(post)
      awardModel.create.mockResolvedValue(awardDoc)

      const result = await service.giveAward('665b3f2a9c5a7d0012a1b235', {
        awardTypeId: '665b3f2a9c5a7d0012a1b234',
        targetId: '665b3f2a9c5a7d0012a1b300',
        targetType: 'post'
      } as any)

      expect(result).toEqual(awardDoc)
      expect(notificationsService.create).toHaveBeenCalled()
      expect(usersService.adjustKarma).toHaveBeenCalledWith('665b3f2a9c5a7d0012a1b235', 'post', -100)
      expect(usersService.adjustKarma).toHaveBeenCalledWith('665b3f2a9c5a7d0012a1b400', 'post', 5)
    })
  })
})
