import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsMongoId, IsOptional, IsString } from 'class-validator'

export class PostModBaseDto {
  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b210' })
  @IsMongoId()
  subredditId: string

  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b200' })
  @IsMongoId()
  moderatorId: string
}

export class PostModRemoveDto extends PostModBaseDto {
  @ApiPropertyOptional({ example: 'Off-topic' })
  @IsOptional()
  @IsString()
  reason?: string
}
