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
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Role } from 'src/roles/schemas/role.schema'
import { UserRole } from 'src/roles/schemas/user-role.schema'
import { SubredditPermissionsCacheService } from './subreddit-permissions-cache.service'

import { ApiTags } from '@nestjs/swagger'

@ApiTags('subreddits')
@Controller('subreddits')
export class SubredditsController {
  constructor(
    private readonly service: SubredditsService,
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
    private permissionsCache: SubredditPermissionsCacheService
  ) {}

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
    console.log('[is-moderator] Request for subreddit:', id)

    // Return boolean if the current request user is a moderator of this subreddit
    const user = req?.user
    console.log('[is-moderator] User from JWT:', user?.id)

    if (!user || !user.id) {
      console.log('[is-moderator] No user, returning false')
      return { isModerator: false, isCreator: false, isBanned: false, statusFlags: 0 }
    }

    // Get user from auth
    const userDoc = await (this.service as any).usersService.findByAuthId(
      new (require('mongoose').Types.ObjectId)(user.id)
    )
    console.log('[is-moderator] User doc found:', userDoc?._id)

    if (!userDoc) {
      console.log('[is-moderator] No user doc found')
      return { isModerator: false, isCreator: false, isBanned: false, statusFlags: 0 }
    }

    // Check if user is the creator (via subreddit.createdBy)
    // Use findOne to support both ID and name
    const subreddit = await this.service.findOne(id)

    if (!subreddit) {
      console.log('[is-moderator] Subreddit not found')
      return { isModerator: false, isCreator: false, isBanned: false, statusFlags: 0 }
    }

    // Check cache first
    const cached = await this.permissionsCache.getModeratorStatus(String(subreddit._id), String(userDoc._id))

    if (cached) {
      console.log('[is-moderator] Returning cached result')
      return {
        isModerator: cached.isModerator,
        isCreator: cached.isCreator,
        isBanned: cached.isBanned,
        statusFlags: cached.statusFlags
      }
    }

    // Cache miss - perform full check
    console.log('[is-moderator] Cache miss, performing full check')

    const isCreator = subreddit && String(subreddit.createdBy) === String(userDoc._id)
    console.log('[is-moderator] Creator check:', {
      subredditCreatedBy: subreddit?.createdBy,
      userId: userDoc._id,
      isCreator
    })

    // Check banned status from SubredditMember
    const m = await (this.service as any).memberModel
      .findOne({ subredditId: subreddit._id, userId: new (require('mongoose').Types.ObjectId)(userDoc._id) })
      .exec()
      .catch(() => null)

    if (!m) {
      console.log('[is-moderator] No member record found, returning isCreator only')
      return { isModerator: isCreator, isCreator, isBanned: false, statusFlags: 0 }
    }

    const flags = BigInt(m.statusFlags || 0)
    const isBanned = (flags & BigInt(1)) !== BigInt(0) // Bit 0

    // Check if user has a moderator role with permissions
    // Step 1: Get user's role assignment from UserRole
    const userRole = await this.userRoleModel
      .findOne({
        subredditId: subreddit._id,
        userId: new (require('mongoose').Types.ObjectId)(userDoc._id)
      })
      .exec()
      .catch(() => null)

    let hasModPermissions = false

    if (userRole) {
      // Step 2: Get the role and check permissions from Role schema
      const role = await this.roleModel
        .findById(userRole.roleId)
        .exec()
        .catch(() => null)

      if (role) {
        const permissions = BigInt(role.permissions || 0)
        // Check if role has ANY moderator permissions
        // Moderator permissions: bits 15-19 (moderation) + bits 23-27 (settings) + bit 28 (all)
        const modPermissionsMask = BigInt(0x1ffff8000) // Bits 15-28
        hasModPermissions = (permissions & modPermissionsMask) !== BigInt(0)

        console.log('[is-moderator] Role check:', {
          roleId: role._id,
          roleName: role.name,
          permissions: permissions.toString(),
          hasModPermissions
        })
      }
    }

    const hasModAccess = (isCreator || hasModPermissions) && !isBanned

    const result = {
      isModerator: hasModAccess,
      isCreator,
      isBanned,
      statusFlags: Number(flags)
    }

    console.log('[is-moderator] Final result:', result)

    // Cache the result for 5 minutes
    await this.permissionsCache.setModeratorStatus(String(subreddit._id), String(userDoc._id), {
      ...result,
      hasModPermissions,
      roleId: userRole?.roleId ? String(userRole.roleId) : undefined,
      roleName: userRole ? 'assigned' : undefined,
      permissions: hasModPermissions ? 'has_mod_perms' : 'none'
    })

    return result
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
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string, @Req() req: any) {
    // Only the creator can delete the subreddit
    await this.service.deleteSubreddit(id, req.user)
  }

  @Post(':id/transfer-ownership')
  @UseGuards(JwtAuthGuard)
  async transferOwnership(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const { newOwnerId } = body
    return this.service.transferOwnership(id, req.user, newOwnerId)
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

  @Post(':id/fix-creator-flags')
  @UseGuards(JwtAuthGuard)
  async fixCreatorFlags(@Param('id') id: string, @Req() req: any) {
    // Migration endpoint to fix creator statusFlags for existing subreddits
    return this.service.fixCreatorFlags(id, req.user)
  }
}
