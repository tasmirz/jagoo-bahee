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
import { AbuseRateLimiterService } from 'src/common/abuse-rate-limiter.service'
import { Request } from 'express'

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(Auth.name)
    private authModel: Model<Auth>,
    private usersService: UsersService,
    private readonly redis: RedisService,
    private readonly abuseLimiter: AbuseRateLimiterService
  ) {}

  async challenge(req?: Request): Promise<string> {
    await this.abuseLimiter.assertIpAllowed(req)
    await this.abuseLimiter.hit(
      'auth-challenge',
      this.abuseLimiter.tracker(req),
      Number(process.env.AUTH_CHALLENGE_LIMIT || 20),
      Number(process.env.AUTH_CHALLENGE_WINDOW_MS || 5 * 60 * 1000)
    )
    return this.jwtService.sign(
      { 
        jti: randomBytes(16).toString('hex'),
        challenge: randomBytes(32).toString('base64'),
        difficulty: 3
      },
      { expiresIn: jwtConfig.challengeExpiresIn as any }
    )
  }

  async authenticate(auth: AuthenticationDto, req?: Request): Promise<{ accessToken: string; refreshToken: string }> {
    // DTO transforms produce Uint8Array; convert to Buffer for mongoose and tiny-secp256k1
    const publicKey = Buffer.from(auth.publicKey as any)
    const signedData = Buffer.from(auth.signedData as any)
    await this.abuseLimiter.assertIpAllowed(req)
    const publicKeyFingerprint = createHash('sha256').update(publicKey).digest('hex')
    await this.abuseLimiter.hit(
      'auth-submit',
      this.abuseLimiter.tracker(req, undefined, publicKeyFingerprint),
      Number(process.env.AUTH_SUBMIT_LIMIT || 15),
      Number(process.env.AUTH_SUBMIT_WINDOW_MS || 10 * 60 * 1000)
    )
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
      const securityConfig = await this.redis.getJson<{ registrationsOpen?: boolean }>('jb:config:security')
      if (securityConfig?.registrationsOpen === false) throw new UnauthorizedException('Registrations are temporarily closed')
      await this.abuseLimiter.hit(
        'account-create',
        this.abuseLimiter.tracker(req, undefined, publicKeyFingerprint),
        Number(process.env.ACCOUNT_CREATE_LIMIT || 5),
        Number(process.env.ACCOUNT_CREATE_WINDOW_MS || 60 * 60 * 1000)
      )
      await this.abuseLimiter.hit(
        'account-create-subnet',
        this.abuseLimiter.subnetTracker(req),
        Number(process.env.ACCOUNT_CREATE_SUBNET_LIMIT || 20),
        Number(process.env.ACCOUNT_CREATE_SUBNET_WINDOW_MS || 60 * 60 * 1000)
      )
      authDoc = await this.authModel.create({ publicKey })
    }

    // Ensure a User profile exists for this auth record using UsersService which
    // implements retries for unique username generation.
    try {
      const user = await this.usersService.ensureUserForAuth(authDoc._id as Types.ObjectId)
      if (user?.bannedUntil && new Date(user.bannedUntil).getTime() > Date.now()) {
        throw new UnauthorizedException('User is banned')
      }
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e
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
