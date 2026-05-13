import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsMongoId, IsOptional, IsString, ArrayUnique } from 'class-validator'

export class CreateCommentDto {
  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b300' })
  @IsMongoId()
  postId: string

  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b234' })
  @IsMongoId()
  subredditId: string

  @ApiPropertyOptional({ example: '665b3f2a9c5a7d0012a1b235', description: 'Legacy field ignored; backend derives author from JWT.' })
  @IsOptional()
  @IsMongoId()
  authorId?: string

  @ApiPropertyOptional({ example: '665b3f2a9c5a7d0012a1b333' })
  @IsOptional()
  @IsMongoId()
  parentId?: string

  @ApiProperty({ example: 'Nice work!' })
  @IsString()
  content: string

  @ApiPropertyOptional({ type: [String], example: [] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  attachmentIds?: string[]

  @ApiProperty({ example: 'hex-signature' })
  @IsString()
  userSignature: string

  @ApiProperty({ example: 'sha256:...' })
  @IsString()
  contentHash: string
}
