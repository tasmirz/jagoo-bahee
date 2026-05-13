import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { CreateMessageDto } from './dto/create-message.dto'
import { QueryMessagesDto } from './dto/query-messages.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { ReplyMessageDto } from './dto/reply-message.dto'
import { AbuseRateLimiterService } from 'src/common/abuse-rate-limiter.service'

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly abuseLimiter: AbuseRateLimiterService
  ) {}

  @Post()
  async send(@Req() req: any, @Body() dto: CreateMessageDto) {
    await this.abuseLimiter.hit('message-send', this.abuseLimiter.tracker(req, String(req.user.id), dto.recipientId), Number(process.env.MESSAGE_SEND_LIMIT || 60), Number(process.env.MESSAGE_SEND_WINDOW_MS || 60 * 60 * 1000))
    return this.messagesService.send(req.user.id, dto)
  }

  @Post('reply')
  async reply(@Req() req: any, @Body() dto: ReplyMessageDto) {
    await this.abuseLimiter.hit('message-reply', this.abuseLimiter.tracker(req, String(req.user.id), dto.parentMessageId), Number(process.env.MESSAGE_REPLY_LIMIT || 120), Number(process.env.MESSAGE_REPLY_WINDOW_MS || 60 * 60 * 1000))
    return this.messagesService.reply(req.user.id, dto)
  }

  @Get()
  async list(@Req() req: any, @Query() query: QueryMessagesDto) {
    return this.messagesService.list(req.user.id, query)
  }

  @Get('conversations')
  async conversations(@Req() req: any) {
    return this.messagesService.conversations(req.user.id)
  }

  @Get('conversation/:peerId')
  async conversation(@Req() req: any, @Param('peerId') peerId: string) {
    return this.messagesService.conversation(req.user.id, peerId)
  }

  @Patch('conversation/:peerId/read')
  async markConversationRead(@Req() req: any, @Param('peerId') peerId: string) {
    return this.messagesService.markConversationRead(req.user.id, peerId)
  }

  @Patch('read')
  async markRead(@Req() req: any, @Body('ids') ids: string[] | 'all') {
    return this.messagesService.markRead(req.user.id, ids)
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.messagesService.delete(req.user.id, id)
  }
}
