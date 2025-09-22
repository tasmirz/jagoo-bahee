import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsMongoId, IsOptional, IsString } from 'class-validator'

export class AddMemberDto {
  @ApiProperty({ example: '665b3f2a9c5a7d0012a1b235' })
  @IsMongoId()
  userId: string

  @ApiPropertyOptional({ example: 'invited' })
  @IsOptional()
  @IsString()
  type?: 'member' | 'moderator' | 'invited'

  @ApiPropertyOptional({ example: 'Welcome!' })
  @IsOptional()
  @IsString()
  note?: string
}
