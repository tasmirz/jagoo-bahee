import { IsArray, IsBoolean, IsDateString, IsEnum, IsMongoId, IsOptional, IsString, MaxLength, ArrayUnique, ValidateNested } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'

class PollDto {
  @ApiProperty({ example: 'Which option should we pick?' })
  @IsString()
  @MaxLength(300)
  question: string

  @ApiProperty({ type: [String], example: ['A', 'B'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  options: string[]

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  multiple?: boolean

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  closesAt?: string
}

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

  @ApiProperty({ enum: ['text', 'link', 'image', 'video', 'poll', 'crosspost'] })
  @IsEnum(['text', 'link', 'image', 'video', 'poll', 'crosspost'])
  type: 'text' | 'link' | 'image' | 'video' | 'poll' | 'crosspost'

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

  @ApiPropertyOptional({ type: PollDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PollDto)
  poll?: PollDto

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
