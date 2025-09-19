import { AttachmentsService } from '../src/attachments/attachments.service'
import { MinioService } from '../src/attachments/minio.service'

// Minimal mock Model with findOne
const makeMockModel = (doc: any) => ({
  findOne: jest.fn(() => ({ exec: async () => doc }))
})

describe('AttachmentsService.assertOwnerOrAdminOrModerator', () => {
  it('allows owner', async () => {
    const doc = { ownerId: 'owner123', minioKey: 'k' }
    const model: any = makeMockModel(doc)
    const ms: any = {} as MinioService
    const svc = new AttachmentsService(model as any, ms)
    const user = { id: 'owner123', abac: 0 }
    const res = await svc.assertOwnerOrAdminOrModerator('k', user)
    expect(res).toBeTruthy()
  })

  it('allows moderator via abac bit 4', async () => {
    const doc = { ownerId: 'owner123', minioKey: 'k' }
    const model: any = makeMockModel(doc)
    const ms: any = {} as MinioService
    const svc = new AttachmentsService(model as any, ms)
    const user = { id: 'other', abac: String(1 << 4) }
    const res = await svc.assertOwnerOrAdminOrModerator('k', user)
    expect(res).toBeTruthy()
  })

  it('allows admin via abac bit 5', async () => {
    const doc = { ownerId: 'owner123', minioKey: 'k' }
    const model: any = makeMockModel(doc)
    const ms: any = {} as MinioService
    const svc = new AttachmentsService(model as any, ms)
    const user = { id: 'other', abac: String(1 << 5) }
    const res = await svc.assertOwnerOrAdminOrModerator('k', user)
    expect(res).toBeTruthy()
  })

  it('rejects non-owner non-privileged', async () => {
    const doc = { ownerId: 'owner123', minioKey: 'k' }
    const model: any = makeMockModel(doc)
    const ms: any = {} as MinioService
    const svc = new AttachmentsService(model as any, ms)
    const user = { id: 'other', abac: 0 }
    await expect(svc.assertOwnerOrAdminOrModerator('k', user)).rejects.toThrow()
  })
})
