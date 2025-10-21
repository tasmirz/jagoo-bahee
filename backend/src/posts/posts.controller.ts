import { Body, Controller, Delete, Get, Param, Patch, Post as HttpPost, UseGuards, Query } from '@nestjs/common'
import { PostsService } from './posts.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { SubredditRbacGuard } from 'src/subreddits/guards/subreddit-rbac.guard'
import { CreatePostDto, UpdatePostDto, VotePostDto } from './dto'
import { PostModBaseDto, PostModRemoveDto } from './dto/moderate-post.dto'

import { ApiTags } from '@nestjs/swagger'

@ApiTags('posts')
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @UseGuards(JwtAuthGuard)
  @HttpPost()
  create(@Body() body: CreatePostDto) {
    return this.posts.create(body as any)
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.posts.findById(id)
  }

  @Get()
  listAll(@Query('limit') limit = '50', @Query('skip') skip = '0', @Query('subreddit') subreddit?: string) {
    const filter: any = {}
    if (subreddit) {
      // allow passing subreddit name or id
      filter.subredditId = subreddit
    }
    return this.posts.findAll(filter, Number(limit), Number(skip))
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePostDto) {
    return this.posts.updateByAuthor(id, String(body.authorId), body as any)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body('authorId') authorId: string,
    @Body('deletionSignature') deletionSignature?: string
  ) {
    return this.posts.removeByAuthor(id, String(authorId), deletionSignature)
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
}
