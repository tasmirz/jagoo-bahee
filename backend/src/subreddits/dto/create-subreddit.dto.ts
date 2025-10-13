import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateSubredditDto {
  @ApiProperty({ example: 'programming' })
  @IsString()
  name: string

  @ApiProperty({ example: 'Programming' })
  @IsString()
  displayName: string

  @ApiPropertyOptional({ example: 'A place to discuss coding.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiPropertyOptional({ example: ['javascript', 'webdev'] })
  @IsOptional()
  @IsArray()
  tags?: string[]

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  nsfw?: boolean

  @ApiPropertyOptional({ example: { primary: '#053326', accent: '#053326', background: '#ffffff' } })
  @IsOptional()
  theme?: {
    primary?: string
    accent?: string
    background?: string
    foreground?: string
  }

  @ApiPropertyOptional({ example: '64a7f2e5...' })
  @IsOptional()
  @IsString()
  iconAttachmentId?: string

  @ApiPropertyOptional({ example: '64a7f2e5...' })
  @IsOptional()
  @IsString()
  bannerAttachmentId?: string

  @ApiPropertyOptional({ example: '# Community rules in markdown' })
  @IsOptional()
  @IsString()
  rules?: string
}
