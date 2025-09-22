import { IsArray, IsMongoId, IsOptional, IsString, MaxLength, ArrayUnique } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class UpdatePostDto {
  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b235' })
  @IsMongoId()
  authorId: string

  @ApiPropertyOptional({ example: 'Updated title' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string

  @ApiPropertyOptional({ example: 'Updated markdown body' })
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

  @ApiPropertyOptional({ example: 'Showcase' })
  @IsOptional()
  @IsString()
  flair?: string
}
