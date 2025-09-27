import { IsBoolean, IsDateString, IsEnum, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateNotificationDto {
  @IsMongoId()
  userId: string

  @IsEnum(['comment_reply', 'post_reply', 'mention', 'upvote_milestone', 'award', 'follow', 'mod_action', 'system'])
  type: string

  @IsOptional()
  @IsMongoId()
  actorId?: string

  @IsOptional()
  @IsMongoId()
  targetId?: string

  @IsOptional()
  @IsEnum(['post', 'comment', 'user', 'subreddit'])
  targetType?: string

  @IsString()
  @MaxLength(1000)
  message: string

  @IsOptional()
  @IsBoolean()
  isRead?: boolean

  @IsOptional()
  @IsDateString()
  readAt?: string
}
