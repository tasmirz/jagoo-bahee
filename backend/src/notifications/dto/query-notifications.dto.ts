import { Transform } from 'class-transformer'
import { IsBoolean, IsEnum, IsMongoId, IsNumber, IsOptional } from 'class-validator'

export class QueryNotificationsDto {
  @IsOptional()
  @IsMongoId()
  userId?: string

  @IsOptional()
  @IsEnum(['comment_reply', 'post_reply', 'mention', 'upvote_milestone', 'award', 'follow', 'mod_action', 'system'])
  type?: string

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isRead?: boolean

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  limit?: number

  @IsOptional()
  @IsNumber()
  @Transform(({ value }) => Number(value))
  page?: number
}
