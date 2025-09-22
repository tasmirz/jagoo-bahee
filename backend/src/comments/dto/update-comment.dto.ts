import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsMongoId, IsOptional, IsString } from 'class-validator'

export class UpdateCommentDto {
  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b235' })
  @IsMongoId()
  authorId: string

  @ApiPropertyOptional({ example: 'Edited content' })
  @IsOptional()
  @IsString()
  content?: string
}
