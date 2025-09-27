import { IsArray, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator'

export class CreateMessageDto {
  @IsMongoId()
  recipientId: string

  @IsOptional()
  @IsString()
  @MaxLength(100)
  subject?: string

  @IsString()
  content: string

  @IsArray()
  @IsMongoId({ each: true })
  @IsOptional()
  attachmentIds?: string[]

  @IsOptional()
  @IsMongoId()
  parentMessageId?: string

  @IsString()
  senderSignature: string
}
