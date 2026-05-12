import { Controller, Post, Body, Get, Param, Query, UseGuards, Req } from '@nestjs/common'
import { VotesService } from './votes.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'

@Controller('votes')
export class VotesController {
  constructor(private readonly votes: VotesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async cast(@Req() req: any, @Body() body: any) {
    const userId = String(req.user.id)
    const { targetId, targetType, value } = body
    const v = Number(value) as 0 | 1 | -1
    if (![1, -1, 0].includes(v as number)) throw new Error('invalid value')
    return this.votes.castVote(userId, targetId, targetType, v)
  }

  @Get('my/:targetType/:targetId')
  @UseGuards(JwtAuthGuard)
  async getMyVote(
    @Req() req: any,
    @Param('targetType') targetType: 'post' | 'comment',
    @Param('targetId') targetId: string
  ) {
    const userId = String(req.user.id)
    return this.votes.getUserVote(userId, targetId, targetType)
  }
}
