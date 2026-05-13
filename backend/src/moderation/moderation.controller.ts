import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, HttpException } from '@nestjs/common'
import { getServerPublicKeyBase64, serverKeyId } from 'src/common/server-sign.util'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Report } from './schemas/report.schema'
import { ModerationEventsService } from './moderation-events.service'

@ApiTags('moderation')
@Controller('moderation')
export class ModerationController {
  constructor(
    @InjectModel(Report.name) private reportModel: Model<Report>,
    private readonly moderationEvents: ModerationEventsService
  ) {}

  @Get('server-public-key')
  getServerPublicKey() {
    return { keyId: serverKeyId, publicKey: getServerPublicKeyBase64() }
  }

  // Create a report
  @UseGuards(JwtAuthGuard)
  @Post('reports')
  async createReport(@Body() body: any, @Req() req: any) {
    const report = await this.reportModel.create({
      reporterId: new Types.ObjectId(req.user.id),
      targetId: new Types.ObjectId(body.targetId),
      targetType: body.targetType,
      subredditId: new Types.ObjectId(body.subredditId),
      reason: body.reason,
      description: body.description,
      status: 'pending'
    })
    return report
  }

  // Get reports for a subreddit (mod queue)
  @UseGuards(JwtAuthGuard)
  @Get('subreddits/:subredditId/reports')
  async getSubredditReports(
    @Param('subredditId') subredditId: string,
    @Query('status') status?: string,
    @Query('limit') limit = '50',
    @Query('skip') skip = '0'
  ) {
    const filter: any = { subredditId: new Types.ObjectId(subredditId) }
    if (status) {
      filter.status = status
    }

    const reports = await this.reportModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip(Number(skip))
      .populate('reporterId', 'username displayName avatar')
      .populate('reviewedBy', 'username displayName avatar')
      .lean()
      .exec()

    return reports
  }

  // Get specific report
  @UseGuards(JwtAuthGuard)
  @Get('reports/:id')
  async getReport(@Param('id') id: string) {
    const report = await this.reportModel
      .findById(id)
      .populate('reporterId', 'username displayName avatar')
      .populate('reviewedBy', 'username displayName avatar')
      .lean()
      .exec()
    return report
  }

  // Update report status
  @UseGuards(JwtAuthGuard)
  @Put('reports/:id')
  async updateReport(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const update: any = {}
    if (body.status) update.status = body.status
    if (body.actionTaken) update.actionTaken = body.actionTaken

    if (body.status === 'reviewed' || body.status === 'resolved' || body.status === 'dismissed') {
      update.reviewedBy = new Types.ObjectId(req.user.id)
      update.reviewedAt = new Date()
    }

    const report = await this.reportModel.findByIdAndUpdate(id, update, { new: true })
    return report
  }

  // Delete report
  @UseGuards(JwtAuthGuard)
  @Delete('reports/:id')
  async deleteReport(@Param('id') id: string) {
    await this.reportModel.findByIdAndDelete(id)
    return { success: true }
  }

  // Get reports count for a subreddit
  @UseGuards(JwtAuthGuard)
  @Get('subreddits/:subredditId/reports/count')
  async getReportsCount(@Param('subredditId') subredditId: string) {
    // Validate ObjectId format
    if (!Types.ObjectId.isValid(subredditId)) {
      throw new HttpException('Invalid subreddit ID format', 400)
    }

    const pending = await this.reportModel.countDocuments({
      subredditId: new Types.ObjectId(subredditId),
      status: 'pending'
    })

    const total = await this.reportModel.countDocuments({
      subredditId: new Types.ObjectId(subredditId)
    })

    return { pending, total }
  }

  @UseGuards(JwtAuthGuard)
  @Get('subreddits/:subredditId/events')
  async getModerationEvents(
    @Param('subredditId') subredditId: string,
    @Query('limit') limit = '50',
    @Query('skip') skip = '0'
  ) {
    return this.moderationEvents.listForSubreddit(subredditId, Number(limit), Number(skip))
  }

  @UseGuards(JwtAuthGuard)
  @Get('events/:targetType/:targetId')
  async getTargetModerationEvents(@Param('targetType') targetType: string, @Param('targetId') targetId: string, @Query('limit') limit = '50') {
    return this.moderationEvents.findByTarget(targetType, targetId, Number(limit))
  }
}
