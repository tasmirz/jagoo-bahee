import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

export const ABAC_META_KEY = 'abac'

export function Abac(...flags: number[]) {
  const mask = flags.reduce((acc, f) => acc | f, 0)
  return (target: any, key?: any, descriptor?: any) =>
    Reflect.defineMetadata(ABAC_META_KEY, mask, descriptor ? descriptor.value : target)
}

@Injectable()
export class AbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredMask = this.reflector.get<number>(ABAC_META_KEY, context.getHandler())
    if (!requiredMask) return true
    const req = context.switchToHttp().getRequest()
    const user = req.user
    if (!user) throw new ForbiddenException('Missing user')
    const userMask = BigInt(user.abac ?? 0)
    const reqMask = BigInt(requiredMask)
    if ((userMask & reqMask) !== BigInt(0)) return true
    throw new ForbiddenException('Insufficient permissions')
  }
}
