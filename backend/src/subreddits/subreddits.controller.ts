import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Put,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ConflictException
} from '@nestjs/common'
import { SubredditsService } from './subreddits.service'
import { SubredditRbacGuard } from './guards/subreddit-rbac.guard'
import { CreateSubredditDto } from './dto/create-subreddit.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'

import { ApiTags } from '@nestjs/swagger'

@ApiTags('subreddits')
@Controller('subreddits')
export class SubredditsController {
  constructor(private readonly service: SubredditsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() body: CreateSubredditDto, @Req() req: any) {
    // Merge theme defaults from frontend globals.css variables when not provided
    const themeDefaults = {
      primary: '#053326',
      accent: '#053326',
      background: '#ffffff',
      foreground: '#000000'
    }

    const payload: any = {
      ...body,
      name: body.name?.toLowerCase().trim(),
      createdBy: req?.user?._id || req?.user?.id || null,
      theme: { ...(themeDefaults as any), ...(body as any).theme }
    }

    return this.service.create(payload)
  }

  @Get()
  async list(@Query('q') q?: string, @Query('limit') limit = '50', @Query('skip') skip = '0') {
    let filter: any = {}
    if (q) {
      filter = { $or: [{ displayName: { $regex: q, $options: 'i' } }, { name: { $regex: q, $options: 'i' } }] }
    }
    return this.service.findAll(filter, Number(limit), Number(skip))
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    return this.service.findOne(id)
  }

  @Put(':id')
  @UseGuards(SubredditRbacGuard)
  async update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(id, body)
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async join(@Param('id') id: string, @Req() req: any) {
    return this.service.join(id, req.user)
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leave(@Param('id') id: string, @Req() req: any) {
    return this.service.leave(id, req.user)
  }

  @Post(':id/kick')
  @UseGuards(JwtAuthGuard)
  async kick(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const { userId, reason, signature } = body || {}
    return this.service.kickUser(id, userId, req.user, reason, signature)
  }

  @Post(':id/ban')
  @UseGuards(JwtAuthGuard)
  async ban(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.banUser(id, body, req.user, body.signature)
  }

  @Delete(':id/ban/:userId')
  @UseGuards(JwtAuthGuard)
  async unban(@Param('id') id: string, @Param('userId') userId: string, @Req() req: any) {
    const signature = (req as any)?.body?.signature || undefined
    return this.service.unbanUser(id, userId, req.user, signature)
  }

  @Get(':id/is-moderator')
  @UseGuards(JwtAuthGuard)
  async isModerator(@Param('id') id: string, @Req() req: any) {
    // return boolean if the current request user is a moderator of this subreddit
    const user = req?.user
    if (!user || !user.id) return { isModerator: false }
    // delegate to service to check membership
    const m = await (this.service as any).memberModel
      .findOne({ subredditId: id, userId: new (require('mongoose').Types.ObjectId)(user.id) })
      .exec()
      .catch(() => null)
    const isMod = !!m && (BigInt(m.statusFlags) & BigInt(8)) !== BigInt(0)
    return { isModerator: isMod }
  }

  @Get(':id/moderators')
  @UseGuards(JwtAuthGuard)
  async listModerators(@Param('id') id: string) {
    return this.service.listModerators(id)
  }

  @Get(':id/modlogs')
  @UseGuards(JwtAuthGuard)
  async listModLogs(@Param('id') id: string, @Query('limit') limit = '50', @Query('skip') skip = '0') {
    return this.service.listModLogs(id, Number(limit), Number(skip))
  }

  @Get(':id/bans')
  @UseGuards(JwtAuthGuard)
  async listBans(@Param('id') id: string) {
    return this.service.listBans(id)
  }

  @Post(':id/moderators')
  @UseGuards(JwtAuthGuard)
  async addModerator(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.service.addModerator(id, body.userId, req.user)
  }

  @Delete(':id/moderators/:userId')
  @UseGuards(JwtAuthGuard)
  async removeModerator(@Param('id') id: string, @Param('userId') userId: string, @Req() req: any) {
    return this.service.removeModerator(id, userId, req.user)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.service.remove(id)
  }
  @Get('check-name/:name')
  async getByName(@Param('name') name: string) {
    const res = await this.service.nameAvailability(name)
    console.log(res)
    if (res != null) {
      // throw  409 Conflict
      throw new ConflictException('Subreddit name is already taken')
    } else {
      return { available: true }
    }
  }
}
