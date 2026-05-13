import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { canonicalJson, sha256Hex } from 'src/common/canonical-json.util'
import { serverKeyId, signServerMessage, verifyServerSignature } from 'src/common/server-sign.util'
import { verifySignature } from 'src/common/signature.util'
import { AuditReceipt } from './schemas/audit-receipt.schema'

@Injectable()
export class AuditReceiptsService {
  constructor(@InjectModel(AuditReceipt.name) private readonly model: Model<AuditReceipt>) {}

  async create(input: {
    action: string
    subjectType: string
    subjectId: string | Types.ObjectId
    actorPublicKey?: string
    canonicalPayload: unknown
    actorSignature?: string
    legacy?: boolean
  }) {
    const serverBaseUrl = this.publicServerUrl()
    const canonicalPayload = typeof input.canonicalPayload === 'string' ? input.canonicalPayload : canonicalJson(input.canonicalPayload)
    const payloadHash = sha256Hex(canonicalPayload)
    const unsigned = {
      receiptVersion: 1,
      serverId: serverBaseUrl,
      serverBaseUrl,
      keyId: serverKeyId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: String(input.subjectId),
      contentType: input.subjectType,
      contentId: String(input.subjectId),
      actorPublicKey: input.actorPublicKey || '',
      userPublicKey: input.actorPublicKey || '',
      canonicalPayload,
      payloadHash,
      actorSignature: input.actorSignature || '',
      userSignature: input.actorSignature || '',
      legacy: input.legacy === true
    }
    const serverSignature = signServerMessage(canonicalJson(unsigned))
    return this.model.create({
      ...unsigned,
      subjectId: new Types.ObjectId(String(input.subjectId)),
      contentId: new Types.ObjectId(String(input.subjectId)),
      serverKeyId,
      serverSignature
    })
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Receipt not found')
    const receipt = await this.model.findById(id).lean().exec()
    if (!receipt) throw new NotFoundException('Receipt not found')
    return receipt
  }

  async findBySubject(type: string, id: string) {
    if (!Types.ObjectId.isValid(id)) return []
    return this.model.find({ subjectType: type, subjectId: new Types.ObjectId(id) }).sort({ createdAt: -1 }).lean().exec()
  }

  verifyReceipt(receipt: any) {
    if (!receipt?.canonicalPayload || !receipt?.payloadHash || !receipt?.serverSignature) {
      throw new BadRequestException('Invalid receipt envelope')
    }
    const payloadHash = sha256Hex(String(receipt.canonicalPayload))
    const payloadOk = payloadHash === receipt.payloadHash
    const unsigned = {
      receiptVersion: Number(receipt.receiptVersion || 1),
      serverId: String(receipt.serverId || receipt.serverBaseUrl || ''),
      serverBaseUrl: String(receipt.serverBaseUrl || receipt.serverId || ''),
      keyId: String(receipt.keyId || ''),
      action: String(receipt.action || ''),
      subjectType: String(receipt.subjectType || receipt.contentType || ''),
      subjectId: String(receipt.subjectId || receipt.contentId || ''),
      contentType: String(receipt.contentType || receipt.subjectType || ''),
      contentId: String(receipt.contentId || receipt.subjectId || ''),
      actorPublicKey: String(receipt.actorPublicKey || receipt.userPublicKey || ''),
      userPublicKey: String(receipt.userPublicKey || receipt.actorPublicKey || ''),
      canonicalPayload: String(receipt.canonicalPayload || ''),
      payloadHash: String(receipt.payloadHash || ''),
      actorSignature: String(receipt.actorSignature || receipt.userSignature || ''),
      userSignature: String(receipt.userSignature || receipt.actorSignature || ''),
      legacy: receipt.legacy === true
    }
    const serverOk = verifyServerSignature(canonicalJson(unsigned), String(receipt.serverSignature || ''))
    let actorOk: boolean | null = null
    if (receipt.actorPublicKey && receipt.actorSignature) {
      actorOk = verifySignature(Buffer.from(String(receipt.actorPublicKey), 'base64'), String(receipt.canonicalPayload), String(receipt.actorSignature))
    }
    return { ok: payloadOk && serverOk && actorOk !== false, payloadOk, serverOk, actorOk }
  }

  verifySignature(publicKey: string, payload: string, signature: string) {
    return { ok: verifySignature(Buffer.from(publicKey, 'base64'), payload, signature) }
  }

  private publicServerUrl() {
    return (process.env.PUBLIC_SERVER_URL || `http://localhost:${process.env.PORT || 6000}`).replace(/\/$/, '')
  }
}
