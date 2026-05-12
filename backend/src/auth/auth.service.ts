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
import { jwtConfig } from 'src/config/jwt.config'
import { RedisService } from 'src/redis/redis.service'

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(Auth.name)
    private authModel: Model<Auth>,
    private usersService: UsersService,
    private readonly redis: RedisService
  ) {}

  challenge(): string {
    return this.jwtService.sign(
      { 
        jti: randomBytes(16).toString('hex'),
        challenge: randomBytes(32).toString('base64'),
        difficulty: 3
      },
      { expiresIn: jwtConfig.challengeExpiresIn as any }
    )
  }

  async authenticate(auth: AuthenticationDto): Promise<{ accessToken: string; refreshToken: string }> {
    // DTO transforms produce Uint8Array; convert to Buffer for mongoose and tiny-secp256k1
    const publicKey = Buffer.from(auth.publicKey as any)
    const signedData = Buffer.from(auth.signedData as any)
    const mcaptchaUrl = (process.env.MCAPTCHA_URL || '').replace(/\/$/, '')
    const mcaptchaSecret = process.env.MCAPTCHA_SECRET
    const mcaptchaSiteKey = process.env.MCAPTCHA_SITEKEY
    // JWT validity

    const payload: { jti?: string; challenge: string; difficulty?: number; iat: number; exp: number } = unsafe(
      () => this.jwtService.verify(auth.challenge),
      () => {
        throw new UnauthorizedException('Invalid token')
      }
    )
    const { challenge } = payload

    // 1. Proof of Work (PoW) verification
    const difficulty = payload.difficulty || 3;
    const powHash = createHash('sha256').update(challenge + auth.nonce.toString()).digest('hex');
    if (!powHash.startsWith('0'.repeat(difficulty))) {
      throw new UnauthorizedException('Proof of Work Failed');
    }

    // 2. Signature validity
    const hashed = createHash('sha256').update(challenge).digest()
    const signValidity = tinysecp.verify(hashed, publicKey, signedData)
    if (!signValidity) throw new UnauthorizedException('Sign Verification Failed')

    const challengeId = payload.jti || createHash('sha256').update(auth.challenge).digest('hex')
    const ttlMs = Math.max(1000, (payload.exp * 1000) - Date.now())
    const firstUse = await this.redis.setIfAbsent(`jb:auth:challenge-used:${challengeId}`, '1', ttlMs)
    if (!firstUse) throw new UnauthorizedException('Challenge already used')

    if (mcaptchaUrl && mcaptchaSecret && mcaptchaSiteKey) {
      if (!auth.mcaptchaToken) {
        throw new UnauthorizedException('mCaptcha token required')
      }

      const captchaResp = await fetch(`${mcaptchaUrl}/api/v1/pow/siteverify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: mcaptchaSecret,
          key: mcaptchaSiteKey,
          token: auth.mcaptchaToken,
        }),
      })

      if (!captchaResp.ok) {
        throw new UnauthorizedException('mCaptcha verification failed')
      }

      const captchaData = (await captchaResp.json().catch(() => null)) as { valid?: boolean } | null
      if (!captchaData?.valid) {
        throw new UnauthorizedException('mCaptcha verification failed')
      }
    }

    // Getting user id
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
    const accessToken = this.jwtService.sign({ id: authId, abac: Number(authDoc.abac) }, { expiresIn: '15m' })
    const refreshToken = this.jwtService.sign({ id: authId, type: 'refresh' }, { expiresIn: '7d' })
    return { accessToken, refreshToken }
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      const payload = this.jwtService.verify(refreshToken)
      if (payload.type !== 'refresh') throw new UnauthorizedException('Invalid token type')
      const authDoc = await this.authModel.findById(payload.id).exec()
      if (!authDoc) throw new UnauthorizedException('User not found')
      return this.jwtService.sign({ id: String((authDoc as any)._id), abac: Number(authDoc.abac) }, { expiresIn: '15m' })
    } catch (error) {
      if (error instanceof TokenExpiredError) throw new UnauthorizedException('Refresh token expired')
      throw new UnauthorizedException('Invalid refresh token')
    }
  }
  async getPublicKeyById(_id: Object): Promise<Buffer | null> {
    const authRec = await this.authModel.findOne({ _id }).exec()
    if (!authRec || !authRec.publicKey) return null
    return Buffer.from(authRec.publicKey)
  }

  async findById(id: string | Types.ObjectId): Promise<Auth | null> {
    return this.authModel.findById(id).exec()
  }

  async findByPublicKey(publicKey: Buffer): Promise<Auth | null> {
    return this.authModel.findOne({ publicKey }).exec()
  }
}
