import { Module } from '@nestjs/common'
import { SharedModule } from 'src/common/shared.module'
import { FederationController } from './federation.controller'
import { FederationService } from './federation.service'

@Module({
  imports: [SharedModule],
  controllers: [FederationController],
  providers: [FederationService],
  exports: [FederationService]
})
export class FederationModule {}
