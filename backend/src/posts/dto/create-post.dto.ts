import { IsArray, IsEnum, IsMongoId, IsOptional, IsString, MaxLength, ArrayUnique } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class CreatePostDto {
  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b234' })
  @IsMongoId()
  subredditId: string

  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b235' })
  @IsMongoId()
  authorId: string

  @ApiProperty({ example: 'Check out my project' })
  @IsString()
  @MaxLength(300)
  title: string

  @ApiProperty({ enum: ['text', 'link', 'image', 'video', 'crosspost'] })
  @IsEnum(['text', 'link', 'image', 'video', 'crosspost'])
  type: 'text' | 'link' | 'image' | 'video' | 'crosspost'

  @ApiPropertyOptional({ example: 'Markdown content' })
  @IsOptional()
  @IsString()
  content?: string

  @ApiPropertyOptional({ example: 'https://example.com' })
  @IsOptional()
  @IsString()
  url?: string

  @ApiPropertyOptional({ type: [String], example: [] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsMongoId({ each: true })
  attachmentIds?: string[]

  @ApiPropertyOptional({ example: '665b3f2a9c5a7d0012a1b240' })
  @IsOptional()
  @IsMongoId()
  crosspostId?: string

  @ApiPropertyOptional({ example: 'Showcase' })
  @IsOptional()
  @IsString()
  flair?: string

  @ApiProperty({ example: 'hex-signature' })
  @IsString()
  userSignature: string

  @ApiProperty({ example: 'sha256:abcdef...' })
  @IsString()
  contentHash: string
}
