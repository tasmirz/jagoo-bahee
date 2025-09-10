import { ApiProperty } from '@nestjs/swagger'
import { Transform } from 'class-transformer'
import { IsBase64, IsJWT, IsNotEmpty } from 'class-validator'
import { Auth } from '../schemas/auth.schema'

export class AuthenticationDto {
  //@IsBase64()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => Buffer.from(value, 'base64'))
  publicKey: Buffer

  @IsJWT()
  @IsNotEmpty()
  challenge: string

  //@IsBase64()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => Buffer.from(value, 'base64'))
  signedData: Buffer
}
