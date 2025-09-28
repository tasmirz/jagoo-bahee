import { IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class UpdateAwardTypeDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsString()
  @IsOptional()
  iconUrl?: string

  @IsNumber()
  @IsOptional()
  @Min(0)
  cost?: number

  @IsString()
  @IsOptional()
  description?: string

  @IsOptional()
  isActive?: boolean
}
