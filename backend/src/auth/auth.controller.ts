import { Body, Controller, Get, Post, Res, Req, Param, UnauthorizedException } from '@nestjs/common'
import type { Response, Request } from 'express'
import { AuthService } from './auth.service'
import { AuthenticationDto } from './dto/authenticate.dto'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  async authenticate(@Body() auth: AuthenticationDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = await this.authService.authenticate(auth)

    const isProd = process.env.NODE_ENV === 'production'

    // Set access token cookie (15 minutes)
    res.cookie('jid', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 1000 * 60 * 1500, // 15 minutes
      path: '/'
    })

    // Set refresh token cookie (7 days)
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    return { accessToken, refreshToken }
  }

  @Get('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided')
    }

    const newAccessToken = await this.authService.refreshAccessToken(refreshToken)

    const isProd = process.env.NODE_ENV === 'production'

    // Set new access token cookie
    res.cookie('jid', newAccessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 1000 * 60 * 1500, // 15 minutes
      path: '/'
    })

    return { accessToken: newAccessToken }
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    const isProd = process.env.NODE_ENV === 'production'

    // Clear access token cookie
    res.clearCookie('jid', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/'
    })

    // Clear refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/'
    })

    return { success: true, message: 'Logged out successfully' }
  }

  @Get('challenge') // TODO: add PoW and rate limit
  challenge(): string {
    return this.authService.challenge()
  }

  @Get('public/:id')
  async getPublicKey(@Param('id') id: string) {
    try {
      const { Types } = await import('mongoose')
      const objectId = new Types.ObjectId(id)
      const buf = await this.authService.getPublicKeyById(objectId)
      if (!buf) {
        console.warn(`[AuthController] No public key found for auth ID: ${id}`)
        return { publicKey: null }
      }
      console.log(`[AuthController] Found public key for auth ID: ${id}, length: ${buf.length}`)
      return { publicKey: buf.toString('base64') }
    } catch (error) {
      console.error(`[AuthController] Error fetching public key for ${id}:`, error)
      return { publicKey: null }
    }
  }
}
