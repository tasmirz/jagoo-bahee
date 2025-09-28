import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class CreateAwardTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string

  @IsString()
  @IsNotEmpty()
  iconUrl: string

  @IsNumber()
  @Min(0)
  cost: number

  @IsString()
  @IsOptional()
  description?: string

  @IsOptional()
  isActive?: boolean
}
