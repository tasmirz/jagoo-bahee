import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsMongoId, IsOptional, IsString } from 'class-validator'

export class UpdateCommentDto {
  @ApiPropertyOptional({ example: '665b3f2a9c5a7d0012a1b235', description: 'Legacy field ignored; backend derives author from JWT.' })
  @IsOptional()
  @IsMongoId()
  authorId?: string

  @ApiPropertyOptional({ example: 'Edited content' })
  @IsOptional()
  @IsString()
  content?: string

  @ApiPropertyOptional({ example: 'base64-signature' })
  @IsOptional()
  @IsString()
  userSignature?: string

  @ApiPropertyOptional({ example: 'sha256-hex' })
  @IsOptional()
  @IsString()
  contentHash?: string
}
