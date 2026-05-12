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

import { ApiTags } from '@nestjs/swagger'

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly commentsService: CommentsService
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpPost()
  create(@Req() req: any, @Body() body: CreatePostDto) {
    if (String(body.authorId) !== String(req.user.id)) {
      throw new ForbiddenException('Cannot impersonate another user');
    }
    return this.posts.create(body as any)
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.posts.findById(id)
  }

  @Get()
  listAll(@Query('limit') limit = '50', @Query('skip') skip = '0', @Query('subreddit') subreddit?: string, @Query('authorId') authorId?: string) {
    const filter: any = {}
    if (subreddit) {
      filter.subredditId = subreddit
    }
    if (authorId) {
      filter.authorId = authorId
    }
    return this.posts.findAll(filter, Number(limit), Number(skip))
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: UpdatePostDto) {
    if (body.authorId && String(body.authorId) !== String(req.user.id)) {
      throw new ForbiddenException('Cannot impersonate another user');
    }
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
    if (String(authorId) !== String(req.user.id)) {
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
  modApprove(@Param('id') id: string, @Body() body: PostModBaseDto) {
    return this.posts.modApprove(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/remove')
  modRemove(@Param('id') id: string, @Body() body: PostModRemoveDto & { moderatorSignature?: string }) {
    return this.posts.modRemove(
      id,
      String(body.subredditId),
      String(body.moderatorId),
      body.reason,
      body.moderatorSignature
    )
  }

  @Get(':id/verify')
  getVerify(@Param('id') id: string) {
    return this.posts.getVerification(id)
  }

  @Get(':id/audit-trail')
  getAudit(@Param('id') id: string) {
    return this.posts.getAuditTrail(id)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/lock')
  modLock(@Param('id') id: string, @Body() body: PostModBaseDto) {
    return this.posts.modLock(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/unlock')
  modUnlock(@Param('id') id: string, @Body() body: PostModBaseDto) {
    return this.posts.modUnlock(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/pin')
  modPin(@Param('id') id: string, @Body() body: PostModBaseDto) {
    return this.posts.modPin(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/unpin')
  modUnpin(@Param('id') id: string, @Body() body: PostModBaseDto) {
    return this.posts.modUnpin(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/flag')
  modFlag(@Param('id') id: string, @Body() body: PostModBaseDto) {
    return this.posts.modFlag(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/unflag')
  modUnflag(@Param('id') id: string, @Body() body: PostModBaseDto) {
    return this.posts.modUnflag(id, String(body.subredditId), String(body.moderatorId))
  }

  @Get(':id/comments')
  async getComments(@Param('id') id: string) {
    return this.commentsService.findByPost(id)
  }
}
