import { IsArray, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator'

export class UpdateMessageDto {
  @IsOptional()
  @IsMongoId()
  recipientId?: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string

  @IsOptional()
  @IsString()
  content?: string

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  attachmentIds?: string[]

  @IsOptional()
  @IsMongoId()
  parentMessageId?: string

  @IsOptional()
  @IsString()
  senderSignature?: string
}
