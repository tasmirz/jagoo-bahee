import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Role } from './schemas/role.schema'
import { UserRole } from './schemas/user-role.schema'
import { SubredditsService } from 'src/subreddits/subreddits.service'
import { SubredditPermissionsCacheService } from 'src/subreddits/subreddit-permissions-cache.service'

@ApiTags('roles')
@Controller('roles')
export class RolesController {
  constructor(
    @InjectModel(Role.name) private roleModel: Model<Role>,
    @InjectModel(UserRole.name) private userRoleModel: Model<UserRole>,
    private subredditsService: SubredditsService,
    private permissionsCache: SubredditPermissionsCacheService
  ) {}

  // Get all roles for a subreddit
  @Get('subreddit/:subredditName')
  @UseGuards(JwtAuthGuard)
  async getRolesForSubreddit(@Param('subredditName') subredditName: string) {
    const subreddit = await this.subredditsService.findOne(subredditName)
    if (!subreddit) return []

    return this.roleModel.find({ subredditId: subreddit._id }).exec()
  }

  // Create a new role
  @Post()
  @UseGuards(JwtAuthGuard)
  async createRole(@Body() body: any, @Req() req: any) {
    const { name, subredditName, permissions } = body

    const subreddit = await this.subredditsService.findOne(subredditName)
    if (!subreddit) {
      throw new Error('Subreddit not found')
    }

    const role = await this.roleModel.create({
      name,
      subredditId: subreddit._id,
      permissions: BigInt(permissions || 0),
      isSystemRole: false
    })

    return role
  }

  // Update role permissions
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateRole(@Param('id') id: string, @Body() body: any) {
    const { permissions } = body

    const role = await this.roleModel.findByIdAndUpdate(id, { permissions: BigInt(permissions) }, { new: true }).exec()

    // Invalidate cache for all users in this subreddit since permissions changed
    if (role && role.subredditId) {
      await this.permissionsCache.invalidateSubreddit(String(role.subredditId))
    }

    return role
  }

  // Delete a role
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteRole(@Param('id') id: string) {
    // Don't allow deleting system roles
    const role = await this.roleModel.findById(id).exec()
    if (role?.isSystemRole) {
      throw new Error('Cannot delete system roles')
    }

    // Remove all user assignments of this role
    await this.userRoleModel.deleteMany({ roleId: new Types.ObjectId(id) }).exec()

    // Delete the role
    await this.roleModel.findByIdAndDelete(id).exec()

    return { success: true }
  }

  // Assign role to user
  @Post(':roleId/assign/:userId')
  @UseGuards(JwtAuthGuard)
  async assignRole(@Param('roleId') roleId: string, @Param('userId') userId: string, @Req() req: any) {
    const role = await this.roleModel.findById(roleId).exec()
    if (!role) throw new Error('Role not found')

    // Check if assignment already exists
    const existing = await this.userRoleModel
      .findOne({
        userId: new Types.ObjectId(userId),
        roleId: new Types.ObjectId(roleId),
        subredditId: role.subredditId
      })
      .exec()

    if (existing) {
      return existing
    }

    const userRole = await this.userRoleModel.create({
      userId: new Types.ObjectId(userId),
      roleId: new Types.ObjectId(roleId),
      subredditId: role.subredditId,
      assignedBy: new Types.ObjectId(req.user.id)
    })

    // Invalidate cache for this specific user-subreddit combination
    if (role.subredditId) {
      await this.permissionsCache.invalidateModeratorStatus(String(role.subredditId), userId)
    }

    return userRole
  }

  // Remove role from user
  @Delete(':roleId/revoke/:userId')
  @UseGuards(JwtAuthGuard)
  async revokeRole(@Param('roleId') roleId: string, @Param('userId') userId: string) {
    const role = await this.roleModel.findById(roleId).exec()

    await this.userRoleModel
      .deleteOne({
        userId: new Types.ObjectId(userId),
        roleId: new Types.ObjectId(roleId)
      })
      .exec()

    // Invalidate cache for this specific user-subreddit combination
    if (role && role.subredditId) {
      await this.permissionsCache.invalidateModeratorStatus(String(role.subredditId), userId)
    }

    return { success: true }
  }
}
