import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe
} from '@nestjs/common'
import { ApiQuery } from '@nestjs/swagger'
import { SubredditMembersService } from './subreddit-members.service'
import { UseGuards, Req, Post as PostMethod } from '@nestjs/common'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { SubredditRbacGuard } from './guards/subreddit-rbac.guard'

@Controller('subreddits/:subredditId/members')
export class SubredditMembersController {
  constructor(private readonly service: SubredditMembersService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async add(
    @Param('subredditId') subredditId: string,
    @Body() body: import('./dto/add-member.dto').AddMemberDto,
    @Req() req?: any
  ) {
    const payload: any = { ...body, subredditId }
    // Service expects ObjectId for subredditId
    try {
      const { Types } = await import('mongoose')
      payload.subredditId = new Types.ObjectId(subredditId)
    } catch {}
    // attach actor info if available
    if (req && req.user && req.user.id) payload.actorAuthId = req.user.id
    return this.service.addMember(payload)
  }

  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'skip', required: false, type: Number, example: 0 })
  @Get()
  async list(
    @Param('subredditId') subredditId: string,
    @Query('q') q?: string,
    @Query('type') type?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit = 50,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip = 0
  ) {
    return this.service.list(subredditId, { q, type, limit, skip })
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Body() body: any, @Req() req?: any) {
    if (body.statusFlags === undefined) return this.service.findOne(id)
    // accept numeric or bigint-ish values
    const flags = typeof body.statusFlags === 'string' ? BigInt(body.statusFlags) : body.statusFlags
    const moderatorId = req?.user?.id
    const moderatorSignature = body.moderatorSignature
    return this.service.updateStatus(id, flags, moderatorId, moderatorSignature)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SubredditRbacGuard)
  async remove(@Param('id') id: string) {
    await this.service.remove(id)
  }

  // Ban a member (moderator/admin only)
  @PostMethod(':id/ban')
  @UseGuards(SubredditRbacGuard)
  async ban(@Param('subredditId') subredditId: string, @Param('id') id: string, @Body() body: any, @Req() req?: any) {
    const until = body.until ? new Date(body.until) : undefined
    const moderatorId = req?.user?.id
    const moderatorSignature = body.moderatorSignature
    return this.service.banMember(id, until, body.reason, moderatorId, moderatorSignature)
  }

  // Change role/status flags (moderator/admin only)
  @PostMethod(':id/role')
  @UseGuards(SubredditRbacGuard)
  async changeRole(
    @Param('subredditId') subredditId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Req() req?: any
  ) {
    // body.statusFlags expected (string|number|bigint)
    const flags = typeof body.statusFlags === 'string' ? BigInt(body.statusFlags) : body.statusFlags
    const moderatorId = req?.user?.id
    const moderatorSignature = body.moderatorSignature
    return this.service.updateStatus(id, flags, moderatorId, moderatorSignature)
  }
}
