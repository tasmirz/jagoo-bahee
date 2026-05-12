import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { Report } from './schemas/report.schema'

@Controller('reports')
export class ReportsController {
  constructor(@InjectModel(Report.name) private readonly reports: Model<Report>) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Req() req: any, @Body() body: any) {
    return this.reports.create({
      reporterId: new Types.ObjectId(String(req.user.id)),
      targetId: new Types.ObjectId(String(body.targetId)),
      targetType: body.targetType,
      subredditId: new Types.ObjectId(String(body.subredditId)),
      reason: body.reason || 'other',
      description: body.description,
      status: 'pending'
    })
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query('subredditId') subredditId?: string, @Query('status') status?: string) {
    const filter: any = {}
    if (subredditId && Types.ObjectId.isValid(subredditId)) filter.subredditId = new Types.ObjectId(subredditId)
    if (status) filter.status = status
    return this.reports.find(filter).sort({ createdAt: -1 }).limit(100).lean().exec()
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/review')
  async review(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.reports.findByIdAndUpdate(
      id,
      { status: 'reviewed', reviewedBy: new Types.ObjectId(String(req.user.id)), reviewedAt: new Date(), actionTaken: body.actionTaken || 'none' },
      { new: true }
    )
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/dismiss')
  async dismiss(@Req() req: any, @Param('id') id: string) {
    return this.reports.findByIdAndUpdate(
      id,
      { status: 'dismissed', reviewedBy: new Types.ObjectId(String(req.user.id)), reviewedAt: new Date(), actionTaken: 'none' },
      { new: true }
    )
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/resolve')
  async resolve(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.reports.findByIdAndUpdate(
      id,
      { status: 'resolved', reviewedBy: new Types.ObjectId(String(req.user.id)), reviewedAt: new Date(), actionTaken: body.actionTaken || 'removed' },
      { new: true }
    )
  }
}
