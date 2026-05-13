import { Types } from 'mongoose'
import { ModerationEventsService } from './moderation-events.service'

describe('ModerationEventsService', () => {
  it('builds append-only signed moderation events and acknowledgements', async () => {
    const subredditId = new Types.ObjectId()
    const actorAuthId = new Types.ObjectId()
    const targetId = new Types.ObjectId()
    const model: any = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ eventHash: 'previous-hash' })
          })
        })
      }),
      create: jest.fn().mockImplementation(async (doc) => ({ ...doc, _id: new Types.ObjectId() }))
    }
    const authModel: any = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({ publicKey: Buffer.from('actor-key') })
          })
        })
      })
    }
    const acknowledgements: any = { create: jest.fn().mockResolvedValue({}) }
    const service = new ModerationEventsService(model, authModel, acknowledgements)

    const event = await service.createEvent({
      subredditId,
      actorAuthId,
      action: 'post.remove',
      targetType: 'post',
      targetId,
      reason: 'spam',
      details: { previousState: { statusFlags: 1 }, newState: { statusFlags: 2 } },
      moderatorSignature: 'moderator-signature'
    })

    expect(event.eventVersion).toBe(1)
    expect(event.previousEventHash).toBe('previous-hash')
    expect(event.previousStateHash).toMatch(/^[a-f0-9]{64}$/)
    expect(event.newStateHash).toMatch(/^[a-f0-9]{64}$/)
    expect(event.eventHash).toMatch(/^[a-f0-9]{64}$/)
    expect(event.serverSignature).toEqual(expect.any(String))
    expect(acknowledgements.create).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: 'moderation_event',
        action: 'created',
        contentHash: event.eventHash,
        userSignature: 'moderator-signature'
      })
    )
  })
})
