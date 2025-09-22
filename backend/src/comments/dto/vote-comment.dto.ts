import { ApiProperty } from '@nestjs/swagger'
import { IsIn, IsNumber } from 'class-validator'

export class VoteCommentDto {
  @ApiProperty({ enum: [-1, 0, 1], example: 1 })
  @IsNumber()
  @IsIn([-1, 0, 1])
  delta: -1 | 0 | 1
}
