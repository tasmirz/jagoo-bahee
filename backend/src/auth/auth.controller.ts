import { Body, Controller, Get, Post, Res } from '@nestjs/common'
import type { Response } from 'express'
import { AuthService } from './auth.service'
import { AuthenticationDto } from './dto/authenticate.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
  @Post()
  async authenticate(@Body() auth: AuthenticationDto, @Res({ passthrough: true }) res: Response) {
    const token = await this.authService.authenticate(auth)

    // Set token as secure, HttpOnly cookie. For local development (NODE_ENV !== 'production')
    // we still set httpOnly but not secure to allow testing over http.
    const isProd = process.env.NODE_ENV === 'production'
    res.cookie('jid', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    })

    return { token }
  }
  @Get('challenge/') // TODO: add PoW and rate limit
  challenge(): string {
    return this.authService.challenge()
  }
}
