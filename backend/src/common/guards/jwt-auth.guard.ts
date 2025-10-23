import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Observable } from 'rxjs'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest()

    // Try to get token from Authorization header first
    const auth = req.headers?.authorization as string | undefined
    let token: string | undefined

    if (auth) {
      const parts = auth.split(' ')
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1]
      }
    }

    // If no token in header, try to get from jid cookie
    if (!token) {
      token = req.cookies?.jid
    }

    // If still no token found, throw error
    if (!token) {
      throw new UnauthorizedException('Missing authentication token')
    }

    // Verify the token
    try {
      const payload = this.jwtService.verify(token)
      req.user = payload
      return true
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
