import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { MessagesService } from './messages.service'
import { CreateMessageDto } from './dto/create-message.dto'
import { QueryMessagesDto } from './dto/query-messages.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'
import { ReplyMessageDto } from './dto/reply-message.dto'

@UseGuards(JwtAuthGuard)
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Post()
  async send(@Req() req: any, @Body() dto: CreateMessageDto) {
    return this.messagesService.send(req.user.id, dto)
  }

  @Post('reply')
  async reply(@Req() req: any, @Body() dto: ReplyMessageDto) {
    return this.messagesService.reply(req.user.id, dto)
  }

  @Get()
  async list(@Req() req: any, @Query() query: QueryMessagesDto) {
    return this.messagesService.list(req.user.id, query)
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
