import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AwardsService } from './awards.service'
import { CreateAwardTypeDto } from './dto/create-award-type.dto'
import { UpdateAwardTypeDto } from './dto/update-award-type.dto'
import { QueryAwardTypesDto } from './dto/query-award-types.dto'
import { CreateAwardDto } from './dto/create-award.dto'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'

@Controller('awards')
export class AwardsController {
  constructor(private readonly awardsService: AwardsService) {}

  // Award Types
  @Post('types')
  @UseGuards(JwtAuthGuard)
  async createType(@Body() dto: CreateAwardTypeDto) {
    return this.awardsService.createAwardType(dto)
  }

  @Get('types')
  async listTypes(@Query() query: QueryAwardTypesDto) {
    return this.awardsService.listAwardTypes(query)
  }

  @Get('types/:id')
  async getType(@Param('id') id: string) {
    return this.awardsService.getAwardType(id)
  }

  @Patch('types/:id')
  @UseGuards(JwtAuthGuard)
  async updateType(@Param('id') id: string, @Body() dto: UpdateAwardTypeDto) {
    return this.awardsService.updateAwardType(id, dto)
  }

  @Delete('types/:id')
  @UseGuards(JwtAuthGuard)
  async deleteType(@Param('id') id: string) {
    return this.awardsService.deleteAwardType(id)
  }

  // Awards
  @Post()
  @UseGuards(JwtAuthGuard)
  async give(@Req() req: any, @Body() dto: CreateAwardDto) {
    return this.awardsService.giveAward(req.user.userId, dto)
  }

  @Get('target/:type/:id')
  async listForTarget(@Param('type') type: 'post' | 'comment', @Param('id') id: string) {
    return this.awardsService.listAwardsForTarget(id, type as 'post' | 'comment')
  }
}
