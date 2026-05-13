import { BadRequestException } from '@nestjs/common'
import { ModLogService } from './mod-log.service'

describe('ModLogService', () => {
  it('rejects empty moderator signatures for human moderation events', async () => {
    const model = { create: jest.fn() }
    const service = new ModLogService(model as any)

    await expect(
      service.createLog({
        subredditId: '665b3f2a9c5a7d0012a1b210',
        moderatorId: '665b3f2a9c5a7d0012a1b200',
        action: 'post.remove',
        targetType: 'post',
        targetId: '665b3f2a9c5a7d0012a1b300'
      })
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(model.create).not.toHaveBeenCalled()
  })

  it('allows explicit server-attested system events', async () => {
    const model = { create: jest.fn().mockResolvedValue({ _id: 'log-1' }) }
    const service = new ModLogService(model as any)

    await service.createLog({
      subredditId: '665b3f2a9c5a7d0012a1b210',
      action: 'system.unban_expired',
      targetType: 'user',
      targetId: '665b3f2a9c5a7d0012a1b300'
    })

    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ moderatorSignature: 'server-attested-system-event' }))
  })
})
