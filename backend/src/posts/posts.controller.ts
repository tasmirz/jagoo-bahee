import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post as HttpPost,
  UseGuards,
  Query,
  NotFoundException,
  Req,
  ForbiddenException
} from '@nestjs/common'
import { PostsService } from './posts.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { SubredditRbacGuard } from 'src/subreddits/guards/subreddit-rbac.guard'
import { CreatePostDto, UpdatePostDto, VotePostDto } from './dto'
import { PostModBaseDto, PostModRemoveDto } from './dto/moderate-post.dto'
import { CommentsService } from 'src/comments/comments.service'
import { AbuseRateLimiterService } from 'src/common/abuse-rate-limiter.service'

import { ApiTags } from '@nestjs/swagger'

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly commentsService: CommentsService,
    private readonly abuseLimiter: AbuseRateLimiterService
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpPost()
  async create(@Req() req: any, @Body() body: CreatePostDto) {
    if (body.authorId && String(body.authorId) !== String(req.user.id)) {
      throw new ForbiddenException('Cannot impersonate another user');
    }
    await this.abuseLimiter.hit('post-create', this.abuseLimiter.tracker(req, String(req.user.id)), Number(process.env.POST_CREATE_LIMIT || 30), Number(process.env.POST_CREATE_WINDOW_MS || 60 * 60 * 1000))
    return this.posts.create({ ...(body as any), authorId: String(req.user.id) })
  }

  @Get('suggest')
  suggest(@Query('q') q = '', @Query('limit') limit = '8') {
    return this.posts.suggest(q, Number(limit))
  }

  @Get()
  listAll(
    @Query('limit') limit = '50',
    @Query('skip') skip = '0',
    @Query('subreddit') subreddit?: string,
    @Query('authorId') authorId?: string,
    @Query('sort') sort: 'hot' | 'new' | 'top' | 'controversial' = 'hot'
  ) {
    const filter: any = {}
    if (subreddit) {
      filter.subredditId = subreddit
    }
    if (authorId) {
      filter.authorId = authorId
    }
    return this.posts.findAll(filter, Number(limit), Number(skip), sort)
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.posts.findById(id)
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/permissions/me')
  async myPermissions(@Req() req: any, @Param('id') id: string) {
    return this.posts.permissionsFor(id, req.user)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdatePostDto) {
    if (body.authorId && String(body.authorId) !== String(req.user.id)) {
      throw new ForbiddenException('Cannot impersonate another user');
    }
    await this.abuseLimiter.hit('post-update', this.abuseLimiter.tracker(req, String(req.user.id), id), Number(process.env.POST_UPDATE_LIMIT || 120), Number(process.env.POST_UPDATE_WINDOW_MS || 60 * 60 * 1000))
    return this.posts.updateByAuthor(id, String(req.user.id), body as any)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(
    @Req() req: any,
    @Param('id') id: string,
    @Body('authorId') authorId: string,
    @Body('deletionSignature') deletionSignature?: string
  ) {
    if (authorId && String(authorId) !== String(req.user.id)) {
      throw new ForbiddenException('Cannot impersonate another user');
    }
    return this.posts.removeByAuthor(id, String(req.user.id), deletionSignature)
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost(':id/vote')
  vote(@Param('id') id: string, @Body() body: VotePostDto) {
    return this.posts.vote(id, body.delta)
  }

  // Moderation routes - require subreddit mod/admin
  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/approve')
  modApprove(@Req() req: any, @Param('id') id: string, @Body() body: PostModBaseDto & { moderatorSignature?: string }) {
    return this.posts.modApprove(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/remove')
  modRemove(@Req() req: any, @Param('id') id: string, @Body() body: PostModRemoveDto & { moderatorSignature?: string }) {
    return this.posts.modRemove(
      id,
      String(body.subredditId),
      String(req.user.id),
      body.reason,
      body.moderatorSignature
    )
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/restore')
  modRestore(@Req() req: any, @Param('id') id: string, @Body() body: PostModRemoveDto & { moderatorSignature?: string }) {
    return this.posts.modRestore(id, String(body.subredditId), String(req.user.id), body.reason, body.moderatorSignature)
  }

  @Get(':id/verify')
  getVerify(@Param('id') id: string) {
    return this.posts.getVerification(id)
  }

  @HttpPost('proofs/verify')
  verifyProof(@Body() body: any) {
    return this.posts.verifyProof(body?.proof || body)
  }

  @Get(':id/audit-trail')
  getAudit(@Param('id') id: string) {
    return this.posts.getAuditTrail(id)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/lock')
  modLock(@Req() req: any, @Param('id') id: string, @Body() body: PostModBaseDto & { moderatorSignature?: string }) {
    return this.posts.modLock(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/unlock')
  modUnlock(@Req() req: any, @Param('id') id: string, @Body() body: PostModBaseDto & { moderatorSignature?: string }) {
    return this.posts.modUnlock(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/pin')
  modPin(@Req() req: any, @Param('id') id: string, @Body() body: PostModBaseDto & { moderatorSignature?: string }) {
    return this.posts.modPin(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/unpin')
  modUnpin(@Req() req: any, @Param('id') id: string, @Body() body: PostModBaseDto & { moderatorSignature?: string }) {
    return this.posts.modUnpin(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/flag')
  modFlag(@Req() req: any, @Param('id') id: string, @Body() body: PostModBaseDto & { moderatorSignature?: string }) {
    return this.posts.modFlag(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/unflag')
  modUnflag(@Req() req: any, @Param('id') id: string, @Body() body: PostModBaseDto & { moderatorSignature?: string }) {
    return this.posts.modUnflag(id, String(body.subredditId), String(req.user.id), body.moderatorSignature)
  }

  @Get(':id/comments')
  async getComments(@Param('id') id: string) {
    return this.commentsService.findByPost(id)
  }
}
