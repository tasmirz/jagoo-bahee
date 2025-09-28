import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator'

export class QueryAwardTypesDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsEnum([true, false])
  isActive?: boolean

  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number

  @IsOptional()
  @IsNumber()
  limit?: number
}
