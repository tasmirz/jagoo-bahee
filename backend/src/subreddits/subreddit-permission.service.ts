import { Injectable } from '@nestjs/common'
import { ActorContext } from 'src/common/actor-context'
import { SubredditMembersService } from './subreddit-members.service'

@Injectable()
export class SubredditPermissionService {
  constructor(private readonly membersService: SubredditMembersService) {}

  async canModerateSubreddit(actor: ActorContext, subredditId: string) {
    if (actor.isGlobalAdmin || actor.isGlobalModerator) return true
    const summary = await this.membersService.getPermissionSummary(subredditId, actor.userId)
    return !!summary?.isModerator || !!summary?.permissions.includes('community.update')
  }

  async getSummary(actor: ActorContext, subredditId: string) {
    const summary = await this.membersService.getPermissionSummary(subredditId, actor.userId)
    return {
      subredditId,
      actor,
      isMember: !!summary?.isMember,
      isMuted: !!summary?.isMuted,
      isBanned: !!summary?.isBanned,
      isModerator: actor.isGlobalAdmin || actor.isGlobalModerator || !!summary?.isModerator,
      permissions: summary?.permissions || []
    }
  }
}
