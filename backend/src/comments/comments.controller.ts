import { Body, Controller, Delete, Get, Param, Patch, Post as HttpPost, Query, UseGuards } from '@nestjs/common'
import { CommentsService } from './comments.service'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { SubredditRbacGuard } from 'src/subreddits/guards/subreddit-rbac.guard'
import { CreateCommentDto, UpdateCommentDto, VoteCommentDto } from './dto'
import { CommentModBaseDto, CommentModRemoveDto } from './dto/moderate-comment.dto'

import { ApiTags } from '@nestjs/swagger'

@ApiTags('comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @UseGuards(JwtAuthGuard)
  @HttpPost()
  create(@Body() body: CreateCommentDto) {
    return this.comments.create(body as any)
  }

  @Get()
  list(
    @Query('postId') postId?: string,
    @Query('limit') limit = '100',
    @Query('skip') skip = '0',
    @Query('q') searchQuery?: string
  ) {
    if (postId) {
      console.log('Fetching comments for postId:', postId, 'limit:', limit, 'skip:', skip)
      const result = this.comments.findByPost(postId, Number(limit), Number(skip))
      console.log('Comments query result:', result)
      return result
    }
    // Return all comments with optional search
    return this.comments.findAll(Number(limit), Number(skip), searchQuery)
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.comments.findById(id)
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateCommentDto) {
    return this.comments.updateByAuthor(id, String(body.authorId), body as any)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Body('authorId') authorId: string) {
    return this.comments.removeByAuthor(id, String(authorId))
  }

  @UseGuards(JwtAuthGuard)
  @HttpPost(':id/vote')
  vote(@Param('id') id: string, @Body() body: VoteCommentDto) {
    return this.comments.vote(id, body.delta)
  }

  // Moderation routes
  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/approve')
  modApprove(@Param('id') id: string, @Body() body: CommentModBaseDto) {
    return this.comments.modApprove(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/remove')
  modRemove(@Param('id') id: string, @Body() body: CommentModRemoveDto) {
    return this.comments.modRemove(id, String(body.subredditId), String(body.moderatorId), body.reason)
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/collapse')
  modCollapse(@Param('id') id: string, @Body() body: CommentModBaseDto) {
    return this.comments.modCollapse(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/uncollapse')
  modUncollapse(@Param('id') id: string, @Body() body: CommentModBaseDto) {
    return this.comments.modUncollapse(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/flag')
  modFlag(@Param('id') id: string, @Body() body: CommentModBaseDto) {
    return this.comments.modFlag(id, String(body.subredditId), String(body.moderatorId))
  }

  @UseGuards(JwtAuthGuard, SubredditRbacGuard)
  @HttpPost(':id/mod/unflag')
  modUnflag(@Param('id') id: string, @Body() body: CommentModBaseDto) {
    return this.comments.modUnflag(id, String(body.subredditId), String(body.moderatorId))
  }
}
