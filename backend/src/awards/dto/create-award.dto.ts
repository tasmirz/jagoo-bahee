import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class CreateAwardDto {
  @IsNotEmpty()
  awardTypeId: string

  @IsNotEmpty()
  targetId: string

  @IsEnum(['post', 'comment'])
  targetType: 'post' | 'comment'

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean

  @IsOptional()
  @IsString()
  message?: string
}
