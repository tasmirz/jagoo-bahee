import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Observable } from 'rxjs'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest()
    const auth = req.headers?.authorization as string | undefined
    if (!auth) throw new UnauthorizedException('Missing Authorization header')
    const parts = auth.split(' ')
    if (parts.length !== 2 || parts[0] !== 'Bearer') throw new UnauthorizedException('Invalid Authorization format')
    const token = parts[1]
    try {
      const payload = this.jwtService.verify(token)
      req.user = payload
      return true
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
