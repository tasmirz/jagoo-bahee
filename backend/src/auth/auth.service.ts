import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'
import { randomBytes, createHash } from 'crypto'
import { AuthenticationDto } from './dto/authenticate.dto'
import * as tinysecp from 'tiny-secp256k1'
import { unsafe } from '../common'
import { Auth } from './schemas/auth.schema'
import 'dotenv/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(Auth.name)
    private authModel: Model<Auth>
  ) {}

  challenge(): string {
    return this.jwtService.sign({ challenge: randomBytes(32).toString('base64') }, { expiresIn: '60m' }) // TODO : move to config and 2m
  }

  async authenticate(auth: AuthenticationDto): Promise<string> {
    // DTO transforms produce Uint8Array; convert to Buffer for mongoose and tiny-secp256k1
    const publicKey = Buffer.from(auth.publicKey as any)
    const signedData = Buffer.from(auth.signedData as any)
    // JWT validity

    const payload: { challenge: string; iat: number; exp: number } = unsafe(
      () => this.jwtService.verify(auth.challenge),
      () => {
        throw new UnauthorizedException('Invalid token')
      }
    )
    const { challenge } = payload

    // Signature validity
    //
    console.log(auth)

    const hashed = createHash('sha256').update(challenge).digest()
    const signValidity = tinysecp.verify(hashed, publicKey, signedData)
    if (!signValidity) throw new UnauthorizedException('Sign Verification Failed')

    // Getting user id

    // Mongoose stores buffers as Buffer; query by publicKey directly
    let user = await this.authModel.findOne({ publicKey }).exec()
    if (user == null) {
      user = await this.authModel.create({ publicKey })
    }

    return this.jwtService.sign({ id: String((user as any)._id), abac: user.abac })
  }
}
