import { Body, Controller, Delete, Get, Param, Patch, Post as HttpPost, UseGuards } from '@nestjs/common'
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

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdatePostDto) {
    return this.posts.updateByAuthor(id, String(body.authorId), body as any)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Body('authorId') authorId: string) {
    return this.posts.removeByAuthor(id, String(authorId))
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
  modRemove(@Param('id') id: string, @Body() body: PostModRemoveDto) {
    return this.posts.modRemove(id, String(body.subredditId), String(body.moderatorId), body.reason)
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
