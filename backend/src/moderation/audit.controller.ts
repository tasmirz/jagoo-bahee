import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { getServerPublicKeyBase64, serverKeyId } from 'src/common/server-sign.util'
import { AuditReceiptsService } from './audit-receipts.service'

@Controller('audit')
export class AuditController {
  constructor(private readonly receipts: AuditReceiptsService) {}

  @Get('server-key')
  serverKey() {
    return { keyId: serverKeyId, publicKey: getServerPublicKeyBase64() }
  }

  @Get('receipts/:id')
  getReceipt(@Param('id') id: string) {
    return this.receipts.findById(id)
  }

  @Get('subjects/:type/:id/receipts')
  getSubjectReceipts(@Param('type') type: string, @Param('id') id: string) {
    return this.receipts.findBySubject(type, id)
  }

  @Get('receipts/content/:type/:id')
  getContentReceipts(@Param('type') type: string, @Param('id') id: string) {
    return this.receipts.findBySubject(type, id)
  }

  @Post('verify-receipt')
  verifyReceipt(@Body() body: any) {
    return this.receipts.verifyReceipt(body?.receipt || body)
  }

  @Post('receipts/verify')
  verifyReceiptAlias(@Body() body: any) {
    return this.receipts.verifyReceipt(body?.receipt || body)
  }

  @Post('verify-signature')
  verifySignature(@Body() body: { publicKey: string; payload: string; signature: string }) {
    return this.receipts.verifySignature(body.publicKey, body.payload, body.signature)
  }

  @Post('signatures/verify')
  verifySignatureAlias(@Body() body: { publicKey: string; payload: string; signature: string }) {
    return this.receipts.verifySignature(body.publicKey, body.payload, body.signature)
  }
}
