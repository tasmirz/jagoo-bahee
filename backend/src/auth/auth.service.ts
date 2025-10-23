import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, TokenExpiredError } from '@nestjs/jwt'
import { randomBytes, createHash } from 'crypto'
import { AuthenticationDto } from './dto/authenticate.dto'
import * as tinysecp from 'tiny-secp256k1'
import { unsafe } from '../common'
import { Auth } from './schemas/auth.schema'
import { UsersService } from 'src/users/users.service'
import 'dotenv/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { getPublicKey } from '../../../frontend/src/lib/auth'

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(Auth.name)
    private authModel: Model<Auth>,
    private usersService: UsersService
  ) {}

  challenge(): string {
    return this.jwtService.sign({ challenge: randomBytes(32).toString('base64') }, { expiresIn: '60m' }) // TODO : move to config and 2m
  }

  async authenticate(auth: AuthenticationDto): Promise<{ accessToken: string; refreshToken: string }> {
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
    console.log(auth)
    // Mongoose stores buffers as Buffer; query by publicKey directly
    let authDoc = await this.authModel.findOne({ publicKey }).exec()
    if (authDoc == null) {
      authDoc = await this.authModel.create({ publicKey })
    }

    // Ensure a User profile exists for this auth record using UsersService which
    // implements retries for unique username generation.
    try {
      await this.usersService.ensureUserForAuth(authDoc._id as Types.ObjectId)
    } catch (e) {
      // best-effort; if user creation fails leave auth flow intact
      console.warn('Failed to ensure user profile for auth:', e)
    }

    const authId = String((authDoc as any)._id)

    // Generate access token (short-lived: 15 minutes)
    const accessToken = this.jwtService.sign({ id: authId, abac: authDoc.abac }, { expiresIn: '15m' })

    // Generate refresh token (long-lived: 7 days)
    const refreshToken = this.jwtService.sign({ id: authId, type: 'refresh' }, { expiresIn: '7d' })

    return { accessToken, refreshToken }
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      const payload = this.jwtService.verify(refreshToken)

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type')
      }

      // Fetch auth document to get latest abac permissions
      const authDoc = await this.authModel.findById(payload.id).exec()
      if (!authDoc) {
        throw new UnauthorizedException('User not found')
      }

      // Generate new access token
      return this.jwtService.sign({ id: String(authDoc._id), abac: authDoc.abac }, { expiresIn: '15m' })
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Refresh token expired')
      }
      throw new UnauthorizedException('Invalid refresh token')
    }
  }
  async getPublicKeyById(_id: Object): Promise<Buffer | null> {
    const authRec = await this.authModel.findOne({ _id }).exec()
    if (!authRec || !authRec.publicKey) return null
    return Buffer.from(authRec.publicKey)
  }
}
