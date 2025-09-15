import { IsOptional, IsString, Length } from 'class-validator'

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(3, 30)
  username?: string

  @IsOptional()
  @IsString()
  avatarUrl?: string

  @IsOptional()
  @IsString()
  bio?: string
}
