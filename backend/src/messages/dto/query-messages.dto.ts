import { Transform } from 'class-transformer'
import { IsBoolean, IsMongoId, IsNumber, IsOptional } from 'class-validator'

export class QueryMessagesDto {
  @IsOptional()
  @IsMongoId()
  senderId?: string

  @IsOptional()
  @IsMongoId()
  recipientId?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isRead?: boolean

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isDeleted?: boolean

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  limit?: number

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  page?: number
}
