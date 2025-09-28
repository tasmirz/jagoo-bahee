import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AwardsService } from './awards.service'
import { AwardsController } from './awards.controller'
import { AwardType, AwardTypeSchema } from './schemas/award-type.schema'
import { Award, AwardSchema } from './schemas/award.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AwardType.name, schema: AwardTypeSchema },
      { name: Award.name, schema: AwardSchema }
    ])
  ],
  controllers: [AwardsController],
  providers: [AwardsService],
  exports: [AwardsService]
})
export class AwardsModule {}
