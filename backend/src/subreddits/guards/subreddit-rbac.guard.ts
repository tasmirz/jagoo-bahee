import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { Request } from 'express'
import { actorContextFromRequestUser } from 'src/common/actor-context'
import { SubredditPermissionService } from '../subreddit-permission.service'

/**
 * Guard that allows action if the user is:
 * - a global moderator/admin (abac bits 4/5) OR
 * - a moderator of the subreddit (SubredditMember.statusFlags has moderator bit)
 */
@Injectable()
export class SubredditRbacGuard implements CanActivate {
  constructor(private readonly permissionService: SubredditPermissionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: Request & { user?: any } = context.switchToHttp().getRequest()
    const user = req.user
    if (!user) throw new ForbiddenException('Missing authenticated user')

    const actor = actorContextFromRequestUser(user)
    const params = req.params as any
    const body = (req as any).body || {}
    const subredditId = params.subredditId || body.subredditId || params.id
    if (!subredditId) throw new ForbiddenException('Missing subreddit id')

    if (await this.permissionService.canModerateSubreddit(actor, subredditId)) return true

    throw new ForbiddenException('Requires moderator or admin')
  }
}
