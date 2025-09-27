import { IsMongoId, IsOptional, IsString } from 'class-validator'

export class ReplyMessageDto {
  @IsMongoId()
  parentMessageId: string

  @IsOptional()
  @IsString()
  subject?: string

  @IsString()
  content: string

  @IsString()
  senderSignature: string
}
