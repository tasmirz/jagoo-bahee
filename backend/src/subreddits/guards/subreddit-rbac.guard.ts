import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common'
import { Request } from 'express'
import { SubredditMembersService } from '../subreddit-members.service'

/**
 * Guard that allows action if the user is:
 * - a global moderator/admin (abac bits 4/5) OR
 * - a moderator of the subreddit (SubredditMember.statusFlags has moderator bit)
 */
@Injectable()
export class SubredditRbacGuard implements CanActivate {
  constructor(private readonly membersService: SubredditMembersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req: Request & { user?: any } = context.switchToHttp().getRequest()
    const user = req.user
    if (!user) throw new ForbiddenException('Missing authenticated user')

    // global abac check: bits 4 (moderator) or 5 (admin)
    const abac = typeof user.abac === 'bigint' ? user.abac : BigInt(user.abac || 0)
    const isGlobalMod = (abac & (BigInt(1) << BigInt(4))) !== BigInt(0)
    const isGlobalAdmin = (abac & (BigInt(1) << BigInt(5))) !== BigInt(0)
    if (isGlobalAdmin || isGlobalMod) return true

    // otherwise check subreddit moderator role
    // subreddit id may be in params: :subredditId or :id, or in request body for post/comment moderation
    const params = req.params as any
    const body = (req as any).body || {}
    const subredditId = params.subredditId || body.subredditId || params.id
    if (!subredditId) throw new ForbiddenException('Missing subreddit id')

    const summary = await this.membersService.getPermissionSummary(subredditId, String(user.id))
    if (summary?.isModerator || summary?.permissions.includes('community.update')) return true

    throw new ForbiddenException('Requires moderator or admin')
  }
}
