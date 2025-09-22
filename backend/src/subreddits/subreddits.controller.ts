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
  Req
} from '@nestjs/common'
import { SubredditsService } from './subreddits.service'
import { SubredditRbacGuard } from './guards/subreddit-rbac.guard'
import { CreateSubredditDto } from './dto/create-subreddit.dto'

import { ApiTags } from '@nestjs/swagger'

@ApiTags('subreddits')
@Controller('subreddits')
export class SubredditsController {
  constructor(private readonly service: SubredditsService) {}

  @Post()
  async create(@Body() body: CreateSubredditDto) {
    return this.service.create(body as any)
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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    await this.service.remove(id)
  }
}
