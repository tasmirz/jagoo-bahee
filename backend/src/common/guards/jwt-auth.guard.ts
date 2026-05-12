import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Observable } from 'rxjs'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest()
    const auth = req.headers?.authorization as string | undefined
    let token: string | undefined
    if (auth) {
      const parts = auth.split(' ')
      if (parts.length === 2 && parts[0] === 'Bearer') token = parts[1]
    }
    if (!token) token = readCookie(req, 'jid')
    if (!token) throw new UnauthorizedException('Missing authentication token')
    try {
      const payload = this.jwtService.verify(token)
      req.user = payload
      return true
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}

function readCookie(req: any, name: string) {
  const header = String(req.headers?.cookie || '')
  const cookies = header.split(';').map((item) => item.trim())
  const prefix = `${name}=`
  const found = cookies.find((item) => item.startsWith(prefix))
  return found ? decodeURIComponent(found.slice(prefix.length)) : undefined
}
