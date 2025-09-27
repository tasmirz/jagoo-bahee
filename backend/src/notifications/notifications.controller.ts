import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { CreateNotificationDto } from './dto/create-notification.dto'
import { QueryNotificationsDto } from './dto/query-notifications.dto'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard'

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  async create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto)
  }

  @Get()
  async list(@Req() req: any, @Query() query: QueryNotificationsDto) {
    const userId = query.userId ?? req.user.userId
    return this.notificationsService.list(userId, query)
  }

  @Patch('read')
  async markRead(@Req() req: any, @Body('ids') ids: string[] | 'all') {
    return this.notificationsService.markRead(req.user.userId, ids)
  }

  @Patch('unread')
  async markUnread(@Req() req: any, @Body('ids') ids: string[]) {
    return this.notificationsService.markUnread(req.user.userId, ids)
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.notificationsService.remove(req.user.userId, id)
  }
}
