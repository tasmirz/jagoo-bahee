import { Body, Controller, Delete, Get, Param, Patch, Post as HttpPost, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common'
import { CommentsService } from './comments.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { SubredditRbacGuard } from 'src/subreddits/guards/subreddit-rbac.guard'
import { CreateCommentDto, UpdateCommentDto, VoteCommentDto } from './dto'
import { CommentModBaseDto, CommentModRemoveDto } from './dto/moderate-comment.dto'
import { AbuseRateLimiterService } from 'src/common/abuse-rate-limiter.service'

import { ApiTags } from '@nestjs/swagger'

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly abuseLimiter: AbuseRateLimiterService
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpPost()
  async create(@Req() req: any, @Body() body: CreateCommentDto) {
    if (body.authorId && String(body.authorId) !== String(req.user.id)) {
      throw new ForbiddenException('Cannot impersonate another user');
    }
    await this.abuseLimiter.hit('comment-create', this.abuseLimiter.tracker(req, String(req.user.id)), Number(process.env.COMMENT_CREATE_LIMIT || 120), Number(process.env.COMMENT_CREATE_WINDOW_MS || 60 * 60 * 1000))
    return this.comments.create({ ...(body as any), authorId: String(req.user.id) })
  }

  @Get()
  findAll(
    @Query('limit') limit = '50',
    @Query('skip') skip = '0',
    @Query('postId') postId?: string,
    @Query('authorId') authorId?: string,
    @Query('q') q?: string
  ) {
    const filter: any = {}
    if (postId) filter.postId = postId
    if (authorId) filter.authorId = authorId
    if (q?.trim()) {
      filter.content = { $regex: q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }
    }
    return this.comments.findAll(filter, Number(limit), Number(skip))
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.comments.findById(id)
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/permissions/me')
  myPermissions(@Req() req: any, @Param('id') id: string) {
    return this.comments.permissionsFor(id, req.user)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateCommentDto) {
    if (body.authorId && String(body.authorId) !== String(req.user.id)) {
      throw new ForbiddenException('Cannot impersonate another user');
    }
    return this.comments.updateByAuthor(id, String(req.user.id), body as any)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string, @Body('authorId') authorId: string, @Body('deletionSignature') deletionSignature?: string) {
    if (authorId && String(authorId) !== String(req.user.id)) {
      throw new ForbiddenException('Cannot impersonate another user');
    }
    return this.comments.removeByAuthor(id, String(req.user.id), deletionSignature)
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost(':id/vote')
  vote(@Param('id') id: string, @Body() body: VoteCommentDto) {
    return this.comments.vote(id, body.delta)
  }

  // Moderation routes
  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/approve')
  modApprove(@Req() req: any, @Param('id') id: string, @Body() body: CommentModBaseDto & { moderatorSignature?: string }) {
    return this.comments.modApprove(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/remove')
  modRemove(@Req() req: any, @Param('id') id: string, @Body() body: CommentModRemoveDto & { moderatorSignature?: string }) {
    return this.comments.modRemove(id, String(body.subredditId), String(req.user.id), body.reason, body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/restore')
  modRestore(@Req() req: any, @Param('id') id: string, @Body() body: CommentModRemoveDto & { moderatorSignature?: string }) {
    return this.comments.modRestore(id, String(body.subredditId), String(req.user.id), body.reason, body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/collapse')
  modCollapse(@Req() req: any, @Param('id') id: string, @Body() body: CommentModBaseDto & { moderatorSignature?: string }) {
    return this.comments.modCollapse(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/uncollapse')
  modUncollapse(@Req() req: any, @Param('id') id: string, @Body() body: CommentModBaseDto & { moderatorSignature?: string }) {
    return this.comments.modUncollapse(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/flag')
  modFlag(@Req() req: any, @Param('id') id: string, @Body() body: CommentModBaseDto & { moderatorSignature?: string }) {
    return this.comments.modFlag(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/unflag')
  modUnflag(@Req() req: any, @Param('id') id: string, @Body() body: CommentModBaseDto & { moderatorSignature?: string }) {
    return this.comments.modUnflag(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }
}
