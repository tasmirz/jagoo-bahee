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
}
