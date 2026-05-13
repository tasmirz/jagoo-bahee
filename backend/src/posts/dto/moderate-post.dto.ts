import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsMongoId, IsOptional, IsString } from 'class-validator'

export class PostModBaseDto {
  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b210' })
  @IsMongoId()
  subredditId: string

  @ApiPropertyOptional({ example: '665b3f2a9c5a7d0012a1b200', description: 'Legacy field ignored; backend derives moderator from JWT.' })
  @IsOptional()
  @IsMongoId()
  moderatorId?: string
}

export class PostModRemoveDto extends PostModBaseDto {
  @ApiPropertyOptional({ example: 'Off-topic' })
  @IsOptional()
  @IsString()
  reason?: string
}
