import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Inject } from '@nestjs/common'
import { Request } from 'express'
import { SubredditMembersService } from '../subreddit-members.service'
import { SubredditsService } from '../subreddits.service'

/**
 * Guard that allows action if the user is:
 * - a global moderator/admin (abac bits 4/5) OR
 * - a moderator of the subreddit (SubredditMember.statusFlags has moderator bit)
 */
@Injectable()
export class SubredditRbacGuard implements CanActivate {
  constructor(
    private readonly membersService: SubredditMembersService,
    private readonly subredditsService: SubredditsService
  ) {}

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
    // subreddit id may be in params: :subredditId or :id (for subreddit update)
    const params = req.params as any
    const subredditId = params.subredditId || params.id
    if (!subredditId) throw new ForbiddenException('Missing subreddit id')

    // find the member record for this user (direct lookup)
    const member = await this.membersService.findBySubredditAndUser(subredditId, String(user.id)) // TODO: use redis later
    const isModerator = !!member && (BigInt(member.statusFlags || 0) & (BigInt(1) << BigInt(3))) !== BigInt(0)
    if (isModerator) return true

    throw new ForbiddenException('Requires moderator or admin')
  }
}
