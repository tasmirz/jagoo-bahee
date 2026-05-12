import { Transform } from 'class-transformer'
import { IsJWT, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator'

export class AuthenticationDto {
  //@IsBase64()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => Buffer.from(value, 'base64'))
  publicKey: Buffer

  @IsJWT()
  @IsNotEmpty()
  challenge: string

  @IsNumber()
  @IsNotEmpty()
  nonce: number

  //@IsBase64()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => Buffer.from(value, 'base64'))
  signedData: Buffer

  @IsOptional()
  @IsString()
  mcaptchaToken?: string
}
