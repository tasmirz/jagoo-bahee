import { Controller, Get } from '@nestjs/common'
import { getServerPublicKeyBase64, serverKeyId } from 'src/common/server-sign.util'
import { ApiTags } from '@nestjs/swagger'

@ApiTags('moderation')
@Controller('moderation')
export class ModerationController {
  @Get('server-public-key')
  getServerPublicKey() {
    return { keyId: serverKeyId, publicKey: getServerPublicKeyBase64() }
  }
}
