import { HttpException } from '@nestjs/common'
import { Types } from 'mongoose'
import { AttachmentsService } from './attachments.service'

describe('AttachmentsService hardening', () => {
  let service: AttachmentsService
  let model: any
  let minio: any

  beforeEach(() => {
    model = jest.fn()
    model.find = jest.fn()
    model.findById = jest.fn()
    model.findByIdAndUpdate = jest.fn()
    model.findByIdAndDelete = jest.fn()
    model.findOne = jest.fn()
    minio = {
      ensureBucket: jest.fn(),
      presignedPutObject: jest.fn(),
      headObject: jest.fn(),
      deleteObject: jest.fn()
    }
    service = new AttachmentsService(model as any, minio)
  })

  it('clamps attachment list limits and skips', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([])
    }
    model.find.mockReturnValue(chain)

    await service.findAll({}, 100000, 1000000)

    expect(chain.limit).toHaveBeenCalledWith(100)
    expect(chain.skip).toHaveBeenCalledWith(10000)
  })

  it('rejects declared oversized uploads before presigning', async () => {
    await expect(
      service.createUploadUrl({
        ownerId: new Types.ObjectId().toString(),
        originalFilename: 'large.bin',
        mimeType: 'application/octet-stream',
        sizeBytes: 999999999,
        type: 'document',
        signature: 'sig',
        contentHash: 'hash'
      })
    ).rejects.toThrow(HttpException)
    expect(minio.presignedPutObject).not.toHaveBeenCalled()
  })

  it('does not let confirmed file proof metadata be mutated', async () => {
    const id = new Types.ObjectId().toString()
    model.findById.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ _id: id, confirmed: true })
    })
    model.findByIdAndUpdate.mockReturnValue({
      exec: jest.fn().mockResolvedValue({})
    })

    await service.update(id, {
      contentHash: 'evil',
      signature: 'evil',
      sizeBytes: 999,
      isPublic: false
    } as any)

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(id, { isPublic: false }, { new: true })
  })
})
