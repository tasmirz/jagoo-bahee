import { Body, Controller, Get, Post, Res, Req, Param, UnauthorizedException } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Response, Request } from 'express'
import { AuthService } from './auth.service'
import { AuthenticationDto } from './dto/authenticate.dto'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService
  ) {}
  @Post()
  async authenticate(@Body() auth: AuthenticationDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.authService.authenticate(auth, req)

    // Set token as secure, HttpOnly cookie. For local development (NODE_ENV !== 'production')
    // we still set httpOnly but not secure to allow testing over http.
    const isProd = process.env.NODE_ENV === 'production'
    res.cookie('jid', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 1000 * 60 * 15,
      path: '/'
    })
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7,
      path: '/'
    })

    return { accessToken, refreshToken }
  }

  @Get('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = readCookie(req, 'refreshToken')
    if (!refreshToken) throw new UnauthorizedException('No refresh token provided')
    const accessToken = await this.authService.refreshAccessToken(refreshToken)
    const isProd = process.env.NODE_ENV === 'production'
    res.cookie('jid', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 1000 * 60 * 15,
      path: '/'
    })
    return { accessToken }
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    const isProd = process.env.NODE_ENV === 'production'
    res.clearCookie('jid', { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', path: '/' })
    res.clearCookie('refreshToken', { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax', path: '/' })
    return { success: true }
  }
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('challenge')
  async challenge(@Req() req: Request): Promise<string> {
    return this.authService.challenge(req)
  }

  @Get('public/:id')
  async getPublicKey(@Param('id') id: string) {
    try {
      const { Types } = await import('mongoose')
      const objectId = new Types.ObjectId(id)
      const buf = await this.authService.getPublicKeyById(objectId)
      return { publicKey: buf ? buf.toString('base64') : null }
    } catch {
      return { publicKey: null }
    }
  }
}

function readCookie(req: Request, name: string) {
  const header = String(req.headers?.cookie || '')
  const cookies = header.split(';').map((item) => item.trim())
  const prefix = `${name}=`
  const found = cookies.find((item) => item.startsWith(prefix))
  return found ? decodeURIComponent(found.slice(prefix.length)) : undefined
}
